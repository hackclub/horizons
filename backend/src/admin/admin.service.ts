import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SlackService } from '../slack/slack.service';

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
