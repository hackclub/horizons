import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SlackService } from '../slack/slack.service';
import { ManifestService } from '../manifest/manifest.service';
import * as Papa from 'papaparse';

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
      hackatimeStartDate: true,
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
    private manifestService: ManifestService,
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

  async getProject(projectId: number) {
    const project = await this.prisma.project.findUnique({
      where: { projectId },
      include: projectAdminInclude,
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  async updateProject(
    projectId: number,
    dto: {
      projectTitle?: string;
      projectType?: string;
      description?: string | null;
      playableUrl?: string | null;
      repoUrl?: string | null;
      readmeUrl?: string | null;
      journalUrl?: string | null;
      screenshotUrl?: string | null;
      nowHackatimeProjects?: string[];
      adminComment?: string | null;
      hoursJustification?: string | null;
      approvedHours?: number | null;
      isLocked?: boolean;
    },
  ) {
    const existing = await this.prisma.project.findUnique({
      where: { projectId },
      select: {
        projectId: true,
        nowHackatimeProjects: true,
        repoUrl: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Project not found');
    }

    const data: Record<string, any> = {};
    const keys = [
      'projectTitle',
      'projectType',
      'description',
      'playableUrl',
      'repoUrl',
      'readmeUrl',
      'journalUrl',
      'screenshotUrl',
      'adminComment',
      'hoursJustification',
      'approvedHours',
      'isLocked',
    ] as const;
    for (const key of keys) {
      if (dto[key] !== undefined) {
        const value = dto[key] as any;
        data[key] = typeof value === 'string' && value.trim() === '' ? null : value;
      }
    }

    let hackatimeProjectsChanged = false;
    if (dto.nowHackatimeProjects !== undefined) {
      const next = Array.from(
        new Set(dto.nowHackatimeProjects.map((n) => n.trim()).filter(Boolean)),
      );
      const prev = existing.nowHackatimeProjects ?? [];
      const sameLength = prev.length === next.length;
      const sameContent = sameLength && prev.every((n) => next.includes(n));
      if (!sameContent) {
        data.nowHackatimeProjects = next;
        hackatimeProjectsChanged = true;
      }
    }

    await this.prisma.project.update({
      where: { projectId },
      data,
    });

    if (hackatimeProjectsChanged) {
      try {
        await this.recalculateProjectHours(projectId, false);
      } catch {
        // best-effort; caller sees updated fields even if recalc fails
      }
    }

    if (
      data.repoUrl !== undefined &&
      data.repoUrl &&
      data.repoUrl !== existing.repoUrl
    ) {
      this.manifestService.createDraft(data.repoUrl).catch(() => {});
    }

    return this.getProject(projectId);
  }

  async listProjectOwnerHackatimeProjects(projectId: number) {
    const project = await this.prisma.project.findUnique({
      where: { projectId },
      select: {
        projectId: true,
        nowHackatimeProjects: true,
        user: {
          select: {
            hackatimeAccount: true,
            hackatimeStartDate: true,
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (!project.user.hackatimeAccount) {
      return {
        projects: [],
        linked: project.nowHackatimeProjects ?? [],
        hackatimeAccount: null,
        hackatimeStartDate: null,
      };
    }

    const baseUrl =
      process.env.HACKATIME_ADMIN_API_URL ||
      'https://hackatime.hackclub.com/api/admin/v1';
    const apiKey = process.env.HACKATIME_API_KEY;

    const { projectsMap } = await this.fetchHackatimeProjectsData(
      project.user.hackatimeAccount,
      baseUrl,
      apiKey,
    );

    const cutoff =
      project.user.hackatimeStartDate ??
      new Date(process.env.HACKATIME_CUTOFF_DATE || '2025-10-10T00:00:00Z');

    const names = Array.from(projectsMap.keys());
    const filtered = await this.fetchHackatimeProjectDurationsAfterDate(
      project.user.hackatimeAccount,
      names,
      baseUrl,
      apiKey,
      cutoff,
    );

    const projects = names
      .map((name) => ({
        name,
        totalHours:
          Math.round(((filtered.get(name) ?? 0) / 3600) * 10) / 10,
      }))
      .sort((a, b) => b.totalHours - a.totalHours);

    return {
      projects,
      linked: project.nowHackatimeProjects ?? [],
      hackatimeAccount: project.user.hackatimeAccount,
      hackatimeStartDate: project.user.hackatimeStartDate,
    };
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

    // The latest historical DAU snapshot is yesterday (cron runs at midnight
    // UTC and snapshots the prior day). Today is mid-stream and not in the
    // snapshot table, so this is genuinely yesterday's count.
    const dauData = historical.dau;
    const dauYesterday = dauData.length > 0 ? dauData[dauData.length - 1].value : 0;
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
      yesterday: dauYesterday,
      avg7: Math.round(avg7 * 10) / 10,
      avg30: Math.round(avg30 * 10) / 10,
      growthPercent7: dauGrowthPercent,
      perEvent: dauPerEvent,
    };

    return { funnel, userGrowth, reviewStats, reviewProjects, signups, utm, historical, dau };
  }

  private async computeDauPerEvent() {
    // Read yesterday's per-event DAU from the snapshot table. The snapshot job
    // derives both top-level DAU and the per-event breakdown from the same
    // Hackatime activity data, so per-event sums reconcile with the overall
    // DAU. Showing today's value would be a partial mid-stream count and
    // wouldn't match the Hackatime-based top metric.
    const yesterdayStart = new Date();
    yesterdayStart.setUTCHours(0, 0, 0, 0);
    yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);

    const rows = await this.prisma.historicalMetric.findMany({
      where: {
        date: yesterdayStart,
        metric: { startsWith: 'dau_event.' },
      },
    });

    if (rows.length === 0) return [];

    const slugToCount = new Map<string, number>();
    for (const row of rows) {
      const slug = row.metric.slice('dau_event.'.length);
      const count = typeof row.value === 'number' ? row.value : Number(row.value) || 0;
      if (count > 0) slugToCount.set(slug, count);
    }

    if (slugToCount.size === 0) return [];

    const events = await this.prisma.event.findMany({
      where: { slug: { in: [...slugToCount.keys()] } },
      select: { eventId: true, title: true, slug: true },
    });

    return events
      .map((e) => ({
        eventId: e.eventId,
        title: e.title,
        slug: e.slug,
        count: slugToCount.get(e.slug) ?? 0,
      }))
      .sort((a, b) => b.count - a.count);
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

    // Median review time this week
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

    // Last reviewed project's review turnaround time
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

    // Last fraud-checked project's turnaround time
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
      trackedHours: trackedAgg._sum.nowHackatimeHours ?? 0,
      unshippedHours: unshippedAgg._sum.nowHackatimeHours ?? 0,
      shippedHours: shippedAgg._sum.nowHackatimeHours ?? 0,
      hoursInReview: Number(hoursInReviewResult[0]?.total_hours ?? 0),
      approvedHours: approved,
      weightedGrants: Math.round((approved / 10) * 100) / 100,
      medianReviewTimeThisWeek,
      medianFraudCheckTimeThisWeek,
      lastProjectReviewTime,
      lastProjectFraudCheckTime,
    };
  }

  private async computeReviewProjects() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

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
      // Projects with >= 1 submission
      this.prisma.project.count({ where: { submissions: { some: {} } } }),
      // Projects that passed fraud check (includes reviewed)
      this.prisma.project.count({
        where: {
          joeFraudPassed: true,
          submissions: { some: {} },
        },
      }),
      // Fraud queue: shipped but not yet fraud checked (joeFraudPassed is null)
      this.prisma.project.count({
        where: {
          joeFraudPassed: null,
          submissions: { some: {} },
        },
      }),
      // Review queue: pending submissions the reviewer hasn't decided on yet.
      // Fraud state is independent; the reviewer can act regardless.
      this.prisma.submission.count({
        where: { approvalStatus: 'pending', reviewPassed: null },
      }),
      // Awaiting fraud: reviewer decided, state machine is waiting on fraud.
      this.prisma.submission.count({
        where: { approvalStatus: 'pending', reviewPassed: { not: null } },
      }),
      // Silent rejects (fraud failed, no user notification fired).
      this.prisma.submission.count({
        where: { approvalStatus: 'rejected', silentReject: true },
      }),
      this.prisma.project.count({
        where: {
          submissions: { some: { approvalStatus: { in: ['approved', 'rejected'] } } },
        },
      }),
      this.prisma.project.count({
        where: { submissions: { some: { approvalStatus: 'approved' } } },
      }),
      // Shipped in the past week (projects with a submission created in the past 7 days)
      this.prisma.project.count({
        where: { submissions: { some: { createdAt: { gte: sevenDaysAgo } } } },
      }),
      // Fraud checked in the past week
      this.prisma.project.count({
        where: {
          joeFraudPassed: true,
          submissions: { some: { createdAt: { gte: sevenDaysAgo } } },
        },
      }),
      // Reviewed in the past week
      this.prisma.project.count({
        where: {
          submissions: { some: { reviewedAt: { gte: sevenDaysAgo }, approvalStatus: { in: ['approved', 'rejected'] } } },
        },
      }),
    ]);

    const funnelMatrix = await this.computeFunnelMatrix();

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
   * submission. Returns a 3×3 count matrix the admin dashboard renders as a
   * state grid.
   *
   * Under the fraud-wins rule (fraud=false → silent reject regardless of reviewer),
   * fraud-failed column cells are all silent-rejects. The reviewer bucket is
   * determined by what the reviewer had recorded at the time of the transition,
   * which may be null (fraud fired first) / true (reviewer approved but fraud
   * then failed) / false (reviewer rejected first, then fraud later failed).
   */
  private async computeFunnelMatrix() {
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

    // Per-event qualification funnel: signed up → ≥15h approved (RSVPed) →
    // ≥30h approved (qualified). Approved hours sum across all of a user's
    // projects.
    const qualificationResult = await this.prisma.$queryRaw<
      Array<{
        event_id: number;
        title: string;
        slug: string;
        signed_up: bigint;
        rsvped: bigint;
        qualified: bigint;
      }>
    >`
      SELECT
        e.event_id,
        e.title,
        e.slug,
        COUNT(pe.id) AS signed_up,
        COUNT(*) FILTER (WHERE COALESCE(ut.total_hours, 0) >= 15) AS rsvped,
        COUNT(*) FILTER (WHERE COALESCE(ut.total_hours, 0) >= 30) AS qualified
      FROM pinned_events pe
      INNER JOIN events e ON e.event_id = pe.event_id
      LEFT JOIN (
        SELECT user_id, SUM(approved_hours) AS total_hours
        FROM projects
        GROUP BY user_id
      ) ut ON ut.user_id = pe.user_id
      GROUP BY e.event_id, e.title, e.slug
      ORDER BY signed_up DESC
    `;

    // Origin country → destination event country routes for map
    // Only require an origin country — events without a country still
    // contribute their attendees to the origin choropleth. Empty event
    // country is normalized to '' and skipped on the host-highlight side.
    const routesResult = await this.prisma.$queryRaw<
      Array<{
        origin_country: string;
        event_country: string | null;
        event_title: string;
        count: bigint;
      }>
    >`
      SELECT u.country AS origin_country, e.country AS event_country, e.title AS event_title, COUNT(*) AS count
      FROM pinned_events pe
      INNER JOIN users u ON u.user_id = pe.user_id
      INNER JOIN events e ON e.event_id = pe.event_id
      WHERE u.country IS NOT NULL AND u.country != ''
      GROUP BY u.country, e.country, e.title
      ORDER BY count DESC
    `;

    const routes = routesResult.map((r) => ({
      originCountry: r.origin_country,
      eventCountry: r.event_country ?? '',
      eventTitle: r.event_title,
      count: Number(r.count),
    }));

    // Counts to surface as map warnings: pinned users with no country, and
    // events that have pinned users but no country set themselves.
    const [signupsMissingOriginRow, eventsMissingCountry] = await Promise.all([
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count
        FROM pinned_events pe
        INNER JOIN users u ON u.user_id = pe.user_id
        WHERE u.country IS NULL OR u.country = ''
      `,
      this.prisma.event.findMany({
        where: {
          OR: [{ country: null }, { country: '' }],
          pinnedBy: { some: {} },
        },
        select: { title: true },
        orderBy: { title: 'asc' },
      }),
    ]);
    const signupsMissingOrigin = Number(signupsMissingOriginRow[0]?.count ?? 0);

    return {
      total,
      perEvent: perEventResult.map((r) => ({
        eventId: r.event_id,
        title: r.title,
        slug: r.slug,
        count: Number(r.count),
      })),
      qualification: qualificationResult.map((r) => ({
        eventId: r.event_id,
        title: r.title,
        slug: r.slug,
        signedUp: Number(r.signed_up),
        rsvped: Number(r.rsvped),
        qualified: Number(r.qualified),
      })),
      routes,
      signupsMissingOrigin,
      eventsMissingCountry: eventsMissingCountry.map((e) => e.title),
    };
  }

  private async computeUtm() {
    const [groups, onboardedGroups, shipped10hGroups] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['utmSource'],
        _count: { _all: true },
        where: { utmSource: { not: null } },
        orderBy: { _count: { utmSource: 'desc' } },
      }),
      this.prisma.user.groupBy({
        by: ['utmSource'],
        _count: { _all: true },
        where: { utmSource: { not: null }, onboardComplete: true },
      }),
      this.prisma.user.groupBy({
        by: ['utmSource'],
        _count: { _all: true },
        where: {
          utmSource: { not: null },
          projects: { some: { nowHackatimeHours: { gte: 10 } } },
        },
      }),
    ]);

    const onboardedBySource = new Map(
      onboardedGroups.map((g) => [g.utmSource!, g._count._all]),
    );
    const shipped10hBySource = new Map(
      shipped10hGroups.map((g) => [g.utmSource!, g._count._all]),
    );

    return {
      sources: groups.map((g) => ({
        source: g.utmSource!,
        count: g._count._all,
        onboardedCount: onboardedBySource.get(g.utmSource!) ?? 0,
        shipped10HoursCount: shipped10hBySource.get(g.utmSource!) ?? 0,
      })),
    };
  }

  private async computeHistorical(thirtyDaysAgo: Date) {
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
      newSignups: [],           // cumulative (total_users)
      submissionsCreated: [],   // cumulative running sum
      reviewsCompleted: [],     // cumulative running sum
      medianReviewTimeHours: [],
      medianFraudCheckTimeHours: [],
      dailyHoursLogged: [],
      projectsShipped: [],
      projectsFraudChecked: [],
    };

    // First pass: collect raw daily values
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

      // Extract review_projects JSON snapshot for shipped/fraudChecked series
      if (row.metric === 'review_projects') {
        const obj = typeof row.value === 'object' && row.value !== null ? row.value as Record<string, any> : {};
        const shipped = Number(obj.shipped) || 0;
        const fraudChecked = Number(obj.passingFraudInQueue) || 0;
        result.projectsShipped.push({ date: dateStr, value: shipped });
        result.projectsFraudChecked.push({ date: dateStr, value: fraudChecked });
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
    const yesterdayStart = new Date();
    yesterdayStart.setUTCHours(0, 0, 0, 0);
    yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);

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

    // Yesterday's DAU for this event — read from the snapshot table so the
    // value is consistent with the dashboard top-level DAU and the per-event
    // breakdown (both Hackatime-activity-derived). Today's value would be a
    // partial mid-stream count and wouldn't reconcile.
    const dauRow = await this.prisma.historicalMetric.findUnique({
      where: { date_metric: { date: yesterdayStart, metric: `dau_event.${slug}` } },
    });
    const dauYesterday = dauRow
      ? typeof dauRow.value === 'number'
        ? dauRow.value
        : Number(dauRow.value) || 0
      : 0;

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
      dauYesterday,
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

  async updateUser(
    userId: number,
    dto: { hackatimeStartDate?: string | null },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { userId: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const data: { hackatimeStartDate?: Date | null } = {};
    if (dto.hackatimeStartDate === null) {
      data.hackatimeStartDate = null;
    } else if (dto.hackatimeStartDate !== undefined) {
      const parsed = new Date(dto.hackatimeStartDate);
      if (isNaN(parsed.getTime())) {
        throw new BadRequestException('Invalid hackatimeStartDate');
      }
      data.hackatimeStartDate = parsed;
    }

    const updatedUser = await this.prisma.user.update({
      where: { userId },
      data,
      select: { userId: true, hackatimeStartDate: true },
    });

    const projects = await this.prisma.project.findMany({
      where: { userId },
      include: projectAdminInclude,
    });

    const baseUrl =
      process.env.HACKATIME_ADMIN_API_URL ||
      'https://hackatime.hackclub.com/api/admin/v1';
    const apiKey = process.env.HACKATIME_API_KEY;
    const cache = new Map<string, Map<string, number>>();
    let recalculatedProjects = 0;

    for (const project of projects) {
      try {
        const result = await this.recalculateProjectInternal(project, {
          strict: false,
          cache,
          baseUrl,
          apiKey,
        });
        if (result?.project) recalculatedProjects++;
      } catch {
        // swallow per-project failures; recalc is best-effort here
      }
    }

    return {
      userId: updatedUser.userId,
      hackatimeStartDate: updatedUser.hackatimeStartDate,
      recalculatedProjects,
    };
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
        hackatimeStartDate?: Date | null;
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
      project.user.hackatimeStartDate,
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
    userStartDate?: Date | null,
  ) {
    if (hackatimeAccount && baseUrl) {
      const cutoffDate =
        userStartDate ??
        new Date(process.env.HACKATIME_CUTOFF_DATE || '2025-10-10T00:00:00Z');
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

  private readonly HACKATIME_BASE_URL = 'https://hackatime.hackclub.com';

  private async fetchHackatimeProjectNames(
    slackId: string,
    startDateOverride?: Date | null,
  ): Promise<Set<string>> {
    const startDate = (
      startDateOverride ??
      new Date(process.env.HACKATIME_CUTOFF_DATE || '2026-02-21T00:00:00Z')
    )
      .toISOString()
      .split('T')[0];

    try {
      const response = await fetch(
        `${this.HACKATIME_BASE_URL}/api/v1/users/${slackId}/stats?features=projects&start_date=${startDate}`,
      );

      if (!response.ok) return new Set();

      const data = await response.json();
      const names = new Set<string>();

      const projects = data?.data?.projects;
      if (Array.isArray(projects)) {
        for (const p of projects) {
          if (typeof p?.name === 'string') names.add(p.name);
        }
      }

      return names;
    } catch {
      return new Set();
    }
  }

  async importCsv(fileBuffer: Buffer) {
    const csvString = fileBuffer.toString('utf-8');
    const parsed = Papa.parse<Record<string, string>>(csvString, {
      header: true,
      skipEmptyLines: true,
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      throw new BadRequestException(
        `CSV parsing failed: ${parsed.errors[0].message}`,
      );
    }

    const results = {
      total: parsed.data.length,
      usersCreated: 0,
      projectsCreated: 0,
      skipped: 0,
      skippedDetails: [] as { row: number; email: string; reason: string }[],
      errors: [] as { row: number; email: string; message: string }[],
    };

    for (let i = 0; i < parsed.data.length; i++) {
      const row = parsed.data[i];
      const rowNum = i + 2; // 1-indexed + header row
      const email = row['Email']?.trim();
      const codeUrl = row['Code URL']?.trim();
      const description = row['Description']?.trim();
      const hackatimeProjectName = row['hackatime_project_name']?.trim();
      const firstName = row['First Name']?.trim() || 'Imported';
      const lastName = row['Last Name']?.trim() || 'User';
      const slackId = row['Slack ID']?.trim();
      const startDateRaw = row['Hackatime Start Date']?.trim();

      if (!email) {
        results.errors.push({
          row: rowNum,
          email: '',
          message: 'Missing email',
        });
        continue;
      }

      let hackatimeStartDate: Date | null = null;
      if (startDateRaw) {
        const parsedDate = new Date(startDateRaw);
        if (isNaN(parsedDate.getTime())) {
          results.errors.push({
            row: rowNum,
            email,
            message: `Invalid Hackatime Start Date: "${startDateRaw}"`,
          });
          continue;
        }
        hackatimeStartDate = parsedDate;
      }

      try {
        // 1. Resolve or create user
        let user = await this.prisma.user.findUnique({
          where: { email },
          include: {
            projects: {
              select: {
                repoUrl: true,
                nowHackatimeProjects: true,
                playableUrl: true,
              },
            },
          },
        });

        let userCreated = false;
        if (!user) {
          user = await this.prisma.user.create({
            data: {
              hcaId: `import-${email}`,
              email,
              firstName,
              lastName,
              slackUserId: slackId || null,
              hackatimeStartDate,
            },
            include: {
              projects: {
                select: {
                  repoUrl: true,
                  nowHackatimeProjects: true,
                  playableUrl: true,
                },
              },
            },
          });
          userCreated = true;
          results.usersCreated++;
        } else if (hackatimeStartDate) {
          await this.prisma.user.update({
            where: { userId: user.userId },
            data: { hackatimeStartDate },
          });
          user.hackatimeStartDate = hackatimeStartDate;
        }

        // 2. Parse and verify hackatime project names
        let hackatimeProjects: string[] = [];
        if (hackatimeProjectName) {
          const rawNames = hackatimeProjectName
            .split(', ')
            .map((n) => n.trim())
            .filter(Boolean);

          if (slackId) {
            const validNames = await this.fetchHackatimeProjectNames(
              slackId,
              user.hackatimeStartDate,
            );
            if (validNames.size > 0) {
              hackatimeProjects = rawNames.filter((n) => validNames.has(n));
            } else {
              // API unreachable or no projects — use raw names as fallback
              hackatimeProjects = rawNames;
            }
          } else {
            hackatimeProjects = rawNames;
          }
        }

        // 3. Overlap detection
        const existingProjects = user.projects;
        let hasOverlap = false;
        let overlapReason = '';

        for (const existing of existingProjects) {
          // Check repoUrl overlap
          if (codeUrl && existing.repoUrl && existing.repoUrl === codeUrl) {
            hasOverlap = true;
            overlapReason = `Matching repo URL: ${codeUrl}`;
            break;
          }

          // Check hackatime project overlap
          if (
            hackatimeProjects.length > 0 &&
            existing.nowHackatimeProjects?.length
          ) {
            const existingSet = new Set(existing.nowHackatimeProjects);
            const overlap = hackatimeProjects.filter((n) =>
              existingSet.has(n),
            );
            if (overlap.length > 0) {
              hasOverlap = true;
              overlapReason = `Matching hackatime project(s): ${overlap.join(', ')}`;
              break;
            }
          }
        }

        if (hasOverlap) {
          results.skipped++;
          results.skippedDetails.push({
            row: rowNum,
            email,
            reason: overlapReason,
          });
          continue;
        }

        // 4. Derive project title
        let projectTitle = '';
        if (hackatimeProjects.length > 0) {
          projectTitle = hackatimeProjects[0];
        } else if (codeUrl) {
          // Extract repo name from GitHub URL
          const match = codeUrl.match(
            /github\.com\/[^/]+\/([^/?#]+)/,
          );
          projectTitle = match ? match[1] : 'Imported Project';
        } else {
          projectTitle = 'Imported Project';
        }
        projectTitle = projectTitle.substring(0, 30);

        // 5. Create project
        await this.prisma.project.create({
          data: {
            userId: user.userId,
            projectTitle,
            projectType: 'web_playable',
            description: description
              ? description.substring(0, 500)
              : null,
            repoUrl: codeUrl || null,
            nowHackatimeProjects: hackatimeProjects,
          },
        });

        results.projectsCreated++;
      } catch (error) {
        results.errors.push({
          row: rowNum,
          email,
          message:
            error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  async exportCsv(): Promise<string> {
    const users = await this.prisma.user.findMany({
      select: {
        userId: true,
        email: true,
        firstName: true,
        lastName: true,
        slackUserId: true,
        hackatimeAccount: true,
        createdAt: true,
        projects: {
          select: { createdAt: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
        pinnedEvent: {
          select: {
            event: { select: { title: true } },
            createdAt: true,
          },
        },
      },
    });

    // Get first submission per user via a single query
    const firstSubmissions = await this.prisma.$queryRaw<
      { user_id: number; first_submission_at: Date }[]
    >`
      SELECT p.user_id, MIN(s.created_at) AS first_submission_at
      FROM submissions s
      JOIN projects p ON p.project_id = s.project_id
      GROUP BY p.user_id
    `;
    const submissionMap = new Map(
      firstSubmissions.map((r) => [r.user_id, r.first_submission_at]),
    );

    // Get hackatime link time from OTPs (usedAt as proxy)
    const hackatimeLinks = await this.prisma.hackatimeLinkOtp.findMany({
      where: { usedAt: { not: null } },
      select: { userId: true, usedAt: true },
      orderBy: { usedAt: 'asc' },
      distinct: ['userId'],
    });
    const hackatimeLinkMap = new Map(
      hackatimeLinks.map((r) => [r.userId, r.usedAt]),
    );

    const slackIds = users
      .map((u) => u.slackUserId)
      .filter((id): id is string => !!id);
    const displayNames = await this.slackService.getUsernames(slackIds);

    const rows = users.map((user) => ({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      slackId: user.slackUserId ?? '',
      username: (user.slackUserId && displayNames.get(user.slackUserId)) || '',
      signedUpAt: user.createdAt.toISOString(),
      hackatimeLinkedAt: hackatimeLinkMap.get(user.userId)?.toISOString() ?? '',
      firstProjectAt:
        user.projects[0]?.createdAt?.toISOString() ?? '',
      firstSubmissionAt:
        submissionMap.get(user.userId)?.toISOString() ?? '',
      pinnedEvent: user.pinnedEvent?.event?.title ?? '',
      pinnedEventAt: user.pinnedEvent?.createdAt?.toISOString() ?? '',
    }));

    return Papa.unparse(rows);
  }
}
