import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { StreakService } from '../streaks/streak.service';

@Injectable()
export class MetricsSnapshotService implements OnModuleInit {
  private readonly logger = new Logger(MetricsSnapshotService.name);

  constructor(
    private prisma: PrismaService,
    private metricsService: MetricsService,
    private streakService: StreakService,
  ) {}

  async onModuleInit() {
    // On startup, snapshot yesterday if it doesn't exist yet
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);

    const existing = await this.prisma.historicalMetric.findFirst({
      where: { date: yesterday, metric: 'dau' },
    });

    if (!existing) {
      this.logger.log(`No snapshot for yesterday (${yesterday.toISOString().split('T')[0]}), running on startup...`);
      // Run in background so it doesn't block startup
      this.snapshotDate(yesterday).catch((err) =>
        this.logger.error(`Startup snapshot failed: ${err.message}`),
      );
    } else {
      this.logger.log('Yesterday snapshot already exists, skipping startup snapshot.');
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailySnapshot() {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);

    this.logger.log(`Running daily metrics snapshot for ${yesterday.toISOString().split('T')[0]}`);
    await this.snapshotDate(yesterday);
  }

  async snapshotDate(date: Date): Promise<number> {
    const dayStart = new Date(date);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setUTCHours(23, 59, 59, 999);

    const metrics = await this.computeMetrics(dayStart, dayEnd);

    for (const [metric, value] of Object.entries(metrics)) {
      await this.prisma.historicalMetric.upsert({
        where: { date_metric: { date: dayStart, metric } },
        update: { value: value as any },
        create: { date: dayStart, metric, value: value as any },
      });
    }

    const count = Object.keys(metrics).length;
    this.logger.log(`Snapshot complete for ${dayStart.toISOString().split('T')[0]}: ${count} metrics`);
    return count;
  }

