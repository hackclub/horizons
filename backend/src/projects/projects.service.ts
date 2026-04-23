import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { UpdateHackatimeProjectsDto } from './dto/update-hackatime-projects.dto';
import { RedisService } from '../redis.service';
import { randomBytes } from 'crypto';
import { PosthogService } from '../posthog/posthog.service';
import { AirtableService } from '../airtable/airtable.service';
import { FraudReviewService } from '../fraud-review/fraud-review.service';

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private posthog: PosthogService,
    private airtableService: AirtableService,
    private fraudReviewService: FraudReviewService,
  ) {}

  private excludeAdminFields<T extends Record<string, any>>(
    obj: T,
  ): Omit<
    T,
    | 'hoursJustification'
    | 'adminComment'
    | 'joeProjectId'
    | 'joeFraudPassed'
    | 'joeFraudReviewedAt'
    | 'joeTrustScore'
    | 'joeJustification'
    | 'joeOutcomeStatus'
    | 'joeOutcomeReason'
    | 'joeOutcomeRecordedAt'
  > {
    const {
      hoursJustification,
      adminComment,
      joeProjectId,
      joeFraudPassed,
      joeFraudReviewedAt,
      joeTrustScore,
      joeJustification,
      joeOutcomeStatus,
      joeOutcomeReason,
      joeOutcomeRecordedAt,
      ...rest
    } = obj;
    return rest;
  }

  private excludeAdminFieldsFromArray<T extends Record<string, any>>(arr: T[]) {
    return arr.map((item) => this.excludeAdminFields(item));
  }

  /**
   * User-facing view of a Submission. Strips admin-only fields and maps
   * silent-reject (reviewer approved + fraud failed) to 'pending' so the user
   * sees no difference between "waiting for review" and "handled off-service".
   */
  scopeSubmissionForUser<
    T extends {
      approvalStatus: 'pending' | 'approved' | 'rejected';
      reviewPassed: boolean | null;
    },
  >(
    submission: T,
  ): Omit<
    T,
    | 'reviewPassed'
    | 'pendingSendEmail'
    | 'finalizedAt'
    | 'reviewedBy'
    | 'airtableRecId'
    | 'reviewerAnalysis'
  > {
    const isSilentReject =
      submission.approvalStatus === 'rejected' &&
      submission.reviewPassed === true;
    const {
      reviewPassed: _rp,
      pendingSendEmail: _pe,
      finalizedAt: _fa,
      reviewedBy: _rb,
      airtableRecId: _ar,
      reviewerAnalysis: _ra,
      ...rest
    } = submission as any;
    return {
      ...rest,
      approvalStatus: isSilentReject ? 'pending' : submission.approvalStatus,
    };
  }

  async createProject(createProjectDto: CreateProjectDto, userId: number) {
    const lockKey = `project-create-lock:${userId}`;
    const lockValue = randomBytes(16).toString('hex');
    const lockTTL = 10;

    const lockAcquired = await this.redis.acquireLock(
      lockKey,
      lockValue,
      lockTTL,
    );

    if (!lockAcquired) {
      throw new BadRequestException(
        'Project creation already in progress. Please wait a moment and try again.',
      );
    }

    try {
      const existingProjectsCount = await this.prisma.project.count({
        where: { userId },
      });

      const project = await this.prisma.project.create({
        data: {
          userId,
          projectTitle: createProjectDto.projectTitle,
          projectType: createProjectDto.projectType,
          description: createProjectDto.projectDescription,
          readmeUrl: createProjectDto.readmeUrl,
        },
        include: {
          user: {
            select: {
              userId: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      this.posthog.capture({
        distinctId: String(userId),
        event: 'project_created_backend',
        properties: {
          projectId: project.projectId,
          projectType: project.projectType,
        },
      });

      if (existingProjectsCount === 0) {
        await this.prisma.user.update({
          where: { userId },
          data: {
            onboardComplete: true,
            onboardedAt: new Date(),
          },
        });

        this.posthog.capture({
          distinctId: String(userId),
          event: 'onboarding_completed_backend',
          properties: {
            projectId: project.projectId,
          },
        });

        this.airtableService
          .syncUserEvent(project.user.email, userId, 'firstProjectCreated')
          .catch((err) =>
            console.error(
              'Error syncing firstProjectCreated event to Airtable:',
              err,
            ),
          );

        this.airtableService
          .syncUserEvent(project.user.email, userId, 'onboardingCompleted')
          .catch((err) =>
            console.error(
              'Error syncing onboardingCompleted event to Airtable:',
              err,
            ),
          );
      }

      return this.excludeAdminFields(project);
    } finally {
      await this.redis.releaseLock(lockKey, lockValue);
    }
  }

  async getUserProjects(userId: number) {
    const projects = await this.prisma.project.findMany({
      where: { userId },
      include: {
        submissions: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return this.excludeAdminFieldsFromArray(projects);
  }

  async getProject(projectId: number, userId: number) {
    const project = await this.prisma.project.findUnique({
      where: { projectId },
      include: {
        user: {
          select: {
            userId: true,
            firstName: true,
            lastName: true,
          },
        },
        submissions: true,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return this.excludeAdminFields(project);
  }

  async createSubmission(
    createSubmissionDto: CreateSubmissionDto,
    userId: number,
  ) {
    const projectId = createSubmissionDto.projectId;

    // Get project with user data for validation
    const project = await this.prisma.project.findUnique({
      where: { projectId },
      include: {
        user: true,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    // Check if submissions are globally frozen
    const globalSettings = await this.prisma.globalSettings.findUnique({
      where: { id: 'global' },
    });
    if (globalSettings?.submissionsFrozen) {
      throw new ForbiddenException(
        'Submissions are currently frozen. Please try again later.',
      );
    }

    // Validate required user fields
    const user = project.user;
    if (!user.firstName || !user.lastName || !user.email || !user.birthday) {
      throw new ForbiddenException(
        'User profile incomplete. Please complete your profile first.',
      );
    }

    if (
      !user.addressLine1 ||
      !user.city ||
      !user.state ||
      !user.country ||
      !user.zipCode
    ) {
      throw new ForbiddenException(
        "Oops! Looks like your address didn't get set. Please re-link your Hack Club Account.",
      );
    }

    if (this.calculateAge(user.birthday) >= 19 && !user.ageOverride) {
      throw new ForbiddenException('You must be under 19 to submit projects.');
    }

    if (!user.hackatimeAccount) {
      throw new BadRequestException('No Hackatime account linked to this user');
    }

    // Validate required project fields
    if (
      !project.projectTitle ||
      !project.description ||
      project.nowHackatimeHours === null ||
      project.nowHackatimeHours === undefined ||
      !project.playableUrl ||
      !project.repoUrl ||
      !project.readmeUrl ||
      !project.screenshotUrl ||
      !project.nowHackatimeProjects ||
      project.nowHackatimeProjects.length === 0
    ) {
      throw new ForbiddenException(
        'Project incomplete. Please complete all required project fields first.',
      );
    }

    const hackatimeBaseUrl =
      process.env.HACKATIME_ADMIN_API_URL ||
      'https://hackatime.hackclub.com/api/admin/v1';
    const hackatimeApiKey = process.env.HACKATIME_API_KEY;
    const { projectsMap } = await this.fetchHackatimeProjectsData(
      user.hackatimeAccount,
      hackatimeBaseUrl,
      hackatimeApiKey,
    );
    const recalculatedHours = await this.calculateHackatimeHours(
      project.nowHackatimeProjects,
      projectsMap,
      user.hackatimeAccount,
      hackatimeBaseUrl,
      hackatimeApiKey,
      user.hackatimeStartDate,
    );

    // Inspect the most recent prior submission to gate eligibility and decide
    // whether this resubmission needs fresh fraud review.
    //
    // Resubmit rules:
    //   - none                        → allow (first submission)
    //   - approved                    → allow, clear joe* + re-submit to fraud
    //   - rejected + reviewPassed=false → reviewer-rejected, allow, reuse joe*
    //   - rejected + reviewPassed=null  → fraud-auto-rejected, allow, reuse joe*
    //   - rejected + reviewPassed=true  → silent reject (user sees pending) → block
    //   - pending                     → block (still in flight)
    const priorSubmission = await this.prisma.submission.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: { approvalStatus: true, reviewPassed: true },
    });

    const isResubmission = !!priorSubmission;
    if (priorSubmission) {
      const blocked =
        priorSubmission.approvalStatus === 'pending' ||
        (priorSubmission.approvalStatus === 'rejected' &&
          priorSubmission.reviewPassed === true);
      if (blocked) {
        throw new BadRequestException('You have a pending submission.');
      }
    }

    const reuseFraud =
      priorSubmission?.approvalStatus === 'rejected' &&
      priorSubmission.reviewPassed !== true;

    const submission = await this.prisma.submission.create({
      data: {
        projectId,
        playableUrl: project.playableUrl,
        screenshotUrl: project.screenshotUrl,
        description: project.description,
        repoUrl: project.repoUrl,
        hackatimeHours: recalculatedHours,
      },
    });

    const projectUpdateData: any = { nowHackatimeHours: recalculatedHours };
    // Only reset fraud state when the prior submission was approved or when
    // this is a brand new project. Reviewer-rejected resubmissions reuse the
    // prior fraud outcome — the FigJam rule.
    if (isResubmission && !reuseFraud) {
      Object.assign(projectUpdateData, {
        joeProjectId: null,
        joeFraudPassed: null,
        joeFraudReviewedAt: null,
        joeTrustScore: null,
        joeJustification: null,
        joeOutcomeStatus: null,
        joeOutcomeReason: null,
        joeOutcomeRecordedAt: null,
      });
    }

    await this.prisma.project.update({
      where: { projectId },
      data: projectUpdateData,
    });

    this.posthog.capture({
      distinctId: String(userId),
      event: isResubmission
        ? 'project_resubmitted_backend'
        : 'project_submitted_backend',
      properties: {
        projectId,
        projectType: project.projectType,
        submissionId: submission.submissionId,
        isResubmission,
        reuseFraud,
      },
    });

    if (!isResubmission) {
      this.airtableService
        .syncUserEvent(project.user.email, userId, 'firstSubmit')
        .catch((err) =>
          console.error('Error syncing firstSubmit event to Airtable:', err),
        );
    }

    // Submit to fraud review only when we're starting fresh. Reviewer-rejected
    // resubmissions deliberately reuse the prior fraud outcome.
    if (!reuseFraud) {
      this.fraudReviewService.submitAndPersist(projectId).catch(() => {});
    }

    return submission;
  }

  async getProjectSubmissions(projectId: number, userId: number) {
    const project = await this.prisma.project.findUnique({
      where: { projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const submissions = await this.prisma.submission.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    return submissions.map((s) => this.scopeSubmissionForUser(s));
  }

  async updateProject(
    projectId: number,
    updateProjectDto: UpdateProjectDto,
    userId: number,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const updateData: any = {};
    if (updateProjectDto.projectTitle !== undefined) {
      updateData.projectTitle = updateProjectDto.projectTitle;
    }
    if (updateProjectDto.projectType !== undefined) {
      updateData.projectType = updateProjectDto.projectType;
    }
    if (updateProjectDto.description !== undefined) {
      updateData.description = updateProjectDto.description;
    }
    if (updateProjectDto.playableUrl !== undefined) {
      updateData.playableUrl = updateProjectDto.playableUrl;
    }
    if (updateProjectDto.repoUrl !== undefined) {
      updateData.repoUrl = updateProjectDto.repoUrl;
    }
    if (updateProjectDto.readmeUrl !== undefined) {
      updateData.readmeUrl = updateProjectDto.readmeUrl;
    }
    if (updateProjectDto.screenshotUrl !== undefined) {
      updateData.screenshotUrl = updateProjectDto.screenshotUrl;
    }
    if (updateProjectDto.journalUrl !== undefined) {
      updateData.journalUrl = updateProjectDto.journalUrl;
    }

    if (Object.keys(updateData).length === 0) {
      return {
        message: 'No changes provided.',
        project: this.excludeAdminFields(project),
      };
    }

    const updatedProject = await this.prisma.project.update({
      where: { projectId },
      data: updateData,
    });

    return {
      message: 'Project updated successfully.',
      project: this.excludeAdminFields(updatedProject),
    };
  }

  async updateHackatimeProjects(
    projectId: number,
    updateHackatimeProjectsDto: UpdateHackatimeProjectsDto,
    userId: number,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { projectId },
      include: {
        submissions: true,
        user: true,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (!project.user.hackatimeAccount) {
      throw new BadRequestException('No Hackatime account linked to this user');
    }

    const hackatimeBaseUrl =
      process.env.HACKATIME_ADMIN_API_URL ||
      'https://hackatime.hackclub.com/api/admin/v1';
    const hackatimeApiKey = process.env.HACKATIME_API_KEY;
    const { availableProjectNames, projectsMap } =
      await this.fetchHackatimeProjectsData(
        project.user.hackatimeAccount,
        hackatimeBaseUrl,
        hackatimeApiKey,
      );

    for (const projectName of updateHackatimeProjectsDto.projectNames) {
      if (!availableProjectNames.has(projectName)) {
        throw new BadRequestException(
          `Project "${projectName}" is not a valid hackatime project`,
        );
      }
    }

    const totalHours = await this.calculateHackatimeHours(
      updateHackatimeProjectsDto.projectNames,
      projectsMap,
      project.user.hackatimeAccount,
      hackatimeBaseUrl,
      hackatimeApiKey,
      project.user.hackatimeStartDate,
    );

    const allLinkedProjects = await this.prisma.project.findMany({
      where: {
        userId: userId,
        NOT: {
          projectId: { equals: projectId },
        },
      },
      select: {
        nowHackatimeProjects: true,
      },
    });

    const linkedByOthers = new Set<string>();
    allLinkedProjects.forEach((p) => {
      if (p.nowHackatimeProjects) {
        p.nowHackatimeProjects.forEach((name) => linkedByOthers.add(name));
      }
    });

    const currentlyLinked = project.nowHackatimeProjects || [];
    const updatingToAlreadyLinked =
      updateHackatimeProjectsDto.projectNames.filter(
        (name) => linkedByOthers.has(name) && !currentlyLinked.includes(name),
      );

    if (updatingToAlreadyLinked.length > 0) {
      throw new BadRequestException(
        `Project(s) ${updatingToAlreadyLinked.join(', ')} are already linked to another project`,
      );
    }

    // Hackatime projects can always be updated directly, even when locked
    // These are system-managed fields and don't require admin approval
    const updatedProject = await this.prisma.project.update({
      where: { projectId },
      data: {
        nowHackatimeProjects: updateHackatimeProjectsDto.projectNames,
        nowHackatimeHours: totalHours,
      },
    });

    return {
      message: 'Hackatime projects updated successfully.',
      project: this.excludeAdminFields(updatedProject),
    };
  }

  async getHackatimeProjects(projectId: number, userId: number) {
    const project = await this.prisma.project.findUnique({
      where: { projectId },
      select: {
        projectId: true,
        nowHackatimeProjects: true,
        userId: true,
        user: {
          select: { hackatimeAccount: true, hackatimeStartDate: true },
        },
        submissions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { hackatimeHours: true },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const lastSubmission = project.submissions[0];
    const lastSubmittedHours = lastSubmission?.hackatimeHours ?? null;
    const projectNames = project.nowHackatimeProjects ?? [];

    // Always calculate live hours from the Hackatime API
    if (!project.user.hackatimeAccount || projectNames.length === 0) {
      return {
        projectId: project.projectId,
        hackatimeProjects: projectNames,
        currentHackatimeHours: 0,
        hackatimeProjectHours: {},
        lastSubmittedHours,
      };
    }

    const hackatimeBaseUrl =
      process.env.HACKATIME_ADMIN_API_URL ||
      'https://hackatime.hackclub.com/api/admin/v1';
    const hackatimeApiKey = process.env.HACKATIME_API_KEY;

    const durationsMap = await this.fetchHackatimeProjectDurationsAfterDate(
      project.user.hackatimeAccount,
      projectNames,
      hackatimeBaseUrl,
      hackatimeApiKey,
      project.user.hackatimeStartDate ?? undefined,
    );

    const hackatimeProjectHours: Record<string, number> = {};
    let totalSeconds = 0;
    for (const name of projectNames) {
      const seconds = durationsMap.get(name) ?? 0;
      hackatimeProjectHours[name] = Math.round((seconds / 3600) * 10) / 10;
      totalSeconds += seconds;
    }

    return {
      projectId: project.projectId,
      hackatimeProjects: projectNames,
      currentHackatimeHours: Math.round((totalSeconds / 3600) * 10) / 10,
      hackatimeProjectHours,
      lastSubmittedHours,
    };
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
    const availableProjectNames = new Set<string>();
    const projectsMap = new Map<string, number>();

    const addProject = (entry: any) => {
      if (typeof entry === 'string') {
        availableProjectNames.add(entry);
        if (!projectsMap.has(entry)) {
          projectsMap.set(entry, 0);
        }
        return;
      }

      const name = entry?.name || entry?.projectName;

      if (typeof name === 'string') {
        availableProjectNames.add(name);
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

    return { availableProjectNames, projectsMap };
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

  private calculateAge(birthday: Date) {
    const today = new Date();
    let age = today.getFullYear() - birthday.getFullYear();
    const monthDiff = today.getMonth() - birthday.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthday.getDate())
    ) {
      age -= 1;
    }
    return age;
  }

  async getApprovedProjects() {
    const projects = await this.prisma.project.findMany({
      where: {
        approvedHours: {
          gt: 0,
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return projects.map((project) => ({
      projectId: project.projectId,
      projectTitle: project.projectTitle,
      description: project.description || '',
      screenshotUrl: project.screenshotUrl || null,
      playableUrl: project.playableUrl || null,
      repoUrl: project.repoUrl || null,
      approvedHours: project.approvedHours || null,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    }));
  }

  async getLeaderboard(sortBy: 'hours' | 'approved' = 'hours') {
    const users = await this.prisma.user.findMany({
      include: {
        projects: {
          select: {
            nowHackatimeHours: true,
            approvedHours: true,
          },
        },
      },
    });

    const leaderboard = users
      .map((user) => {
        const totalHours = user.projects.reduce(
          (sum, project) => sum + (project.nowHackatimeHours || 0),
          0,
        );
        const approvedHours = user.projects.reduce(
          (sum, project) => sum + (project.approvedHours || 0),
          0,
        );

        return {
          firstName: user.firstName,
          hours: Math.round(totalHours * 10) / 10,
          approved: Math.round(approvedHours * 10) / 10,
        };
      })
      .filter((entry) =>
        sortBy === 'hours' ? entry.hours > 0 : entry.approved > 0,
      )
      .sort((a, b) =>
        sortBy === 'hours' ? b.hours - a.hours : b.approved - a.approved,
      )
      .slice(0, 10);

    return leaderboard;
  }

  async deleteProject(projectId: number, userId: number) {
    const project = await this.prisma.project.findUnique({
      where: { projectId },
      include: {
        submissions: true,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (project.submissions.length > 0) {
      throw new ForbiddenException('Cannot delete project with submissions');
    }

    await this.prisma.project.delete({
      where: { projectId },
    });

    return { deleted: true, projectId };
  }
}
