import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';

@Injectable()
export class MetricsSnapshotService implements OnModuleInit {
  private readonly logger = new Logger(MetricsSnapshotService.name);

  constructor(private prisma: PrismaService) {}

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

  async backfill(startDate: Date, endDate: Date) {
    const results: { date: string; metricsCount: number }[] = [];
    const current = new Date(startDate);
    current.setUTCHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setUTCHours(0, 0, 0, 0);

    while (current <= end) {
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
      this.prisma.user.count({ where: { createdAt: beforeEnd } }),
      this.prisma.project.count({ where: { createdAt: beforeEnd } }),
      this.prisma.project.aggregate({ _sum: { nowHackatimeHours: true }, where: { createdAt: beforeEnd } }),
      this.prisma.project.aggregate({ _sum: { approvedHours: true }, where: { createdAt: beforeEnd } }),
      this.computeFunnel(dayEnd),
      this.computeReviewHours(dayEnd),
      this.computeReviewProjects(dayEnd),
      this.computeSignupPerEvent(dayEnd),
      this.computeUtmSources(dayEnd),
    ]);

    // Per-event DAU (users with project activity that day, grouped by pinned event)
    const dauPerEvent = await this.computeDauPerEvent(dayStart, dayEnd);

    const metrics: Record<string, unknown> = {
      dau: hackatimeDaily.dau,
      new_signups: newSignups,
      submissions_created: submissionsCreated,
      reviews_completed: reviewsCompleted,
      median_review_time_hours: medianReviewTime,
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
   * Compute DAU and total daily hours using the Hackatime /api/summary endpoint.
   * Only counts time on Hackatime projects that are linked to Horizon projects
   * (stored in project.nowHackatimeProjects), so non-Horizon coding activity
   * is excluded from both DAU and daily hours metrics.
   */
  private async computeHackatimeDaily(
    dayStart: Date,
  ): Promise<{ dau: number; totalHours: number }> {
    // Fetch users who have linked Hackatime projects in Horizon
    const usersWithProjects = await this.prisma.user.findMany({
      where: {
        hackatimeAccount: { not: null },
        slackUserId: { not: null },
        projects: {
          some: {
            nowHackatimeProjects: { isEmpty: false },
          },
        },
      },
      select: {
        slackUserId: true,
        projects: {
          where: { nowHackatimeProjects: { isEmpty: false } },
          select: { nowHackatimeProjects: true },
        },
      },
    });

    // Build a set of allowed Hackatime project names per user
    const userProjectNames = usersWithProjects.map((user) => ({
      slackUserId: user.slackUserId!,
      allowedNames: new Set(
        user.projects.flatMap((p) => p.nowHackatimeProjects),
      ),
    }));

    const dateStr = dayStart.toISOString().split('T')[0];
    const apiKey = process.env.HACKATIME_API_KEY;
    let activeCount = 0;
    let totalSeconds = 0;

    const batchSize = 10;
    for (let i = 0; i < userProjectNames.length; i += batchSize) {
      const batch = userProjectNames.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async ({ slackUserId, allowedNames }) => {
          try {
            const headers: Record<string, string> = { Accept: 'application/json' };
            if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

            const url = `https://hackatime.hackclub.com/api/summary?user=${encodeURIComponent(slackUserId)}&start=${dateStr}&end=${dateStr}`;
            const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });

            if (!response.ok) return 0;
            const data = await response.json();

            // Only sum seconds for Hackatime projects linked to Horizon projects
            const projects = data?.projects;
            let userSeconds = 0;
            if (Array.isArray(projects)) {
              for (const p of projects) {
                if (p?.name && allowedNames.has(p.name)) {
                  userSeconds += p?.total ?? 0;
                }
              }
            }
            return userSeconds;
          } catch {
            return 0;
          }
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && typeof result.value === 'number') {
          if (result.value > 0) activeCount++;
          totalSeconds += result.value;
        }
      }
    }

    return {
      dau: activeCount,
      totalHours: Math.round((totalSeconds / 3600) * 10) / 10,
    };
  }


  private async computeDauPerEvent(
    dayStart: Date,
    dayEnd: Date,
  ): Promise<Array<{ slug: string; count: number }>> {
    const result = await this.prisma.$queryRaw<
      Array<{ slug: string; count: bigint }>
    >`
      SELECT e.slug, COUNT(DISTINCT p.user_id) as count
      FROM projects p
      INNER JOIN pinned_events pe ON pe.user_id = p.user_id
      INNER JOIN events e ON e.event_id = pe.event_id
      WHERE p.updated_at >= ${dayStart} AND p.updated_at <= ${dayEnd}
      GROUP BY e.slug
    `;

    return result.map((r) => ({ slug: r.slug, count: Number(r.count) }));
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

  private async computeReviewHours(asOf: Date) {
    const beforeEnd = { lte: asOf };

    // All tracked hours
    const trackedAgg = await this.prisma.project.aggregate({
      _sum: { nowHackatimeHours: true },
      where: { createdAt: beforeEnd },
    });

    // Unshipped: projects with NO submissions
    const unshippedAgg = await this.prisma.project.aggregate({
      _sum: { nowHackatimeHours: true },
      where: {
        createdAt: beforeEnd,
        submissions: { none: {} },
      },
    });

    // Shipped: projects WITH at least one submission
    const shippedAgg = await this.prisma.project.aggregate({
      _sum: { nowHackatimeHours: true },
      where: {
        createdAt: beforeEnd,
        submissions: { some: {} },
      },
    });

    // Hours in review: projects whose latest submission is pending
    const hoursInReviewResult = await this.prisma.$queryRaw<
      Array<{ total_hours: number }>
    >`
      SELECT COALESCE(SUM(p.now_hackatime_hours), 0) as total_hours
      FROM projects p
      WHERE p.created_at <= ${asOf}
        AND EXISTS (
          SELECT 1 FROM submissions s
          WHERE s.project_id = p.project_id
            AND s.approval_status = 'pending'
            AND s.created_at = (
              SELECT MAX(s2.created_at) FROM submissions s2
              WHERE s2.project_id = p.project_id
            )
        )
    `;

    // Approved hours
    const approvedAgg = await this.prisma.project.aggregate({
      _sum: { approvedHours: true },
      where: { createdAt: beforeEnd },
    });

    const tracked = trackedAgg._sum.nowHackatimeHours ?? 0;
    const approved = approvedAgg._sum.approvedHours ?? 0;

    return {
      tracked,
      unshipped: unshippedAgg._sum.nowHackatimeHours ?? 0,
      shipped: shippedAgg._sum.nowHackatimeHours ?? 0,
      inReview: Number(hoursInReviewResult[0]?.total_hours ?? 0),
      approved,
      weightedGrants: Math.round((approved / 10) * 100) / 100,
    };
  }

  private async computeReviewProjects(asOf: Date) {
    const beforeEnd = { lte: asOf };

    const [shipped, passingFraudInQueue, reviewed, approved] =
      await Promise.all([
        // Projects with >= 1 submission
        this.prisma.project.count({
          where: { createdAt: beforeEnd, submissions: { some: {} } },
        }),
        // Projects with joeFraudPassed=true AND a pending submission
        this.prisma.project.count({
          where: {
            createdAt: beforeEnd,
            joeFraudPassed: true,
            submissions: { some: { approvalStatus: 'pending' } },
          },
        }),
        // Projects with any approved/rejected submission
        this.prisma.project.count({
          where: {
            createdAt: beforeEnd,
            submissions: {
              some: { approvalStatus: { in: ['approved', 'rejected'] } },
            },
          },
        }),
        // Projects with at least one approved submission
        this.prisma.project.count({
          where: {
            createdAt: beforeEnd,
            submissions: { some: { approvalStatus: 'approved' } },
          },
        }),
      ]);

    return { shipped, passingFraudInQueue, reviewed, approved };
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