  async backfill(startDate: Date, endDate: Date, noOverwrite = false) {
    const results: { date: string; metricsCount: number; skipped?: boolean }[] = [];
    const current = new Date(startDate);
    current.setUTCHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setUTCHours(0, 0, 0, 0);

    while (current <= end) {
      if (noOverwrite) {
        const dayStart = new Date(current);
        dayStart.setUTCHours(0, 0, 0, 0);
        const existing = await this.prisma.historicalMetric.count({
          where: { date: dayStart },
        });
        if (existing > 0) {
          this.logger.log(`Skipping ${dayStart.toISOString().split('T')[0]}: ${existing} metrics already exist`);
          results.push({
            date: current.toISOString().split('T')[0],
            metricsCount: existing,
            skipped: true,
          });
          current.setUTCDate(current.getUTCDate() + 1);
          continue;
        }
      }

      const count = await this.snapshotDate(new Date(current));
      results.push({
        date: current.toISOString().split('T')[0],
        metricsCount: count,
      });
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return results;
  }

  private async computeMetrics(
    dayStart: Date,
    dayEnd: Date,
  ): Promise<Record<string, unknown>> {
    const dateRange = { gte: dayStart, lte: dayEnd };
    const beforeEnd = { lte: dayEnd };

    // Single Hackatime API call for both DAU and daily hours
    const hackatimeDaily = await this.computeHackatimeDaily(dayStart);

    const [
      newSignups,
      submissionsCreated,
      reviewsCompleted,
      medianReviewTime,
      medianFraudCheckTime,
      totalUsers,
      totalProjects,
      trackedHoursAgg,
      approvedHoursAgg,
      funnelData,
      reviewHoursData,
      reviewProjectsData,
      signupPerEvent,
      utmSources,
    ] = await Promise.all([
      this.prisma.user.count({ where: { createdAt: dateRange } }),
      this.prisma.submission.count({ where: { createdAt: dateRange } }),
      this.prisma.submission.count({ where: { reviewedAt: dateRange } }),
      this.computeMedianReviewTime(dayStart, dayEnd),
      this.computeMedianFraudCheckTime(dayStart, dayEnd),
      this.prisma.user.count({ where: { createdAt: beforeEnd } }),
      this.prisma.project.count({ where: { createdAt: beforeEnd } }),
      this.prisma.project.aggregate({ _sum: { nowHackatimeHours: true }, where: { createdAt: beforeEnd } }),
      this.prisma.project.aggregate({ _sum: { approvedHours: true }, where: { createdAt: beforeEnd } }),
      this.computeFunnel(dayEnd),
      this.metricsService.computeReviewHours(dayEnd),
      this.metricsService.computeReviewProjects(dayEnd),
      this.computeSignupPerEvent(dayEnd),
      this.computeUtmSources(dayEnd),
    ]);

    // Per-event DAU is derived from the same Hackatime activity as the
    // top-level DAU so the per-event sums reconcile (an active user is
    // attributed to their pinned event, if any).
    const dauPerEvent = hackatimeDaily.dauPerEvent;

    const metrics: Record<string, unknown> = {
      dau: hackatimeDaily.dau,
      new_signups: newSignups,
      submissions_created: submissionsCreated,
      reviews_completed: reviewsCompleted,
      median_review_time_hours: medianReviewTime,
      median_fraud_check_time_hours: medianFraudCheckTime,
      total_users: totalUsers,
      total_projects: totalProjects,
      total_tracked_hours: trackedHoursAgg._sum.nowHackatimeHours ?? 0,
      total_approved_hours: approvedHoursAgg._sum.approvedHours ?? 0,
      daily_hours_logged: hackatimeDaily.totalHours,
      funnel: funnelData,
      review_hours: reviewHoursData,
      review_projects: reviewProjectsData,
      signup_per_event: signupPerEvent,
      utm_sources: utmSources,
    };

    // Add per-event DAU as separate metric keys
    for (const { slug, count } of dauPerEvent) {
      metrics[`dau_event.${slug}`] = count;
    }

    return metrics;
  }

  /**
   * Compute DAU and total daily hours using the Hackatime stats endpoint.
   * Uses /api/v1/users/{hackatimeAccount}/stats?features=projects&start_date={date}
   * which returns single-day data. Only counts time on Hackatime projects
   * that are linked to Horizon projects (nowHackatimeProjects).
   */
  private async computeHackatimeDaily(
    dayStart: Date,
  ): Promise<{
    dau: number;
    totalHours: number;
    dauPerEvent: Array<{ slug: string; count: number }>;
  }> {
    // Fetch users who have linked Hackatime projects in Horizon, plus the
    // pinned event slug used to attribute their DAU contribution.
    const usersWithProjects = await this.prisma.user.findMany({
      where: {
        hackatimeAccount: { not: null },
        projects: {
          some: {
            nowHackatimeProjects: { isEmpty: false },
          },
        },
      },
      select: {
        userId: true,
        hackatimeAccount: true,
        timezone: true,
        projects: {
          where: { nowHackatimeProjects: { isEmpty: false } },
          select: { nowHackatimeProjects: true },
        },
        pinnedEvent: { select: { event: { select: { slug: true } } } },
      },
    });

    const userProjectNames = usersWithProjects.map((user) => ({
      userId: user.userId,
      hackatimeAccount: user.hackatimeAccount!,
      timezone: user.timezone,
      allowedNames: new Set(
        user.projects.flatMap((p) => p.nowHackatimeProjects),
      ),
      eventSlug: user.pinnedEvent?.event.slug ?? null,
    }));

    const dateStr = dayStart.toISOString().split('T')[0];
    const apiKey = process.env.HACKATIME_API_KEY;
    let activeCount = 0;
    let totalSeconds = 0;
    const perEventCounts = new Map<string, number>();

    const batchSize = 10;
    for (let i = 0; i < userProjectNames.length; i += batchSize) {
      const batch = userProjectNames.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(
          async ({
            userId,
            hackatimeAccount,
            timezone,
            allowedNames,
            eventSlug,
          }) => {
            try {
              const headers: Record<string, string> = {
                'Content-Type': 'application/json',
              };
              if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

              const nextDay = new Date(dayStart);
              nextDay.setUTCDate(nextDay.getUTCDate() + 1);
              const endDateStr = nextDay.toISOString().split('T')[0];
              const url = `https://hackatime.hackclub.com/api/v1/users/${hackatimeAccount}/stats?features=projects&start_date=${dateStr}&end_date=${endDateStr}`;
              const response = await fetch(url, {
                headers,
                signal: AbortSignal.timeout(10000),
              });

              if (!response.ok) return { userId, userSeconds: 0, timezone, eventSlug };
              const data = await response.json();

              // Only sum seconds for Hackatime projects linked to Horizon projects
              const projects = data?.data?.projects;
              let userSeconds = 0;
              if (Array.isArray(projects)) {
                for (const p of projects) {
                  if (p?.name && allowedNames.has(p.name)) {
                    userSeconds +=
                      typeof p?.total_seconds === 'number' ? p.total_seconds : 0;
                  }
                }
              }
              return { userId, userSeconds, timezone, eventSlug };
            } catch {
              return { userId, userSeconds: 0, timezone, eventSlug };
            }
          },
        ),
      );

      // Aggregate metrics + persist per-user daily activity. The latter is
      // best-effort — a single user's DB failure must not break the batch.
      const persistTasks: Promise<void>[] = [];
      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        const { userId, userSeconds, timezone, eventSlug } = result.value;
        if (userSeconds > 0) {
          activeCount++;
          if (eventSlug) {
            perEventCounts.set(eventSlug, (perEventCounts.get(eventSlug) ?? 0) + 1);
          }
        }
        totalSeconds += userSeconds;

        const localDate = this.streakService.localDateForUtcDay(
          dayStart,
          timezone,
        );
        persistTasks.push(
          this.streakService
            .recordDailyActivity(userId, localDate, userSeconds)
            .catch((err) =>
              this.logger.warn(
                `Failed to persist daily activity for user ${userId}: ${err.message}`,
              ),
            ),
        );
      }
      await Promise.all(persistTasks);
    }

