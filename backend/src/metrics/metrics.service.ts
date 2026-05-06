import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

/**
 * Shared computation of review-related metrics. Both AdminService (full
 * dashboard) and ReviewerService (review stats page) consume these. Keep
 * compute methods here so reviewers don't need access to admin-only metrics
 * (signups, UTM, etc.) and so the two callers can't drift apart.
 */
@Injectable()
export class MetricsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Project-level hours: tracked / unshipped / shipped / in-review / approved / rejected, plus weighted grants.
   * Pass `asOf` to scope to projects (and submissions) created on or before that instant — used by the
   * daily snapshot job to backfill historical rows. Omit for the live "as of now" dashboard.
   */
  async computeReviewHours(asOf?: Date) {
    const projectWhere = asOf ? { createdAt: { lte: asOf } } : {};
    // Sentinel that always passes when no asOf is set — keeps the WHERE clauses
    // identical between the live and snapshot paths so the SQL plan is shared.
    const ceiling = asOf ?? new Date(8640000000000000);

    const [
      trackedAgg,
      unshippedAgg,
      shippedAgg,
      hoursInReviewResult,
      approvedHoursResult,
      rejectedHoursResult,
    ] = await Promise.all([
      this.prisma.project.aggregate({
        _sum: { nowHackatimeHours: true },
        where: projectWhere,
      }),
      this.prisma.project.aggregate({
        _sum: { nowHackatimeHours: true },
        where: { ...projectWhere, submissions: { none: {} } },
      }),
      this.prisma.project.aggregate({
        _sum: { nowHackatimeHours: true },
        where: { ...projectWhere, submissions: { some: {} } },
      }),
      // Hours in review: latest submission is pending AND reviewer hasn't decided yet
      this.prisma.$queryRaw<Array<{ total_hours: number }>>`
        SELECT COALESCE(SUM(p.now_hackatime_hours), 0) as total_hours
        FROM projects p
        WHERE p.created_at <= ${ceiling}
          AND EXISTS (
            SELECT 1 FROM submissions s
            WHERE s.project_id = p.project_id
              AND s.approval_status = 'pending'
              AND s.review_passed IS NULL
              AND s.created_at <= ${ceiling}
              AND s.created_at = (
                SELECT MAX(s2.created_at) FROM submissions s2
                WHERE s2.project_id = p.project_id
                  AND s2.created_at <= ${ceiling}
              )
          )
      `,
      // Approved hours: latest approved submission per fraud-passed project
      this.prisma.$queryRaw<Array<{ total_hours: number }>>`
        SELECT COALESCE(SUM(s.approved_hours), 0) as total_hours
        FROM submissions s
        JOIN projects p ON p.project_id = s.project_id
        WHERE s.approval_status = 'approved'
          AND p.joe_fraud_passed = true
          AND p.created_at <= ${ceiling}
          AND s.created_at <= ${ceiling}
          AND s.created_at = (
            SELECT MAX(s2.created_at) FROM submissions s2
            WHERE s2.project_id = p.project_id
              AND s2.approval_status = 'approved'
              AND s2.created_at <= ${ceiling}
          )
      `,
      // Rejected hours: latest submission is rejected and not a silent fraud reject
      this.prisma.$queryRaw<Array<{ total_hours: number }>>`
        SELECT COALESCE(SUM(s.hackatime_hours), 0) as total_hours
        FROM submissions s
        WHERE s.approval_status = 'rejected'
          AND s.silent_reject = false
          AND s.created_at <= ${ceiling}
          AND s.created_at = (
            SELECT MAX(s2.created_at) FROM submissions s2
            WHERE s2.project_id = s.project_id
              AND s2.created_at <= ${ceiling}
          )
      `,
    ]);

    const approved = Number(approvedHoursResult[0]?.total_hours ?? 0);
    const rejected = Number(rejectedHoursResult[0]?.total_hours ?? 0);

    return {
      trackedHours: trackedAgg._sum.nowHackatimeHours ?? 0,
      unshippedHours: unshippedAgg._sum.nowHackatimeHours ?? 0,
      shippedHours: shippedAgg._sum.nowHackatimeHours ?? 0,
      hoursInReview: Number(hoursInReviewResult[0]?.total_hours ?? 0),
      approvedHours: approved,
      rejectedHours: rejected,
      weightedGrants: Math.round((approved / 10) * 100) / 100,
    };
  }

  /**
   * Histogram of project counts by hours bucket, computed three ways that mirror
   * the home-page qualifying graph modes:
   *   - `unshipped`: every project, bucketed by `nowHackatimeHours`
   *   - `shipped`:   projects with ≥1 pending/approved submission, bucketed by `nowHackatimeHours`
   *   - `approved`:  projects with `approvedHours > 0`, bucketed by `approvedHours`
   * All three are returned so the client can toggle without re-fetching.
   */
  async computeProjectHoursDistribution(asOf?: Date) {
    const ceiling = asOf ?? new Date(8640000000000000);
    const order = [
      '0',
      '0-5',
      '5-10',
      '10-15',
      '15-20',
      '20-25',
      '25-30',
      '30-40',
      '40-50',
      '50-75',
      '75-100',
      '100+',
    ];

    const bucketize = (rows: Array<{ bucket: string; count: bigint }>) => {
      const map = new Map<string, number>();
      for (const r of rows) map.set(r.bucket, Number(r.count));
      return order.map((bucket) => ({ bucket, count: map.get(bucket) ?? 0 }));
    };

    const [unshippedRows, shippedRows, approvedRows] = await Promise.all([
      // Unshipped mode: every project, bucketed by tracked Hackatime hours
      this.prisma.$queryRaw<Array<{ bucket: string; count: bigint }>>`
        SELECT bucket, COUNT(*)::bigint AS count FROM (
          SELECT CASE
            WHEN now_hackatime_hours IS NULL OR now_hackatime_hours <= 0 THEN '0'
            WHEN now_hackatime_hours < 5   THEN '0-5'
            WHEN now_hackatime_hours < 10  THEN '5-10'
            WHEN now_hackatime_hours < 15  THEN '10-15'
            WHEN now_hackatime_hours < 20  THEN '15-20'
            WHEN now_hackatime_hours < 25  THEN '20-25'
            WHEN now_hackatime_hours < 30  THEN '25-30'
            WHEN now_hackatime_hours < 40  THEN '30-40'
            WHEN now_hackatime_hours < 50  THEN '40-50'
            WHEN now_hackatime_hours < 75  THEN '50-75'
            WHEN now_hackatime_hours < 100 THEN '75-100'
            ELSE '100+'
          END AS bucket
          FROM projects
          WHERE created_at <= ${ceiling}
        ) p
        GROUP BY bucket
      `,
      // Shipped mode: only projects with ≥1 pending or approved submission
      this.prisma.$queryRaw<Array<{ bucket: string; count: bigint }>>`
        SELECT bucket, COUNT(*)::bigint AS count FROM (
          SELECT CASE
            WHEN p.now_hackatime_hours IS NULL OR p.now_hackatime_hours <= 0 THEN '0'
            WHEN p.now_hackatime_hours < 5   THEN '0-5'
            WHEN p.now_hackatime_hours < 10  THEN '5-10'
            WHEN p.now_hackatime_hours < 15  THEN '10-15'
            WHEN p.now_hackatime_hours < 20  THEN '15-20'
            WHEN p.now_hackatime_hours < 25  THEN '20-25'
            WHEN p.now_hackatime_hours < 30  THEN '25-30'
            WHEN p.now_hackatime_hours < 40  THEN '30-40'
            WHEN p.now_hackatime_hours < 50  THEN '40-50'
            WHEN p.now_hackatime_hours < 75  THEN '50-75'
            WHEN p.now_hackatime_hours < 100 THEN '75-100'
            ELSE '100+'
          END AS bucket
          FROM projects p
          WHERE p.created_at <= ${ceiling}
            AND EXISTS (
              SELECT 1 FROM submissions s
              WHERE s.project_id = p.project_id
                AND s.approval_status IN ('pending', 'approved')
                AND s.created_at <= ${ceiling}
            )
        ) p
        GROUP BY bucket
      `,
      // Approved mode: only projects with approvedHours > 0, bucketed by that
      this.prisma.$queryRaw<Array<{ bucket: string; count: bigint }>>`
        SELECT bucket, COUNT(*)::bigint AS count FROM (
          SELECT CASE
            WHEN approved_hours <= 0 THEN '0'
            WHEN approved_hours < 5   THEN '0-5'
            WHEN approved_hours < 10  THEN '5-10'
            WHEN approved_hours < 15  THEN '10-15'
            WHEN approved_hours < 20  THEN '15-20'
            WHEN approved_hours < 25  THEN '20-25'
            WHEN approved_hours < 30  THEN '25-30'
            WHEN approved_hours < 40  THEN '30-40'
            WHEN approved_hours < 50  THEN '40-50'
            WHEN approved_hours < 75  THEN '50-75'
            WHEN approved_hours < 100 THEN '75-100'
            ELSE '100+'
          END AS bucket
          FROM projects
          WHERE created_at <= ${ceiling}
            AND approved_hours IS NOT NULL
            AND approved_hours > 0
        ) p
        GROUP BY bucket
      `,
    ]);

    return {
      unshipped: bucketize(unshippedRows),
      shipped: bucketize(shippedRows),
      approved: bucketize(approvedRows),
    };
  }

  /** Median / last-project review and fraud-check turnaround timings. */
  async computeReviewTimings() {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    const weekSubmissions = await this.prisma.submission.findMany({
      where: {
        reviewedAt: { gte: weekStart },
        approvalStatus: { in: ['approved', 'rejected'] },
      },
      select: { reviewedAt: true, createdAt: true },
    });

    const toHours = (ms: number) => Math.round((ms / (1000 * 60 * 60)) * 10) / 10;

    let medianReviewTimeThisWeek: number | null = null;
    if (weekSubmissions.length > 0) {
      const durations = weekSubmissions
        .map((s) => s.reviewedAt!.getTime() - s.createdAt.getTime())
        .sort((a, b) => a - b);
      const mid = Math.floor(durations.length / 2);
      const medianMs =
        durations.length % 2 === 1
          ? durations[mid]
          : (durations[mid - 1] + durations[mid]) / 2;
      medianReviewTimeThisWeek = toHours(medianMs);
    }

    // Median fraud check time this week (joeFraudReviewedAt - earliest submission createdAt)
    const fraudCheckedProjects = await this.prisma.project.findMany({
      where: {
        joeFraudReviewedAt: { gte: weekStart },
        joeFraudPassed: { not: null },
        submissions: { some: {} },
      },
      select: {
        joeFraudReviewedAt: true,
        submissions: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    let medianFraudCheckTimeThisWeek: number | null = null;
    const fraudDurations = fraudCheckedProjects
      .filter((p) => p.joeFraudReviewedAt && p.submissions.length > 0)
      .map((p) => p.joeFraudReviewedAt!.getTime() - p.submissions[0].createdAt.getTime())
      .filter((d) => d >= 0)
      .sort((a, b) => a - b);
    if (fraudDurations.length > 0) {
      const mid = Math.floor(fraudDurations.length / 2);
      const medianMs =
        fraudDurations.length % 2 === 1
          ? fraudDurations[mid]
          : (fraudDurations[mid - 1] + fraudDurations[mid]) / 2;
      medianFraudCheckTimeThisWeek = toHours(medianMs);
    }

    const lastReviewed = await this.prisma.submission.findFirst({
      where: {
        reviewedAt: { not: null },
        approvalStatus: { in: ['approved', 'rejected'] },
      },
      orderBy: { reviewedAt: 'desc' },
      select: { reviewedAt: true, createdAt: true },
    });
    const lastProjectReviewTime =
      lastReviewed && lastReviewed.reviewedAt
        ? toHours(lastReviewed.reviewedAt.getTime() - lastReviewed.createdAt.getTime())
        : null;

    const lastFraudChecked = await this.prisma.project.findFirst({
      where: {
        joeFraudReviewedAt: { not: null },
        joeFraudPassed: { not: null },
        submissions: { some: {} },
      },
      orderBy: { joeFraudReviewedAt: 'desc' },
      select: {
        joeFraudReviewedAt: true,
        submissions: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });
    const lastProjectFraudCheckTime =
      lastFraudChecked && lastFraudChecked.joeFraudReviewedAt && lastFraudChecked.submissions.length > 0
        ? toHours(lastFraudChecked.joeFraudReviewedAt.getTime() - lastFraudChecked.submissions[0].createdAt.getTime())
        : null;

    return {
      medianReviewTimeThisWeek,
      medianFraudCheckTimeThisWeek,
      lastProjectReviewTime,
      lastProjectFraudCheckTime,
    };
  }

  /**
   * Project counts across the two-gate flow plus a 3×3 reviewer×fraud state matrix.
   * Pass `asOf` to scope to projects/submissions created on or before that instant.
   * "This week" counts use a 7-day window ending at `asOf` (or now).
   */
  async computeReviewProjects(asOf?: Date) {
    // Stats reflect data as of the last 5-minute background poll rather than
    // syncing inline — pollPendingProjects round-trips Joe + walks all
    // pending projects, which would otherwise add ~10s to every stats load.
    // Reviewers can force-sync via the gallery's "Refresh Queue" button.
    const reference = asOf ?? new Date();
    const sevenDaysBefore = new Date(reference);
    sevenDaysBefore.setUTCDate(sevenDaysBefore.getUTCDate() - 7);
    const projectCreated = asOf ? { createdAt: { lte: asOf } } : {};
    const subCreated = asOf ? { createdAt: { lte: asOf } } : {};
    const subWeek = asOf
      ? { createdAt: { gte: sevenDaysBefore, lte: asOf } }
      : { createdAt: { gte: sevenDaysBefore } };
    const subWeekReviewed = asOf
      ? { reviewedAt: { gte: sevenDaysBefore, lte: asOf } }
      : { reviewedAt: { gte: sevenDaysBefore } };

    const [
      shipped,
      fraudChecked,
      fraudQueue,
      reviewQueue,
      awaitingFraud,
      fraudTeamDeliberation,
      reviewed,
      approved,
      shippedThisWeek,
      fraudCheckedThisWeek,
      reviewedThisWeek,
    ] = await Promise.all([
      this.prisma.project.count({
        where: { ...projectCreated, submissions: { some: subCreated } },
      }),
      this.prisma.project.count({
        where: {
          ...projectCreated,
          joeFraudPassed: true,
          submissions: { some: subCreated },
        },
      }),
      this.prisma.project.count({
        where: {
          ...projectCreated,
          joeFraudPassed: null,
          submissions: { some: subCreated },
        },
      }),
      this.prisma.submission.count({
        where: { ...subCreated, approvalStatus: 'pending', reviewPassed: null },
      }),
      this.prisma.submission.count({
        where: {
          ...subCreated,
          approvalStatus: 'pending',
          reviewPassed: { not: null },
        },
      }),
      this.prisma.submission.count({
        where: {
          ...subCreated,
          approvalStatus: 'rejected',
          silentReject: true,
        },
      }),
      this.prisma.project.count({
        where: {
          ...projectCreated,
          submissions: {
            some: { ...subCreated, approvalStatus: { in: ['approved', 'rejected'] } },
          },
        },
      }),
      this.prisma.project.count({
        where: {
          ...projectCreated,
          submissions: { some: { ...subCreated, approvalStatus: 'approved' } },
        },
      }),
      this.prisma.project.count({
        where: { ...projectCreated, submissions: { some: subWeek } },
      }),
      this.prisma.project.count({
        where: {
          ...projectCreated,
          joeFraudPassed: true,
          submissions: { some: subWeek },
        },
      }),
      this.prisma.project.count({
        where: {
          ...projectCreated,
          submissions: {
            some: { ...subWeekReviewed, approvalStatus: { in: ['approved', 'rejected'] } },
          },
        },
      }),
    ]);

    const funnelMatrix = await this.computeFunnelMatrix(asOf);

    return {
      shipped,
      fraudChecked,
      fraudQueue,
      reviewQueue,
      awaitingFraud,
      fraudTeamDeliberation,
      reviewed,
      approved,
      shippedThisWeek,
      fraudCheckedThisWeek,
      reviewedThisWeek,
      funnelMatrix,
    };
  }

  /**
   * For every project with ≥1 submission, compute where it currently sits in the
   * two-gate flow — reviewer gate × fraud gate — using the project's most recent
   * submission. Returns a 3×3 count matrix.
   *
   * Under the fraud-wins rule (fraud=false → silent reject regardless of reviewer),
   * fraud-failed column cells are all silent-rejects.
   */
  private async computeFunnelMatrix(asOf?: Date) {
    const ceiling = asOf ?? new Date(8640000000000000);
    const rows = await this.prisma.$queryRaw<
      Array<{
        review_bucket: 'approved' | 'rejected' | 'pending';
        fraud_bucket: 'passed' | 'failed' | 'pending';
        count: bigint;
      }>
    >`
      WITH latest_submission AS (
        SELECT DISTINCT ON (project_id)
          project_id,
          review_passed,
          approval_status,
          silent_reject
        FROM submissions
        WHERE created_at <= ${ceiling}
        ORDER BY project_id, created_at DESC
      )
      SELECT
        CASE
          WHEN ls.review_passed = true  THEN 'approved'
          WHEN ls.review_passed = false THEN 'rejected'
          ELSE 'pending'
        END AS review_bucket,
        CASE
          WHEN p.joe_fraud_passed = true  THEN 'passed'
          WHEN p.joe_fraud_passed = false THEN 'failed'
          ELSE 'pending'
        END AS fraud_bucket,
        COUNT(*)::bigint AS count
      FROM latest_submission ls
      JOIN projects p ON p.project_id = ls.project_id
      WHERE p.created_at <= ${ceiling}
      GROUP BY review_bucket, fraud_bucket;
    `;

    const cell = (
      review: 'approved' | 'rejected' | 'pending',
      fraud: 'passed' | 'failed' | 'pending',
    ) =>
      Number(
        rows.find((r) => r.review_bucket === review && r.fraud_bucket === fraud)
          ?.count ?? 0,
      );

    return {
      reviewApproved: {
        fraudPassed: cell('approved', 'passed'),
        fraudFailed: cell('approved', 'failed'),
        fraudPending: cell('approved', 'pending'),
      },
      reviewRejected: {
        fraudPassed: cell('rejected', 'passed'),
        fraudFailed: cell('rejected', 'failed'),
        fraudPending: cell('rejected', 'pending'),
      },
      reviewPending: {
        fraudPassed: cell('pending', 'passed'),
        fraudFailed: cell('pending', 'failed'),
        fraudPending: cell('pending', 'pending'),
      },
    };
  }

  /** 30-day historical time series, derived from the daily HistoricalMetric snapshots. */
  async computeHistorical(thirtyDaysAgo: Date) {
    const timeSeriesMetrics = [
      'dau', 'new_signups', 'submissions_created', 'reviews_completed',
      'median_review_time_hours', 'median_fraud_check_time_hours', 'daily_hours_logged',
      'total_users', 'total_projects', 'review_projects',
    ];

    const rows = await this.prisma.historicalMetric.findMany({
      where: {
        metric: { in: timeSeriesMetrics },
        date: { gte: thirtyDaysAgo },
      },
      orderBy: { date: 'asc' },
    });

    const result: Record<string, Array<{ date: string; value: number }>> = {
      dau: [],
      newSignups: [],
      submissionsCreated: [],
      reviewsCompleted: [],
      medianReviewTimeHours: [],
      medianFraudCheckTimeHours: [],
      dailyHoursLogged: [],
      projectsShipped: [],
      projectsFraudChecked: [],
    };

    const rawDaily: Record<string, Array<{ date: string; value: number }>> = {
      new_signups: [],
      submissions_created: [],
      reviews_completed: [],
      median_review_time_hours: [],
      median_fraud_check_time_hours: [],
    };
    const metricKeyMap: Record<string, string> = {
      dau: 'dau',
      daily_hours_logged: 'dailyHoursLogged',
    };

    for (const row of rows) {
      const val = typeof row.value === 'number' ? row.value : Number(row.value) || 0;
      const dateStr = row.date.toISOString().split('T')[0];

      const directKey = metricKeyMap[row.metric];
      if (directKey) {
        result[directKey].push({ date: dateStr, value: val });
        continue;
      }

      if (row.metric === 'total_users') {
        result.newSignups.push({ date: dateStr, value: val });
        continue;
      }

      if (row.metric === 'review_projects') {
        const obj = typeof row.value === 'object' && row.value !== null ? row.value as Record<string, any> : {};
        const shipped = Number(obj.shipped) || 0;
        // Prefer the unified `fraudChecked` field (projects with joeFraudPassed=true).
        // Fall back to the legacy `passingFraudInQueue` shape for snapshot rows
        // taken before the unification — note semantics differ slightly so the
        // chart will show a step at the cutover until those rows are re-snapshotted.
        const fraudChecked = obj.fraudChecked != null
          ? Number(obj.fraudChecked) || 0
          : Number(obj.passingFraudInQueue) || 0;
        result.projectsShipped.push({ date: dateStr, value: shipped });
        result.projectsFraudChecked.push({ date: dateStr, value: fraudChecked });
        continue;
      }

      if (rawDaily[row.metric]) {
        rawDaily[row.metric].push({ date: dateStr, value: val });
      }
    }

    // Aggregate median review time into weekly averages
    const weekBuckets = new Map<string, number[]>();
    for (const d of rawDaily.median_review_time_hours) {
      if (d.value === 0) continue;
      const date = new Date(d.date);
      const day = date.getUTCDay();
      const monday = new Date(date);
      monday.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
      const weekKey = monday.toISOString().split('T')[0];
      if (!weekBuckets.has(weekKey)) weekBuckets.set(weekKey, []);
      weekBuckets.get(weekKey)!.push(d.value);
    }
    for (const [weekStart, values] of weekBuckets) {
      const avg = Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100;
      result.medianReviewTimeHours.push({ date: weekStart, value: avg });
    }
    result.medianReviewTimeHours.sort((a, b) => a.date.localeCompare(b.date));

    // Aggregate median fraud check time into weekly averages
    const fraudWeekBuckets = new Map<string, number[]>();
    for (const d of rawDaily.median_fraud_check_time_hours) {
      if (d.value === 0) continue;
      const date = new Date(d.date);
      const day = date.getUTCDay();
      const monday = new Date(date);
      monday.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
      const weekKey = monday.toISOString().split('T')[0];
      if (!fraudWeekBuckets.has(weekKey)) fraudWeekBuckets.set(weekKey, []);
      fraudWeekBuckets.get(weekKey)!.push(d.value);
    }
    for (const [weekStart, values] of fraudWeekBuckets) {
      const avg = Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100;
      result.medianFraudCheckTimeHours.push({ date: weekStart, value: avg });
    }
    result.medianFraudCheckTimeHours.sort((a, b) => a.date.localeCompare(b.date));

    let submissionSum = 0;
    for (const d of rawDaily.submissions_created) {
      submissionSum += d.value;
      result.submissionsCreated.push({ date: d.date, value: submissionSum });
    }

    let reviewSum = 0;
    for (const d of rawDaily.reviews_completed) {
      reviewSum += d.value;
      result.reviewsCompleted.push({ date: d.date, value: reviewSum });
    }

    return result;
  }
}
