import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SlackService } from '../slack/slack.service';
import { GeocodingService } from './geocoding.service';

const projectAdminInclude = {
  user: {
    select: {
      userId: true,
      firstName: true,
      lastName: true,
      email: true,
      birthday: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      country: true,
      zipCode: true,
      hackatimeAccount: true,
      referralCode: true,
      referredByUserId: true,
      isFraud: true,
      isSus: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  submissions: {
    orderBy: { createdAt: 'desc' },
  },
} as const;

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private slackService: SlackService,
    private geocodingService: GeocodingService,
  ) {}

  async getAllSubmissions() {
    const submissions = await this.prisma.submission.findMany({
      include: {
        project: {
          include: {
            user: {
              select: {
                userId: true,
                firstName: true,
                lastName: true,
                email: true,
                birthday: true,
                addressLine1: true,
                addressLine2: true,
                city: true,
                state: true,
                country: true,
                zipCode: true,
                hackatimeAccount: true,
                referralCode: true,
                referredByUserId: true,
                airtableRecId: true,
                isFraud: true,
                isSus: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return submissions;
  }

  async unlockProject(projectId: number, adminUserId: number) {
    const project = await this.prisma.project.findUnique({
      where: { projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const updatedProject = await this.prisma.project.update({
      where: { projectId },
      data: {
        isLocked: false,
      },
      include: {
        user: {
          select: {
            userId: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        submissions: true,
      },
    });

    return updatedProject;
  }

  async getAllProjects() {
    const projects = await this.prisma.project.findMany({
      include: projectAdminInclude,
      orderBy: { createdAt: 'desc' },
    });

    return projects;
  }

  async recalculateProjectHours(projectId: number, strict = true) {
    const project = await this.prisma.project.findUnique({
      where: { projectId },
      include: projectAdminInclude,
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const baseUrl =
      process.env.HACKATIME_ADMIN_API_URL ||
      'https://hackatime.hackclub.com/api/admin/v1';
    const apiKey = process.env.HACKATIME_API_KEY;

    const cache = new Map<string, Map<string, number>>();
    const result = await this.recalculateProjectInternal(project, {
      strict,
      cache,
      baseUrl,
      apiKey,
    });

    if (!result?.project) {
      throw new BadRequestException('Unable to recalculate project hours');
    }

    return result;
  }

  async recalculateAllProjects() {
    const projects = await this.prisma.project.findMany({
      include: projectAdminInclude,
    });

    const cache = new Map<string, Map<string, number>>();
    const baseUrl =
      process.env.HACKATIME_ADMIN_API_URL ||
      'https://hackatime.hackclub.com/api/admin/v1';
    const apiKey = process.env.HACKATIME_API_KEY;

    const updated: Array<{ projectId: number; nowHackatimeHours: number }> = [];
    const skipped: Array<{ projectId: number; reason: string }> = [];
    const errors: Array<{ projectId: number; message: string }> = [];

    for (const project of projects) {
      try {
        const result = await this.recalculateProjectInternal(project, {
          strict: false,
          cache,
          baseUrl,
          apiKey,
        });

        if (result?.project) {
          updated.push({
            projectId: result.project.projectId,
            nowHackatimeHours: result.project.nowHackatimeHours ?? 0,
          });
        } else if (result?.skipped) {
          skipped.push({
            projectId: project.projectId,
            reason: result.reason,
          });
        }
      } catch (error) {
        errors.push({
          projectId: project.projectId,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      processed: projects.length,
      updated: updated.length,
      skipped,
      errors,
    };
  }

  async getTotals() {
    const [
      hackatimeAggregate,
      approvedAggregate,
      totalUsers,
      totalProjects,
      submittedProjects,
    ] = await Promise.all([
      this.prisma.project.aggregate({
        _sum: { nowHackatimeHours: true },
      }),
      this.prisma.project.aggregate({
        _sum: { approvedHours: true },
      }),
      this.prisma.user.count(),
      this.prisma.project.count(),
      this.prisma.project.findMany({
        where: {
          submissions: {
            some: {},
          },
        },
        select: {
          nowHackatimeHours: true,
        },
      }),
    ]);

    const totalSubmittedHackatimeHours = submittedProjects.reduce(
      (sum, project) => sum + (project.nowHackatimeHours ?? 0),
      0,
    );

    return {
      totals: {
        totalHackatimeHours: hackatimeAggregate._sum.nowHackatimeHours ?? 0,
        totalApprovedHours: approvedAggregate._sum.approvedHours ?? 0,
        totalUsers,
        totalProjects,
        totalSubmittedHackatimeHours,
      },
    };
  }

  async getStats() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

    const [
      funnel,
      userGrowth,
      reviewStats,
      reviewProjects,
      signups,
      utm,
      historical,
    ] = await Promise.all([
      this.computeFunnel(),
      this.computeUserGrowth(thirtyDaysAgo, sevenDaysAgo),
      this.computeReviewStats(),
      this.computeReviewProjects(),
      this.computeSignups(),
      this.computeUtm(),
      this.computeHistorical(thirtyDaysAgo),
    ]);

    // Compute DAU summary from historical data
    const dauData = historical.dau;
    const dauToday = dauData.length > 0 ? dauData[dauData.length - 1].value : 0;
    const last7Dau = dauData.slice(-7);
    const last30Dau = dauData;
    const avg7 = last7Dau.length > 0 ? last7Dau.reduce((s, d) => s + d.value, 0) / last7Dau.length : 0;
    const avg30 = last30Dau.length > 0 ? last30Dau.reduce((s, d) => s + d.value, 0) / last30Dau.length : 0;
    const prev7Dau = dauData.slice(-14, -7);
    const avgPrev7 = prev7Dau.length > 0 ? prev7Dau.reduce((s, d) => s + d.value, 0) / prev7Dau.length : 0;
    const dauGrowthPercent = avgPrev7 > 0
      ? Math.round(((avg7 - avgPrev7) / avgPrev7) * 10000) / 100
      : 0;

    const dauPerEvent = await this.computeDauPerEvent();

    const dau = {
      today: dauToday,
      avg7: Math.round(avg7 * 10) / 10,
      avg30: Math.round(avg30 * 10) / 10,
      growthPercent7: dauGrowthPercent,
      perEvent: dauPerEvent,
    };

    return { funnel, userGrowth, reviewStats, reviewProjects, signups, utm, historical, dau };
  }

  private async computeDauPerEvent() {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const result = await this.prisma.$queryRaw<
      Array<{ event_id: number; title: string; slug: string; count: bigint }>
    >`
      SELECT e.event_id, e.title, e.slug, COUNT(DISTINCT p.user_id) as count
      FROM projects p
      INNER JOIN pinned_events pe ON pe.user_id = p.user_id
      INNER JOIN events e ON e.event_id = pe.event_id
      WHERE p.updated_at >= ${todayStart}
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

  private async computeFunnel() {
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
      this.prisma.user.count(),
      this.prisma.user.count({ where: { hackatimeAccount: { not: null } } }),
      this.prisma.user.count({ where: { projects: { some: {} } } }),
      this.prisma.user.count({
        where: { projects: { some: { nowHackatimeHours: { gte: 10 } } } },
      }),
      this.prisma.user.count({
        where: { projects: { some: { submissions: { some: {} } } } },
      }),
      this.prisma.user.count({
        where: { projects: { some: { approvedHours: { gte: 1 } } } },
      }),
      this.countUsersWithApprovedHoursGte(10),
      this.countUsersWithApprovedHoursGte(30),
      this.countUsersWithApprovedHoursGte(60),
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

  private async countUsersWithApprovedHoursGte(threshold: number): Promise<number> {
    const result = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM (
        SELECT u.user_id
        FROM users u
        INNER JOIN projects p ON p.user_id = u.user_id
        GROUP BY u.user_id
        HAVING COALESCE(SUM(p.approved_hours), 0) >= ${threshold}
      ) sub
    `;
    return Number(result[0]?.count ?? 0);
  }

  private async computeUserGrowth(thirtyDaysAgo: Date, sevenDaysAgo: Date) {
    const [totalUsers, newLast30Days, newLast7Days] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    ]);

    const olderUsers = totalUsers - newLast7Days;
    const growthPercent = olderUsers > 0
      ? Math.round((newLast7Days / olderUsers) * 10000) / 100
      : 0;

    return { totalUsers, newLast30Days, newLast7Days, growthPercent };
  }

  private async computeReviewStats() {
    const [trackedAgg, unshippedAgg, shippedAgg, hoursInReviewResult, approvedAgg] =
      await Promise.all([
        this.prisma.project.aggregate({ _sum: { nowHackatimeHours: true } }),
        this.prisma.project.aggregate({
          _sum: { nowHackatimeHours: true },
          where: { submissions: { none: {} } },
        }),
        this.prisma.project.aggregate({
          _sum: { nowHackatimeHours: true },
          where: { submissions: { some: {} } },
        }),
        this.prisma.$queryRaw<Array<{ total_hours: number }>>`
          SELECT COALESCE(SUM(p.now_hackatime_hours), 0) as total_hours
          FROM projects p
          WHERE EXISTS (
            SELECT 1 FROM submissions s
            WHERE s.project_id = p.project_id
              AND s.approval_status = 'pending'
              AND s.created_at = (
                SELECT MAX(s2.created_at) FROM submissions s2
                WHERE s2.project_id = p.project_id
              )
          )
        `,
        this.prisma.project.aggregate({ _sum: { approvedHours: true } }),
      ]);

    const approved = approvedAgg._sum.approvedHours ?? 0;

    return {
      trackedHours: trackedAgg._sum.nowHackatimeHours ?? 0,
      unshippedHours: unshippedAgg._sum.nowHackatimeHours ?? 0,
      shippedHours: shippedAgg._sum.nowHackatimeHours ?? 0,
      hoursInReview: Number(hoursInReviewResult[0]?.total_hours ?? 0),
      approvedHours: approved,
      weightedGrants: Math.round((approved / 10) * 100) / 100,
    };
  }

  private async computeReviewProjects() {
    const [shipped, fraudChecked, inQueue, reviewed, approved] = await Promise.all([
      // Projects with >= 1 submission
      this.prisma.project.count({ where: { submissions: { some: {} } } }),
      // Projects that passed fraud check (includes reviewed)
      this.prisma.project.count({
        where: {
          joeFraudPassed: true,
          submissions: { some: {} },
        },
      }),
      // Fraud-checked projects with NO approved/rejected submissions (truly waiting for review)
      this.prisma.project.count({
        where: {
          joeFraudPassed: true,
          submissions: { some: { approvalStatus: 'pending' } },
          NOT: {
            submissions: { some: { approvalStatus: { in: ['approved', 'rejected'] } } },
          },
        },
      }),
      this.prisma.project.count({
        where: {
          submissions: { some: { approvalStatus: { in: ['approved', 'rejected'] } } },
        },
      }),
      this.prisma.project.count({
        where: { submissions: { some: { approvalStatus: 'approved' } } },
      }),
    ]);

    return { shipped, fraudChecked, inQueue, reviewed, approved };
  }

  private async computeSignups() {
    const total = await this.prisma.user.count();

    const perEventResult = await this.prisma.$queryRaw<
      Array<{ event_id: number; title: string; slug: string; count: bigint }>
    >`
      SELECT e.event_id, e.title, e.slug, COUNT(pe.id) as count
      FROM pinned_events pe
      INNER JOIN events e ON e.event_id = pe.event_id
      GROUP BY e.event_id, e.title, e.slug
      ORDER BY count DESC
    `;

    // Origin country → destination event country routes for map
    const routesResult = await this.prisma.$queryRaw<
      Array<{
        origin_country: string;
        event_country: string;
        event_title: string;
        count: bigint;
      }>
    >`
      SELECT u.country AS origin_country, e.country AS event_country, e.title AS event_title, COUNT(*) AS count
      FROM pinned_events pe
      INNER JOIN users u ON u.user_id = pe.user_id
      INNER JOIN events e ON e.event_id = pe.event_id
      WHERE u.country IS NOT NULL AND u.country != '' AND e.country IS NOT NULL AND e.country != ''
      GROUP BY u.country, e.country, e.title
      ORDER BY count DESC
    `;

    // Geocode all unique countries
    const allCountries = [
      ...routesResult.map((r) => r.origin_country),
      ...routesResult.map((r) => r.event_country),
    ];
    const coords = await this.geocodingService.geocodeMany(allCountries);

    const routes = routesResult.map((r) => {
      const originCoords = coords.get(r.origin_country.toLowerCase().trim());
      const eventCoords = coords.get(r.event_country.toLowerCase().trim());
      return {
        originCountry: r.origin_country,
        originLat: originCoords?.lat ?? null,
        originLng: originCoords?.lng ?? null,
        eventCountry: r.event_country,
        eventLat: eventCoords?.lat ?? null,
        eventLng: eventCoords?.lng ?? null,
        eventTitle: r.event_title,
        count: Number(r.count),
      };
    });

    return {
      total,
      perEvent: perEventResult.map((r) => ({
        eventId: r.event_id,
        title: r.title,
        slug: r.slug,
        count: Number(r.count),
      })),
      routes,
    };
  }

  private async computeUtm() {
    const groups = await this.prisma.user.groupBy({
      by: ['utmSource'],
      _count: { _all: true },
      where: { utmSource: { not: null } },
      orderBy: { _count: { utmSource: 'desc' } },
    });

    return {
      sources: groups.map((g) => ({
        source: g.utmSource!,
        count: g._count._all,
      })),
    };
  }

  private async computeHistorical(thirtyDaysAgo: Date) {
    const timeSeriesMetrics = [
      'dau', 'new_signups', 'submissions_created', 'reviews_completed',
      'median_review_time_hours', 'daily_hours_logged',
      'total_users', 'total_projects',
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
      newSignups: [],           // cumulative (total_users)
      submissionsCreated: [],   // cumulative running sum
      reviewsCompleted: [],     // cumulative running sum
      medianReviewTimeHours: [],
      dailyHoursLogged: [],
    };

    // First pass: collect raw daily values
    const rawDaily: Record<string, Array<{ date: string; value: number }>> = {
      new_signups: [],
      submissions_created: [],
      reviews_completed: [],
      median_review_time_hours: [],
    };
    const metricKeyMap: Record<string, string> = {
      dau: 'dau',
      daily_hours_logged: 'dailyHoursLogged',
    };

    for (const row of rows) {
      const val = typeof row.value === 'number' ? row.value : Number(row.value) || 0;
      const dateStr = row.date.toISOString().split('T')[0];

      // Non-cumulative metrics: pass through directly
      const directKey = metricKeyMap[row.metric];
      if (directKey) {
        result[directKey].push({ date: dateStr, value: val });
        continue;
      }

      // Cumulative: use total_users snapshot directly for signups
      if (row.metric === 'total_users') {
        result.newSignups.push({ date: dateStr, value: val });
        continue;
      }

      // Collect daily counts for aggregation
      if (rawDaily[row.metric]) {
        rawDaily[row.metric].push({ date: dateStr, value: val });
      }
    }

    // Aggregate median review time into weekly averages
    const weekBuckets = new Map<string, number[]>();
    for (const d of rawDaily.median_review_time_hours) {
      if (d.value === 0) continue;
      // Get the Monday of this date's week
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

    // Convert daily submissions_created and reviews_completed to cumulative running sums
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

  async getEventStats(slug: string) {
    const event = await this.prisma.event.findUnique({
      where: { slug },
      include: { _count: { select: { pinnedBy: true } } },
    });
    if (!event) return null;

    const eventId = event.eventId;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    // Pinned users who have/haven't met the hour goal
    const pinnedUsers = await this.prisma.pinnedEvent.findMany({
      where: { eventId },
      include: {
        user: {
          include: {
            projects: { select: { approvedHours: true } },
          },
        },
      },
    });

    let metGoal = 0;
    let notMetGoal = 0;
    for (const pin of pinnedUsers) {
      const totalApproved = pin.user.projects.reduce(
        (sum, p) => sum + (p.approvedHours ?? 0),
        0,
      );
      if (totalApproved >= event.hourCost) {
        metGoal++;
      } else {
        notMetGoal++;
      }
    }

    // DAU for this event (users with project activity today who are pinned to this event)
    const dauResult = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT p.user_id) as count
      FROM projects p
      INNER JOIN pinned_events pe ON pe.user_id = p.user_id
      WHERE pe.event_id = ${eventId}
        AND p.updated_at >= ${todayStart}
    `;
    const dauToday = Number(dauResult[0]?.count ?? 0);

    // Pinned over the last 30 days (daily counts from pinned_events.created_at)
    const pinnedOverTime = await this.prisma.$queryRaw<
      Array<{ date: Date; count: bigint }>
    >`
      SELECT DATE(pe.created_at) as date, COUNT(*) as count
      FROM pinned_events pe
      WHERE pe.event_id = ${eventId}
        AND pe.created_at >= ${thirtyDaysAgo}
      GROUP BY DATE(pe.created_at)
      ORDER BY date ASC
    `;

    // Cumulative pinned count over time
    let cumulative = event._count.pinnedBy - pinnedOverTime.reduce((s, d) => s + Number(d.count), 0);
    const pinnedTimeline = pinnedOverTime.map((d) => {
      cumulative += Number(d.count);
      return {
        date: d.date.toISOString().split('T')[0],
        value: cumulative,
      };
    });

    // DAU per event over 30 days from historical_metrics
    const dauRows = await this.prisma.historicalMetric.findMany({
      where: {
        metric: `dau_event.${slug}`,
        date: { gte: thirtyDaysAgo },
      },
      orderBy: { date: 'asc' },
    });

    const dauTimeline = dauRows.map((r) => ({
      date: r.date.toISOString().split('T')[0],
      value: typeof r.value === 'number' ? r.value : Number(r.value) || 0,
    }));

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
        isActive: event.isActive,
      },
      pinnedCount: event._count.pinnedBy,
      metHourGoal: metGoal,
      notMetHourGoal: notMetGoal,
      dauToday,
      pinnedTimeline,
      dauTimeline,
    };
  }

  async deleteProject(projectId: number) {
    const project = await this.prisma.project.findUnique({
      where: { projectId },
      include: {
        user: {
          select: {
            userId: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    await this.prisma.project.delete({
      where: { projectId },
    });

    return { deleted: true, projectId };
  }

  async getAllUsers() {
    const users = await this.prisma.user.findMany({
      include: {
        projects: {
          include: {
            submissions: {
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return users;
  }

  async getReviewerLeaderboard() {
    const reviewedSubmissions = await this.prisma.submission.findMany({
      where: {
        reviewedBy: { not: null },
        approvalStatus: { in: ['approved', 'rejected'] },
      },
      select: {
        reviewedBy: true,
        approvalStatus: true,
        reviewedAt: true,
      },
    });

    const reviewerStats = new Map<
      string,
      {
        approved: number;
        rejected: number;
        total: number;
        lastReviewedAt: Date | null;
      }
    >();

    for (const submission of reviewedSubmissions) {
      if (!submission.reviewedBy) continue;

      const stats = reviewerStats.get(submission.reviewedBy) || {
        approved: 0,
        rejected: 0,
        total: 0,
        lastReviewedAt: null,
      };

      if (submission.approvalStatus === 'approved') {
        stats.approved++;
      } else if (submission.approvalStatus === 'rejected') {
        stats.rejected++;
      }
      stats.total++;

      if (
        submission.reviewedAt &&
        (!stats.lastReviewedAt || submission.reviewedAt > stats.lastReviewedAt)
      ) {
        stats.lastReviewedAt = submission.reviewedAt;
      }

      reviewerStats.set(submission.reviewedBy, stats);
    }

    const reviewerUserIds = Array.from(reviewerStats.keys())
      .map((id) => parseInt(id))
      .filter((id) => !isNaN(id));

    const reviewerUsers = await this.prisma.user.findMany({
      where: { userId: { in: reviewerUserIds } },
      select: {
        userId: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    const userMap = new Map(reviewerUsers.map((u) => [u.userId.toString(), u]));

    const leaderboard = Array.from(reviewerStats.entries()).map(
      ([reviewerId, stats]) => {
        const user = userMap.get(reviewerId);
        return {
          reviewerId,
          firstName: user?.firstName || null,
          lastName: user?.lastName || null,
          email: user?.email || null,
          approved: stats.approved,
          rejected: stats.rejected,
          total: stats.total,
          lastReviewedAt: stats.lastReviewedAt,
        };
      },
    );

    leaderboard.sort((a, b) => b.total - a.total);

    return leaderboard;
  }

  async toggleFraudFlag(projectId: number, isFraud: boolean) {
    const project = await this.prisma.project.findUnique({
      where: { projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const updatedProject = await this.prisma.project.update({
      where: { projectId },
      data: { isFraud },
      select: {
        projectId: true,
        projectTitle: true,
        isFraud: true,
      },
    });

    return updatedProject;
  }

  async toggleUserFraudFlag(userId: number, isFraud: boolean) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { userId },
      data: { isFraud },
      select: {
        userId: true,
        email: true,
        firstName: true,
        lastName: true,
        isFraud: true,
      },
    });

    return updatedUser;
  }

  async toggleUserSusFlag(userId: number, isSus: boolean) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { userId },
      data: { isSus },
      select: {
        userId: true,
        email: true,
        firstName: true,
        lastName: true,
        isSus: true,
      },
    });

    return updatedUser;
  }

  async updateUserSlackId(userId: number, slackUserId: string | null) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (slackUserId) {
      const existingLink = await this.prisma.user.findFirst({
        where: {
          slackUserId,
          NOT: { userId },
        },
      });

      if (existingLink) {
        throw new BadRequestException(
          `This Slack ID is already linked to user: ${existingLink.email}`,
        );
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { userId },
      data: { slackUserId },
      select: {
        userId: true,
        email: true,
        firstName: true,
        lastName: true,
        slackUserId: true,
      },
    });

    return updatedUser;
  }

  async lookupSlackByEmail(email: string) {
    const result = await this.slackService.lookupSlackUserByEmail(email);
    if (!result) {
      return { found: false, message: 'No Slack user found with this email' };
    }
    return { found: true, ...result };
  }

  async getSlackInfo(slackUserId: string) {
    const result = await this.slackService.getSlackUserInfo(slackUserId);
    if (!result) {
      return { found: false, message: 'Could not fetch Slack user info' };
    }
    return { found: true, ...result };
  }

  private async recalculateProjectInternal(
    project: {
      projectId: number;
      nowHackatimeProjects: string[] | null;
      user: {
        userId: number;
        firstName: string | null;
        lastName: string | null;
        email: string;
        hackatimeAccount: string | null;
      };
    },
    options: {
      strict: boolean;
      cache: Map<string, Map<string, number>>;
      baseUrl: string;
      apiKey?: string;
    },
  ) {
    const { strict, cache, baseUrl, apiKey } = options;

    if (!project.user?.hackatimeAccount) {
      if (strict) {
        throw new BadRequestException('User has no hackatime account linked');
      }
      return {
        skipped: true as const,
        reason: 'missing_hackatime_account' as const,
      };
    }

    const hackatimeProjects = project.nowHackatimeProjects || [];

    if (hackatimeProjects.length === 0) {
      const updated = await this.prisma.project.update({
        where: { projectId: project.projectId },
        data: { nowHackatimeHours: 0 },
        include: projectAdminInclude,
      });

      return { project: updated };
    }

    const cacheKey = project.user.hackatimeAccount;
    let projectsMap = cache.get(cacheKey);

    if (!projectsMap) {
      const data = await this.fetchHackatimeProjectsData(
        cacheKey,
        baseUrl,
        apiKey,
      );
      projectsMap = data.projectsMap;
      cache.set(cacheKey, projectsMap);
    }

    const recalculatedHours = await this.calculateHackatimeHours(
      hackatimeProjects,
      projectsMap,
      project.user.hackatimeAccount,
      baseUrl,
      apiKey,
    );

    const updatedProject = await this.prisma.project.update({
      where: { projectId: project.projectId },
      data: { nowHackatimeHours: recalculatedHours },
      include: projectAdminInclude,
    });

    return { project: updatedProject };
  }

  private async fetchHackatimeProjectsData(
    hackatimeAccount: string,
    baseUrl: string,
    apiKey?: string,
  ) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(
      `${baseUrl}/user/projects?id=${hackatimeAccount}`,
      {
        method: 'GET',
        headers,
      },
    );

    if (!response.ok) {
      throw new BadRequestException('Failed to fetch hackatime projects');
    }

    const rawData = await response.json();
    const projectsMap = new Map<string, number>();

    const addProject = (entry: any) => {
      if (typeof entry === 'string') {
        if (!projectsMap.has(entry)) {
          projectsMap.set(entry, 0);
        }
        return;
      }

      const name = entry?.name || entry?.projectName;

      if (typeof name === 'string') {
        const duration =
          typeof entry?.total_duration === 'number' ? entry.total_duration : 0;
        projectsMap.set(name, duration);
      }
    };

    if (Array.isArray(rawData)) {
      rawData.forEach(addProject);
    } else if (Array.isArray(rawData?.projects)) {
      rawData.projects.forEach(addProject);
    } else if (rawData?.name || rawData?.projectName) {
      addProject(rawData);
    }

    return { projectsMap };
  }

  private async fetchHackatimeProjectDurationsAfterDate(
    hackatimeAccount: string,
    projectNames: string[],
    baseUrl: string,
    apiKey?: string,
    cutoffDate: Date = new Date(
      process.env.HACKATIME_CUTOFF_DATE || '2025-10-10T00:00:00Z',
    ),
  ): Promise<Map<string, number>> {
    const startDate = cutoffDate.toISOString().split('T')[0];
    const uri = `https://hackatime.hackclub.com/api/v1/users/${hackatimeAccount}/stats?features=projects&start_date=${startDate}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const durationsMap = new Map<string, number>();

    for (const projectName of projectNames) {
      durationsMap.set(projectName, 0);
    }

    try {
      const response = await fetch(uri, {
        method: 'GET',
        headers,
      });

      if (response.ok) {
        const responseData = await response.json();
        const projects = responseData?.data?.projects;

        if (projects && Array.isArray(projects)) {
          for (const project of projects) {
            const name = project?.name;
            if (typeof name === 'string' && projectNames.includes(name)) {
              const duration =
                typeof project?.total_seconds === 'number'
                  ? project.total_seconds
                  : 0;
              durationsMap.set(name, duration);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching hackatime stats:', error);
    }

    return durationsMap;
  }

  private async calculateHackatimeHours(
    projectNames: string[],
    projectsMap: Map<string, number>,
    hackatimeAccount?: string,
    baseUrl?: string,
    apiKey?: string,
  ) {
    if (hackatimeAccount && baseUrl) {
      const cutoffDate = new Date(
        process.env.HACKATIME_CUTOFF_DATE || '2025-10-10T00:00:00Z',
      );
      const filteredDurations =
        await this.fetchHackatimeProjectDurationsAfterDate(
          hackatimeAccount,
          projectNames,
          baseUrl,
          apiKey,
          cutoffDate,
        );

      let totalSeconds = 0;
      for (const name of projectNames) {
        totalSeconds += filteredDurations.get(name) || 0;
      }

      return Math.round((totalSeconds / 3600) * 10) / 10;
    }

    let totalSeconds = 0;
    for (const name of projectNames) {
      totalSeconds += projectsMap.get(name) || 0;
    }

    return Math.round((totalSeconds / 3600) * 10) / 10;
  }

  async getGlobalSettings() {
    let settings = await this.prisma.globalSettings.findUnique({
      where: { id: 'global' },
    });

    // Create default settings if they don't exist
    if (!settings) {
      settings = await this.prisma.globalSettings.create({
        data: {
          id: 'global',
          submissionsFrozen: false,
        },
      });
    }

    return settings;
  }

  async toggleSubmissionsFrozen(isFrozen: boolean, adminUserId: number) {
    const settings = await this.prisma.globalSettings.upsert({
      where: { id: 'global' },
      update: {
        submissionsFrozen: isFrozen,
        submissionsFrozenAt: isFrozen ? new Date() : null,
        submissionsFrozenBy: isFrozen ? adminUserId.toString() : null,
      },
      create: {
        id: 'global',
        submissionsFrozen: isFrozen,
        submissionsFrozenAt: isFrozen ? new Date() : null,
        submissionsFrozenBy: isFrozen ? adminUserId.toString() : null,
      },
    });

    return settings;
  }

  async getPriorityUsers() {
    const priorityUsers = await this.prisma.$queryRaw<
      Array<{
        user_id: number;
        email: string;
        first_name: string | null;
        last_name: string | null;
        total_approved_hours: number;
        potential_hours_if_approved: number;
        reason: string;
      }>
    >`
      WITH projects_with_pending AS (
        SELECT DISTINCT p.project_id
        FROM projects p
        INNER JOIN submissions s ON s.project_id = p.project_id
        WHERE s.approval_status = 'pending'
      ),
      user_hours AS (
        SELECT
          u.user_id,
          u.email,
          u.first_name,
          u.last_name,
          COALESCE(SUM(p.approved_hours), 0) AS total_approved_hours,
          COALESCE(SUM(
            CASE
              WHEN pwp.project_id IS NOT NULL THEN COALESCE(p.now_hackatime_hours, 0)
              ELSE COALESCE(p.approved_hours, 0)
            END
          ), 0) AS potential_hours_if_approved
        FROM users u
        LEFT JOIN projects p ON p.user_id = u.user_id
        LEFT JOIN projects_with_pending pwp ON pwp.project_id = p.project_id
        GROUP BY u.user_id, u.email, u.first_name, u.last_name
      )
      SELECT
        user_id,
        email,
        first_name,
        last_name,
        total_approved_hours,
        potential_hours_if_approved,
        CASE
          WHEN potential_hours_if_approved >= 50 THEN 'Would reach 50+ if pending approved'
          ELSE 'Other'
        END AS reason
      FROM user_hours
      WHERE
        total_approved_hours < 50
        AND potential_hours_if_approved >= 50
      ORDER BY total_approved_hours DESC, potential_hours_if_approved DESC
    `;

    return priorityUsers.map((user) => ({
      userId: user.user_id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      totalApprovedHours: Number(user.total_approved_hours),
      potentialHoursIfApproved: Number(user.potential_hours_if_approved),
      reason: user.reason,
    }));
  }

  async searchUsers(query: string) {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const searchTerm = query.trim();

    return this.prisma.user.findMany({
      where: {
        role: 'user',
        OR: [
          { email: { contains: searchTerm, mode: 'insensitive' } },
          { firstName: { contains: searchTerm, mode: 'insensitive' } },
          { lastName: { contains: searchTerm, mode: 'insensitive' } },
        ],
      },
      select: {
        userId: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getElevatedUsers() {
    return this.prisma.user.findMany({
      where: {
        role: { in: ['admin', 'reviewer', 'superadmin'] },
      },
      select: {
        userId: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateUserRole(userId: number, role: string, requestingUserId: number) {
    if (userId === requestingUserId) {
      throw new BadRequestException('Cannot change your own role');
    }

    const user = await this.prisma.user.findUnique({
      where: { userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === 'superadmin') {
      throw new ForbiddenException('Cannot modify another superadmin\'s role');
    }

    if (role === 'superadmin') {
      throw new ForbiddenException('Cannot promote users to superadmin');
    }

    return this.prisma.user.update({
      where: { userId },
      data: { role },
      select: {
        userId: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });
  }

  async getSubmissionAuditLogs(submissionId: number) {
    const submission = await this.prisma.submission.findUnique({
      where: { submissionId },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const logs = await this.prisma.submissionAuditLog.findMany({
      where: { submissionId },
      orderBy: { createdAt: 'desc' },
    });

    // Resolve admin user info
    const adminIds = [...new Set(logs.map((l) => l.adminId))];
    const admins = await this.prisma.user.findMany({
      where: { userId: { in: adminIds } },
      select: { userId: true, firstName: true, lastName: true, email: true },
    });
    const adminMap = new Map(admins.map((a) => [a.userId, a]));

    return logs.map((log) => ({
      ...log,
      admin: adminMap.get(log.adminId) || null,
    }));
  }

  async getProjectTimeline(projectId: number) {
    const project = await this.prisma.project.findUnique({
      where: { projectId },
      include: {
        user: {
          select: {
            userId: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        submissions: {
          orderBy: { createdAt: 'asc' },
          include: {
            auditLogs: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    type TimelineEvent = {
      type:
        | 'project_created'
        | 'submission'
        | 'resubmission'
        | 'project_updated'
        | 'admin_review'
        | 'admin_update';
      timestamp: Date;
      actor: {
        userId: number;
        firstName: string | null;
        lastName: string | null;
        email: string;
      } | null;
      details: Record<string, any>;
    };

    const events: TimelineEvent[] = [];

    // 1. Project creation
    events.push({
      type: 'project_created',
      timestamp: project.createdAt,
      actor: project.user,
      details: {
        projectTitle: project.projectTitle,
        projectType: project.projectType,
      },
    });

    // Resolve all admin IDs from audit logs + reviewedBy fields upfront
    const allAuditLogs = project.submissions.flatMap((s) => s.auditLogs);
    const adminIds = new Set(allAuditLogs.map((l) => l.adminId));
    for (const sub of project.submissions) {
      if (sub.reviewedBy) {
        const parsed = parseInt(sub.reviewedBy);
        if (!isNaN(parsed)) adminIds.add(parsed);
      }
    }
    const adminIdArray = [...adminIds];
    const admins =
      adminIdArray.length > 0
        ? await this.prisma.user.findMany({
            where: { userId: { in: adminIdArray } },
            select: {
              userId: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          })
        : [];
    const adminMap = new Map(admins.map((a) => [a.userId, a]));

    // 2. Submissions & 3. User project detail changes (diff between submissions)
    for (let i = 0; i < project.submissions.length; i++) {
      const submission = project.submissions[i];
      const isFirst = i === 0;

      events.push({
        type: isFirst ? 'submission' : 'resubmission',
        timestamp: submission.createdAt,
        actor: project.user,
        details: {
          submissionId: submission.submissionId,
          playableUrl: submission.playableUrl,
          repoUrl: submission.repoUrl,
          screenshotUrl: submission.screenshotUrl,
          description: submission.description,
          hackatimeHours: submission.hackatimeHours,
        },
      });

      // Detect changes between this submission and the previous one
      if (!isFirst) {
        const prev = project.submissions[i - 1];
        const changedFields: Record<string, { from: any; to: any }> = {};
        for (const field of [
          'playableUrl',
          'repoUrl',
          'screenshotUrl',
          'description',
        ] as const) {
          if (submission[field] !== prev[field]) {
            changedFields[field] = { from: prev[field], to: submission[field] };
          }
        }
        if (Object.keys(changedFields).length > 0) {
          events.push({
            type: 'project_updated',
            timestamp: submission.createdAt,
            actor: project.user,
            details: {
              submissionId: submission.submissionId,
              changedFields,
            },
          });
        }
      }

      // 4. Admin audit log entries for this submission
      for (const log of submission.auditLogs) {
        events.push({
          type: log.action === 'review' ? 'admin_review' : 'admin_update',
          timestamp: log.createdAt,
          actor: adminMap.get(log.adminId) || null,
          details: {
            submissionId: submission.submissionId,
            auditLogId: log.id,
            action: log.action,
            newStatus: log.newStatus,
            approvedHours: log.approvedHours,
            changes: log.changes,
          },
        });
      }

      // Fallback: if submission was reviewed but has no audit log review entries,
      // synthesize one from the submission's own reviewedBy/reviewedAt fields
      const hasAuditReview = submission.auditLogs.some(
        (l) => l.action === 'review',
      );
      if (!hasAuditReview && submission.reviewedBy && submission.reviewedAt) {
        const reviewerAdminId = parseInt(submission.reviewedBy);
        events.push({
          type: 'admin_review',
          timestamp: submission.reviewedAt,
          actor: !isNaN(reviewerAdminId)
            ? adminMap.get(reviewerAdminId) || null
            : null,
          details: {
            submissionId: submission.submissionId,
            newStatus: submission.approvalStatus,
            approvedHours: submission.approvedHours,
            legacy: true,
          },
        });
      }
    }

    // Sort all events chronologically
    events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return {
      projectId: project.projectId,
      projectTitle: project.projectTitle,
      user: project.user,
      timeline: events,
    };
  }
}