    return {
      dau: activeCount,
      totalHours: Math.round((totalSeconds / 3600) * 10) / 10,
      dauPerEvent: Array.from(perEventCounts, ([slug, count]) => ({ slug, count })),
    };
  }

  private async computeMedianReviewTime(
    dayStart: Date,
    dayEnd: Date,
  ): Promise<number | null> {
    const result = await this.prisma.$queryRaw<
      Array<{ median_hours: number | null }>
    >`
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (reviewed_at - created_at)) / 3600.0
      ) AS median_hours
      FROM submissions
      WHERE reviewed_at >= ${dayStart}
        AND reviewed_at <= ${dayEnd}
        AND reviewed_at IS NOT NULL
    `;

    return result[0]?.median_hours != null
      ? Math.round(Number(result[0].median_hours) * 100) / 100
      : null;
  }

  private async computeMedianFraudCheckTime(
    dayStart: Date,
    dayEnd: Date,
  ): Promise<number | null> {
    const result = await this.prisma.$queryRaw<
      Array<{ median_hours: number | null }>
    >`
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (p.joe_fraud_reviewed_at - s.min_created_at)) / 3600.0
      ) AS median_hours
      FROM projects p
      INNER JOIN (
        SELECT project_id, MIN(created_at) as min_created_at
        FROM submissions
        GROUP BY project_id
      ) s ON s.project_id = p.project_id
      WHERE p.joe_fraud_reviewed_at >= ${dayStart}
        AND p.joe_fraud_reviewed_at <= ${dayEnd}
        AND p.joe_fraud_reviewed_at IS NOT NULL
        AND p.joe_fraud_passed IS NOT NULL
    `;

    return result[0]?.median_hours != null
      ? Math.round(Number(result[0].median_hours) * 100) / 100
      : null;
  }

  private async computeFunnel(asOf: Date) {
    const beforeEnd = { lte: asOf };

    const [
      totalUsers,
      hasHackatime,
      createdProject,
      project10PlusHours,
      atLeast1Submission,
      atLeast1ApprovedHour,
      approved10Plus,
      approved30Plus,
      approved60Plus,
    ] = await Promise.all([
      this.prisma.user.count({ where: { createdAt: beforeEnd } }),
      this.prisma.user.count({
        where: { createdAt: beforeEnd, hackatimeAccount: { not: null } },
      }),
      this.prisma.user.count({
        where: { createdAt: beforeEnd, projects: { some: {} } },
      }),
      this.prisma.user.count({
        where: {
          createdAt: beforeEnd,
          projects: { some: { nowHackatimeHours: { gte: 10 } } },
        },
      }),
      this.prisma.user.count({
        where: {
          createdAt: beforeEnd,
          projects: { some: { submissions: { some: {} } } },
        },
      }),
      this.prisma.user.count({
        where: {
          createdAt: beforeEnd,
          projects: { some: { approvedHours: { gte: 1 } } },
        },
      }),
      this.countUsersWithApprovedHoursGte(10, asOf),
      this.countUsersWithApprovedHoursGte(30, asOf),
      this.countUsersWithApprovedHoursGte(60, asOf),
    ]);

    return {
      totalUsers,
      hasHackatime,
      createdProject,
      project10PlusHours,
      atLeast1Submission,
      atLeast1ApprovedHour,
      approved10Plus,
      approved30Plus,
      approved60Plus,
    };
  }

  private async countUsersWithApprovedHoursGte(
    threshold: number,
    asOf: Date,
  ): Promise<number> {
    const result = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM (
        SELECT u.user_id
        FROM users u
        INNER JOIN projects p ON p.user_id = u.user_id
        WHERE u.created_at <= ${asOf}
        GROUP BY u.user_id
        HAVING COALESCE(SUM(p.approved_hours), 0) >= ${threshold}
      ) sub
    `;
    return Number(result[0]?.count ?? 0);
  }

  private async computeSignupPerEvent(asOf: Date) {
    const result = await this.prisma.$queryRaw<
      Array<{
        event_id: number;
        title: string;
        slug: string;
        count: bigint;
      }>
    >`
      SELECT e.event_id, e.title, e.slug, COUNT(pe.id) as count
      FROM pinned_events pe
      INNER JOIN events e ON e.event_id = pe.event_id
      INNER JOIN users u ON u.user_id = pe.user_id
      WHERE u.created_at <= ${asOf}
      GROUP BY e.event_id, e.title, e.slug
      ORDER BY count DESC
    `;

    return result.map((r) => ({
      eventId: r.event_id,
      title: r.title,
      slug: r.slug,
      count: Number(r.count),
    }));
  }

  private async computeUtmSources(asOf: Date) {
    const groups = await this.prisma.user.groupBy({
      by: ['utmSource'],
      _count: { _all: true },
      where: {
        createdAt: { lte: asOf },
        utmSource: { not: null },
      },
      orderBy: { _count: { utmSource: 'desc' } },
    });

    return groups.map((g) => ({
      source: g.utmSource!,
      count: g._count._all,
    }));
  }
}
