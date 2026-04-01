import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ReviewSubmissionDto, QuickApproveDto, SaveNoteDto, SaveChecklistDto } from './dto/review-submission.dto';
import { AirtableService } from '../airtable/airtable.service';
import { MailService } from '../mail/mail.service';
import { SlackService } from '../slack/slack.service';

// Scoped user fields — no PII like email, address, birthday
const SCOPED_USER_SELECT = {
  userId: true,
  firstName: true,
  lastName: true,
  slackUserId: true,
  birthday: true, // used to compute age only, never sent raw
} as const;

@Injectable()
export class ReviewerService {
  constructor(
    private prisma: PrismaService,
    private airtableService: AirtableService,
    private mailService: MailService,
    private slackService: SlackService,
  ) {}

  /**
   * Get the review queue: all pending submissions with scoped project/user data.
   * Returns minimal info for the queue list, not full details.
   */
  async getReviewQueue() {
    const submissions = await this.prisma.submission.findMany({
      where: { approvalStatus: 'pending' },
      include: {
        project: {
          select: {
            projectId: true,
            projectTitle: true,
            projectType: true,
            repoUrl: true,
            playableUrl: true,
            nowHackatimeHours: true,
            nowHackatimeProjects: true,
            user: { select: SCOPED_USER_SELECT },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return submissions.map((submission) => ({
      submissionId: submission.submissionId,
      projectId: submission.projectId,
      hackatimeHours: submission.hackatimeHours,
      createdAt: submission.createdAt,
      project: {
        ...submission.project,
        user: this.scopeUserData(submission.project.user),
      },
    }));
  }

  /**
   * Get full details for a single submission, scoped for reviewer access.
   * Includes project info, user info (no PII), hours breakdown, and review history.
   */
  async getSubmissionDetail(submissionId: number) {
    const submission = await this.prisma.submission.findUnique({
      where: { submissionId },
      include: {
        project: {
          include: {
            user: { select: SCOPED_USER_SELECT },
            submissions: {
              orderBy: { createdAt: 'desc' },
              include: {
                auditLogs: {
                  orderBy: { createdAt: 'desc' },
                },
              },
            },
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException(`Submission ${submissionId} not found`);
    }

    // Resolve reviewer names from audit logs
    const allAuditLogs = submission.project.submissions.flatMap((s) => s.auditLogs);
    const reviewerIds = [...new Set(allAuditLogs.map((l) => l.adminId))];
    const reviewers = await this.prisma.user.findMany({
      where: { userId: { in: reviewerIds } },
      select: { userId: true, firstName: true, lastName: true },
    });
    const reviewerMap = new Map(reviewers.map((r) => [r.userId, r]));

    // Build timeline from all submissions on this project
    const timeline = this.buildTimeline(submission.project.submissions, reviewerMap);

    return {
      submissionId: submission.submissionId,
      projectId: submission.projectId,
      approvalStatus: submission.approvalStatus,
      hackatimeHours: submission.hackatimeHours,
      description: submission.description,
      playableUrl: submission.playableUrl,
      repoUrl: submission.repoUrl,
      screenshotUrl: submission.screenshotUrl,
      createdAt: submission.createdAt,
      project: {
        projectId: submission.project.projectId,
        projectTitle: submission.project.projectTitle,
        projectType: submission.project.projectType,
        description: submission.project.description,
        playableUrl: submission.project.playableUrl,
        repoUrl: submission.project.repoUrl,
        readmeUrl: submission.project.readmeUrl,
        nowHackatimeHours: submission.project.nowHackatimeHours,
        nowHackatimeProjects: submission.project.nowHackatimeProjects,
        user: this.scopeUserData(submission.project.user),
      },
      timeline,
    };
  }

  /**
   * Update a submission: change status, hours, feedback, etc.
   * Supports re-review (changing a previously reviewed submission).
   * Conditional email (only when sendEmail is explicitly true), always sends Slack on status change.
   */
  async reviewSubmission(submissionId: number, dto: ReviewSubmissionDto, reviewerId: number) {
    const submission = await this.prisma.submission.findUnique({
      where: { submissionId },
      include: {
        project: {
          include: { user: true },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException(`Submission ${submissionId} not found`);
    }

    const updateData: Record<string, unknown> = {};
    if (dto.approvedHours !== undefined) {
      updateData.approvedHours = dto.approvedHours;
    }
    if (dto.userFeedback !== undefined) {
      updateData.hoursJustification = dto.userFeedback;
    }
    if (dto.approvalStatus !== undefined) {
      updateData.approvalStatus = dto.approvalStatus;
      updateData.reviewedBy = reviewerId.toString();
      updateData.reviewedAt = new Date();
    }

    const updatedSubmission = await this.prisma.submission.update({
      where: { submissionId },
      data: updateData,
      include: {
        project: {
          include: {
            user: {
              select: { userId: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });

    // Audit log — distinguish status-change reviews from field-only updates
    const isReview = dto.approvalStatus !== undefined;
    const auditChanges: Record<string, unknown> = {};
    if (dto.approvalStatus !== undefined) auditChanges.previousStatus = submission.approvalStatus;
    if (dto.approvedHours !== undefined) auditChanges.approvedHours = dto.approvedHours;
    if (dto.userFeedback !== undefined) auditChanges.userFeedback = dto.userFeedback;
    if (dto.hoursJustification !== undefined) auditChanges.hoursJustification = dto.hoursJustification;
    if (dto.adminComment !== undefined) auditChanges.adminComment = dto.adminComment;

    await this.prisma.submissionAuditLog.create({
      data: {
        submissionId,
        adminId: reviewerId,
        action: isReview ? 'review' : 'update',
        newStatus: dto.approvalStatus || null,
        approvedHours: dto.approvedHours ?? null,
        changes: auditChanges as any,
      },
    });

    const isNewApproval = dto.approvalStatus === 'approved' && submission.approvalStatus !== 'approved';
    if (isNewApproval) {
      await this.syncAirtable(submission, dto);
    } else if (submission.approvalStatus === 'approved' && submission.airtableRecId) {
      await this.updateAirtableRecord(submission, dto);
    }

    await this.syncProjectData(submission, dto);

    // Notifications only fire on status changes
    if (dto.approvalStatus !== undefined) {
      await this.sendNotifications(updatedSubmission, dto);
    }

    return { success: true, submissionId, status: dto.approvalStatus ?? submission.approvalStatus };
  }

  /**
   * Quick-approve: auto-fills hours from hackatime, always approves.
   * Sends Slack notification, no email.
   */
  async quickApproveSubmission(
    submissionId: number,
    reviewerId: number,
    dto: QuickApproveDto,
  ) {
    const submission = await this.prisma.submission.findUnique({
      where: { submissionId },
      include: {
        project: {
          include: { user: true },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException(`Submission ${submissionId} not found`);
    }

    const hackatimeHours = submission.project.nowHackatimeHours || 0;
    const approvedHours = dto.approvedHours ?? hackatimeHours;
    const autoJustification = `Quick approved with ${approvedHours.toFixed(1)} hours.`;
    const hoursJustification = dto.hoursJustification || autoJustification;

    const updatedSubmission = await this.prisma.submission.update({
      where: { submissionId },
      data: {
        approvalStatus: 'approved',
        approvedHours,
        hoursJustification: dto.userFeedback || '',
        reviewedBy: reviewerId.toString(),
        reviewedAt: new Date(),
      },
      include: {
        project: {
          include: {
            user: {
              select: { userId: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });

    await this.prisma.submissionAuditLog.create({
      data: {
        submissionId,
        adminId: reviewerId,
        action: 'review',
        newStatus: 'approved',
        approvedHours,
        changes: {
          previousStatus: submission.approvalStatus,
          quickApprove: true,
          approvedHours,
          hoursJustification,
          userFeedback: dto.userFeedback || null,
        },
      },
    });

    await this.syncAirtable(submission, { approvedHours, hoursJustification });

    await this.prisma.project.update({
      where: { projectId: submission.projectId },
      data: {
        approvedHours,
        hoursJustification,
        playableUrl: submission.playableUrl,
        repoUrl: submission.repoUrl,
        screenshotUrl: submission.screenshotUrl,
        description: submission.description,
      },
    });

    // Slack notification only (no email for quick approve)
    try {
      await this.slackService.notifySubmissionReview(
        updatedSubmission.project.user.email,
        {
          projectTitle: updatedSubmission.project.projectTitle,
          projectId: updatedSubmission.project.projectId,
          approved: true,
          approvedHours,
          feedback: dto.userFeedback,
        },
      );
    } catch (error) {
      console.error('Slack notification failed during quick approve:', error);
    }

    return { success: true, submissionId, status: 'approved' };
  }

  /** Sync approved hours, justification, adminComment, and submission data to the project table. */
  private async syncProjectData(
    submission: { projectId: number; playableUrl: string | null; repoUrl: string | null; screenshotUrl: string | null; description: string | null },
    dto: ReviewSubmissionDto,
  ) {
    const projectUpdateData: Record<string, unknown> = {};
    if (dto.approvedHours !== undefined) projectUpdateData.approvedHours = dto.approvedHours;
    if (dto.hoursJustification !== undefined) projectUpdateData.hoursJustification = dto.hoursJustification;
    if (dto.adminComment !== undefined) projectUpdateData.adminComment = dto.adminComment;
    if (dto.approvalStatus === 'approved') {
      projectUpdateData.playableUrl = submission.playableUrl;
      projectUpdateData.repoUrl = submission.repoUrl;
      projectUpdateData.screenshotUrl = submission.screenshotUrl;
      projectUpdateData.description = submission.description;
    }

    if (Object.keys(projectUpdateData).length > 0) {
      await this.prisma.project.update({
        where: { projectId: submission.projectId },
        data: projectUpdateData,
      });
    }
  }

  /** Create a new Airtable record when a submission is approved. For resubmissions, hours are the delta since last approval. */
  private async syncAirtable(
    submission: { submissionId: number; projectId: number; createdAt: Date; playableUrl: string | null; repoUrl: string | null; screenshotUrl: string | null; description: string | null; project: { playableUrl: string | null; repoUrl: string | null; screenshotUrl: string | null; description: string | null; user: any } },
    dto: { approvedHours?: number; hoursJustification?: string },
  ) {
    try {
      const project = await this.prisma.project.findUnique({
        where: { projectId: submission.projectId },
        include: { user: true },
      });
      if (!project) return;

      const totalApprovedHours = dto.approvedHours || 0;

      // Find the most recent prior approved submission — its approvedHours is the cumulative total up to that point
      const lastApprovedSubmission = await this.prisma.submission.findFirst({
        where: {
          projectId: submission.projectId,
          approvalStatus: 'approved',
          createdAt: { lt: submission.createdAt },
        },
        orderBy: { createdAt: 'desc' },
        select: { approvedHours: true },
      });
      const previouslyApprovedHours = lastApprovedSubmission?.approvedHours || 0;
      const deltaHours = Math.max(0, totalApprovedHours - previouslyApprovedHours);

      const approvedProjectData = {
        user: {
          firstName: project.user.firstName,
          lastName: project.user.lastName,
          email: project.user.email,
          birthday: project.user.birthday,
          addressLine1: project.user.addressLine1,
          addressLine2: project.user.addressLine2,
          city: project.user.city,
          state: project.user.state,
          country: project.user.country,
          zipCode: project.user.zipCode,
        },
        project: {
          playableUrl: submission.playableUrl || submission.project.playableUrl || '',
          repoUrl: submission.repoUrl || submission.project.repoUrl || '',
          screenshotUrl: submission.screenshotUrl || submission.project.screenshotUrl || '',
          approvedHours: deltaHours,
          hoursJustification: project.hoursJustification || dto.hoursJustification || '',
          description: submission.description || submission.project.description || undefined,
        },
      };

      const airtableResult = await this.airtableService.createApprovedProject(approvedProjectData);
      if (airtableResult.recordId) {
        await this.prisma.submission.update({
          where: { submissionId: submission.submissionId },
          data: { airtableRecId: airtableResult.recordId },
        });
      }
    } catch (error) {
      // Airtable sync failure shouldn't block the review
      console.error('Airtable sync failed:', error);
    }
  }

  /** Update an existing Airtable record when editing an already-approved submission. */
  private async updateAirtableRecord(
    submission: { submissionId: number; projectId: number; createdAt: Date; airtableRecId: string | null; playableUrl: string | null; repoUrl: string | null; screenshotUrl: string | null; description: string | null },
    dto: { approvedHours?: number; hoursJustification?: string },
  ) {
    if (!submission.airtableRecId) return;
    try {
      let approvedHours = dto.approvedHours;

      if (approvedHours !== undefined) {
        // Find the most recent prior approved submission — its approvedHours is the cumulative total up to that point
        const lastApprovedSubmission = await this.prisma.submission.findFirst({
          where: {
            projectId: submission.projectId,
            approvalStatus: 'approved',
            createdAt: { lt: submission.createdAt },
          },
          orderBy: { createdAt: 'desc' },
          select: { approvedHours: true },
        });
        const previouslyApprovedHours = lastApprovedSubmission?.approvedHours || 0;
        approvedHours = Math.max(0, approvedHours - previouslyApprovedHours);
      }

      await this.airtableService.updateApprovedProject(submission.airtableRecId, {
        playableUrl: submission.playableUrl || undefined,
        repoUrl: submission.repoUrl || undefined,
        screenshotUrl: submission.screenshotUrl || undefined,
        description: submission.description || undefined,
        approvedHours,
        hoursJustification: dto.hoursJustification,
      });
    } catch (error) {
      console.error('Airtable update failed:', error);
    }
  }

  /** Send email (if explicitly requested) and Slack notification on status change. */
  private async sendNotifications(
    updatedSubmission: { project: { projectTitle: string; projectId: number; user: { email: string } }; hoursJustification: string | null },
    dto: ReviewSubmissionDto,
  ) {
    if (dto.sendEmail === true) {
      try {
        await this.mailService.sendSubmissionReviewEmail(
          updatedSubmission.project.user.email,
          {
            projectTitle: updatedSubmission.project.projectTitle,
            projectId: updatedSubmission.project.projectId,
            approved: dto.approvalStatus === 'approved',
            approvedHours: dto.approvedHours,
            feedback: updatedSubmission.hoursJustification,
          },
        );
      } catch (error) {
        console.error('Email notification failed:', error);
      }
    }

    try {
      await this.slackService.notifySubmissionReview(
        updatedSubmission.project.user.email,
        {
          projectTitle: updatedSubmission.project.projectTitle,
          projectId: updatedSubmission.project.projectId,
          approved: dto.approvalStatus === 'approved',
          approvedHours: dto.approvedHours,
          feedback: updatedSubmission.hoursJustification,
        },
      );
    } catch (error) {
      console.error('Slack notification failed:', error);
    }
  }

  /** Save the adminComment field on a project or user. */
  async saveNote(targetType: 'project' | 'user', targetId: number, dto: SaveNoteDto) {
    if (targetType === 'project') {
      await this.prisma.project.update({
        where: { projectId: targetId },
        data: { adminComment: dto.content },
      });
    } else {
      await this.prisma.user.update({
        where: { userId: targetId },
        data: { adminComment: dto.content },
      });
    }
    return { content: dto.content };
  }

  /** Read the adminComment field from a project or user. */
  async getNote(targetType: 'project' | 'user', targetId: number) {
    if (targetType === 'project') {
      const project = await this.prisma.project.findUnique({
        where: { projectId: targetId },
        select: { adminComment: true },
      });
      return { content: project?.adminComment ?? '' };
    }
    const user = await this.prisma.user.findUnique({
      where: { userId: targetId },
      select: { adminComment: true },
    });
    return { content: user?.adminComment ?? '' };
  }

  async saveChecklist(submissionId: number, dto: SaveChecklistDto) {
    return this.prisma.reviewerChecklist.upsert({
      where: { submissionId },
      update: { checkedItems: dto.checkedItems },
      create: {
        submissionId,
        checkedItems: dto.checkedItems,
      },
    });
  }

  async getChecklist(submissionId: number) {
    const checklist = await this.prisma.reviewerChecklist.findUnique({
      where: { submissionId },
    });
    return { checkedItems: (checklist?.checkedItems as number[]) ?? [] };
  }

  /**
   * Strip PII from user data — only expose what reviewers need.
   * Age is computed from birthday, birthday itself is not returned.
   */
  private scopeUserData(user: {
    userId: number;
    firstName: string;
    lastName: string;
    slackUserId: string | null;
    birthday: Date | null;
  }) {
    let age: number | null = null;
    if (user.birthday) {
      const today = new Date();
      const birth = new Date(user.birthday);
      age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
    }

    return {
      userId: user.userId,
      firstName: user.firstName,
      lastName: user.lastName,
      slackUserId: user.slackUserId,
      age,
    };
  }

  /**
   * Build a reverse-chronological timeline from all submissions and their audit logs.
   */
  private buildTimeline(
    submissions: Array<{
      submissionId: number;
      hackatimeHours: number | null;
      approvalStatus: string;
      createdAt: Date;
      auditLogs: Array<{
        id: number;
        adminId: number;
        action: string;
        newStatus: string | null;
        approvedHours: number | null;
        changes: unknown;
        createdAt: Date;
      }>;
    }>,
    reviewerMap: Map<number, { userId: number; firstName: string; lastName: string }>,
  ) {
    type TimelineEntry =
      | { type: 'submitted' | 'resubmitted'; hours: number | null; timestamp: Date }
      | {
          type: 'approved' | 'rejected';
          reviewerName: string;
          userFeedback: string | null;
          hoursJustification: string | null;
          approvedHours: number | null;
          submittedHours: number | null;
          timestamp: Date;
        };

    const events: TimelineEntry[] = [];

    // Sort submissions oldest first to determine first vs re-submission
    const sorted = [...submissions].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    for (let i = 0; i < sorted.length; i++) {
      const sub = sorted[i];
      const isFirst = i === 0;

      events.push({
        type: isFirst ? 'submitted' : 'resubmitted',
        hours: sub.hackatimeHours,
        timestamp: sub.createdAt,
      });

      // Add review events from audit logs
      for (const log of sub.auditLogs) {
        if (log.action === 'review' && log.newStatus) {
          const reviewer = reviewerMap.get(log.adminId);
          const reviewerName = reviewer
            ? `${reviewer.firstName} ${reviewer.lastName}`
            : 'Unknown';
          const changes = log.changes as Record<string, unknown> | null;

          events.push({
            type: log.newStatus === 'approved' ? 'approved' : 'rejected',
            reviewerName,
            userFeedback: (changes?.userFeedback as string) ?? null,
            hoursJustification: (changes?.hoursJustification as string) ?? null,
            approvedHours: log.approvedHours,
            submittedHours: sub.hackatimeHours,
            timestamp: log.createdAt,
          });
        }
      }
    }

    // Newest first
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return events;
  }
}
