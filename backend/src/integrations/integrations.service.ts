import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EventStatsResponse } from './response/event-stats.response';

@Injectable()
export class IntegrationsService {
  constructor(private prisma: PrismaService) {}

  async getReferralBySlackId(slackId: string) {
    const user = await this.prisma.user.findUnique({
      where: { slackUserId: slackId },
      select: {
        referralCode: true,
        _count: { select: { referrals: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('No user found for that Slack ID');
    }

    return {
      referralCode: user.referralCode,
      referralCount: user._count.referrals,
    };
  }

  /**
   * Aggregated stats for a single sub-event, intended for external
   * dashboards / "how are we doing" graphs.
   *
   * Looks up the event by slug first, then falls back to a case-insensitive
   * title match so callers can pass either identifier.
   */
  async getEventStatsByName(name: string): Promise<EventStatsResponse> {
    const event = await this.findEventByName(name);
    if (!event) {
      throw new NotFoundException(`No sub-event found matching "${name}"`);
    }

    const eventId = event.eventId;
    const slug = event.slug;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    const yesterdayStart = new Date();
    yesterdayStart.setUTCHours(0, 0, 0, 0);
    yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);

    const [pinnedCount, hourGoalSplit, dauYesterday, pinnedTimeline, dauTimeline, qualification] =
      await Promise.all([
        this.prisma.pinnedEvent.count({ where: { eventId } }),
        this.computeHourGoalSplit(eventId, event.hourCost),
        this.fetchDauForDate(slug, yesterdayStart),
        this.buildPinnedTimeline(eventId, thirtyDaysAgo),
        this.buildDauTimeline(slug, thirtyDaysAgo),
        this.computeQualificationFunnel(eventId),
      ]);

    return {
      event: {
        eventId: event.eventId,
        slug: event.slug,
        title: event.title,
        description: event.description,
        imageUrl: event.imageUrl,
        location: event.location,
        country: event.country,
        startDate: event.startDate,
        endDate: event.endDate,
        hourCost: event.hourCost,
        ticketThreshold: event.ticketThreshold,
        ticketCost: event.ticketCost,
        ticketEnabled: event.ticketEnabled,
        isActive: event.isActive,
      },
      pinnedCount,
      metHourGoal: hourGoalSplit.met,
      notMetHourGoal: hourGoalSplit.notMet,
      dauYesterday,
      pinnedTimeline,
      dauTimeline,
      qualification,
      generatedAt: new Date().toISOString(),
    };
  }

  private async findEventByName(name: string) {
    const bySlug = await this.prisma.event.findUnique({ where: { slug: name } });
    if (bySlug) return bySlug;
    return this.prisma.event.findFirst({
      where: { title: { equals: name, mode: 'insensitive' } },
    });
  }

  // Splits pinned users into those who have reached the event's approved-hour
  // goal and those who haven't. Approved hours sum across all of the user's
  // projects (matches the admin dashboard definition).
  private async computeHourGoalSplit(eventId: number, hourCost: number) {
    const pinnedUsers = await this.prisma.pinnedEvent.findMany({
      where: { eventId },
      select: {
        user: { select: { projects: { select: { approvedHours: true } } } },
      },
    });

    let met = 0;
    let notMet = 0;
    for (const pin of pinnedUsers) {
      const total = pin.user.projects.reduce(
        (sum, p) => sum + (p.approvedHours ?? 0),
        0,
      );
      if (total >= hourCost) met++;
      else notMet++;
    }
    return { met, notMet };
  }

  private async fetchDauForDate(slug: string, date: Date): Promise<number> {
    const row = await this.prisma.historicalMetric.findUnique({
      where: { date_metric: { date, metric: `dau_event.${slug}` } },
    });
    if (!row) return 0;
    return typeof row.value === 'number' ? row.value : Number(row.value) || 0;
  }

  // Cumulative pinned count, one point per day for the last 30 days.
  // Back-calculates the starting cumulative from the current total minus the
  // pins created in-window, so the line ends at the live pinned count.
  private async buildPinnedTimeline(eventId: number, since: Date) {
    const daily = await this.prisma.$queryRaw<
      Array<{ date: Date; count: bigint }>
    >`
      SELECT DATE(pe.created_at) as date, COUNT(*) as count
      FROM pinned_events pe
      WHERE pe.event_id = ${eventId}
        AND pe.created_at >= ${since}
      GROUP BY DATE(pe.created_at)
      ORDER BY date ASC
    `;

    const totalNow = await this.prisma.pinnedEvent.count({ where: { eventId } });
    const inWindow = daily.reduce((s, d) => s + Number(d.count), 0);
    let cumulative = totalNow - inWindow;

    return daily.map((d) => {
      cumulative += Number(d.count);
      return { date: d.date.toISOString().split('T')[0], value: cumulative };
    });
  }

  private async buildDauTimeline(slug: string, since: Date) {
    const rows = await this.prisma.historicalMetric.findMany({
      where: { metric: `dau_event.${slug}`, date: { gte: since } },
      orderBy: { date: 'asc' },
    });
    return rows.map((r) => ({
      date: r.date.toISOString().split('T')[0],
      value: typeof r.value === 'number' ? r.value : Number(r.value) || 0,
    }));
  }

  // Engagement funnel for pinned users, bucketed by total approved hours.
  // Definitions mirror admin's getEventStats so dashboards stay consistent.
  private async computeQualificationFunnel(eventId: number) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        signed_up: bigint;
        engaged: bigint;
        rsvped: bigint;
        qualified: bigint;
      }>
    >`
      SELECT
        COUNT(pe.id) AS signed_up,
        COUNT(*) FILTER (WHERE COALESCE(ut.approved_total, 0) >= 1) AS engaged,
        COUNT(*) FILTER (WHERE COALESCE(ut.approved_total, 0) >= 15) AS rsvped,
        COUNT(*) FILTER (WHERE COALESCE(ut.approved_total, 0) >= 30) AS qualified
      FROM pinned_events pe
      LEFT JOIN (
        SELECT
          p.user_id,
          SUM(COALESCE(p.approved_hours, 0)) AS approved_total
        FROM projects p
        GROUP BY p.user_id
      ) ut ON ut.user_id = pe.user_id
      WHERE pe.event_id = ${eventId}
    `;
    const row = rows[0];
    return {
      signedUp: Number(row?.signed_up ?? 0),
      engaged: Number(row?.engaged ?? 0),
      rsvped: Number(row?.rsvped ?? 0),
      qualified: Number(row?.qualified ?? 0),
    };
  }
}
