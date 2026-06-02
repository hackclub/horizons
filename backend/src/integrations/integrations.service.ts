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
    const yesterdayStart = new Date();
    yesterdayStart.setUTCHours(0, 0, 0, 0);
    yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);

    const [pinnedCount, hourGoalSplit, dauYesterday, hours, qualification] =
      await Promise.all([
        this.prisma.pinnedEvent.count({ where: { eventId } }),
        this.computeHourGoalSplit(eventId, event.hourCost),
        this.fetchDauForDate(slug, yesterdayStart),
        this.computeHourTotals(eventId),
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
      hours,
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

  // Aggregate hour buckets across users pinned to the sub-event. Bucket
  // definitions mirror AdminService.exportAllUsersCsv so totals reconcile with
  // the dashboard / CSV export.
  private async computeHourTotals(eventId: number) {
    const [
      approvedRows,
      inReviewRows,
      unsubmittedRows,
      submittedRows,
      trackedRows,
    ] = await Promise.all([
      this.prisma.$queryRaw<{ hours: number }[]>`
        SELECT COALESCE(SUM(s.approved_hours), 0) AS hours
        FROM submissions s
        JOIN projects p ON p.project_id = s.project_id
        JOIN pinned_events pe ON pe.user_id = p.user_id
        WHERE pe.event_id = ${eventId}
          AND s.approval_status = 'approved'
          AND p.joe_fraud_passed = true
          AND p.deleted_at IS NULL
          AND s.created_at = (
            SELECT MAX(s2.created_at) FROM submissions s2
            WHERE s2.project_id = p.project_id
          )
      `,
      this.prisma.$queryRaw<{ hours: number }[]>`
        SELECT COALESCE(SUM(p.now_hackatime_hours), 0) AS hours
        FROM projects p
        JOIN pinned_events pe ON pe.user_id = p.user_id
        WHERE pe.event_id = ${eventId}
          AND p.deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM submissions s
            WHERE s.project_id = p.project_id
              AND s.approval_status = 'pending'
              AND s.review_passed IS NULL
              AND s.created_at = (
                SELECT MAX(s2.created_at) FROM submissions s2
                WHERE s2.project_id = p.project_id
              )
          )
      `,
      this.prisma.$queryRaw<{ hours: number }[]>`
        SELECT COALESCE(SUM(p.now_hackatime_hours), 0) AS hours
        FROM projects p
        JOIN pinned_events pe ON pe.user_id = p.user_id
        WHERE pe.event_id = ${eventId}
          AND p.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM submissions s WHERE s.project_id = p.project_id
          )
      `,
      this.prisma.$queryRaw<{ hours: number }[]>`
        SELECT COALESCE(SUM(p.now_hackatime_hours), 0) AS hours
        FROM projects p
        JOIN pinned_events pe ON pe.user_id = p.user_id
        WHERE pe.event_id = ${eventId}
          AND p.deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM submissions s WHERE s.project_id = p.project_id
          )
      `,
      this.prisma.$queryRaw<{ hours: number }[]>`
        SELECT COALESCE(SUM(p.now_hackatime_hours), 0) AS hours
        FROM projects p
        JOIN pinned_events pe ON pe.user_id = p.user_id
        WHERE pe.event_id = ${eventId}
          AND p.deleted_at IS NULL
      `,
    ]);

    return {
      approvedHours: Number(approvedRows[0]?.hours ?? 0),
      hoursInReview: Number(inReviewRows[0]?.hours ?? 0),
      unsubmittedHours: Number(unsubmittedRows[0]?.hours ?? 0),
      submittedHours: Number(submittedRows[0]?.hours ?? 0),
      trackedHours: Number(trackedRows[0]?.hours ?? 0),
    };
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
