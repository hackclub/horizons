import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ReviewSubmissionDto, SaveNoteDto, SaveChecklistDto } from './dto/review-submission.dto';
import { AirtableService } from '../airtable/airtable.service';
import { MailService } from '../mail/mail.service';

// Scoped user fields — no PII like email, address, birthday
const SCOPED_USER_SELECT = {
  userId: true,
  firstName: true,
  lastName: true,
  slackUserId: true,
  birthday: true, // used to compute age only, never sent raw
  isFraud: true,
  isSus: true,
} as const;

@Injectable()
export class ReviewerService {
  constructor(
    private prisma: PrismaService,
    private airtableService: AirtableService,
    private mailService: MailService,
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
   * Approve or reject a submission with feedback.
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

    if (submission.approvalStatus !== 'pending') {
      throw new BadRequestException('Submission has already been reviewed');
    }

    const updateData: Record<string, unknown> = {
      approvalStatus: dto.approvalStatus,
      reviewedBy: reviewerId.toString(),
      reviewedAt: new Date(),
    };

    if (dto.approvedHours !== undefined) {
      updateData.approvedHours = dto.approvedHours;
    }

    // userFeedback is stored in hoursJustification on the submission
    if (dto.userFeedback !== undefined) {
      updateData.hoursJustification = dto.userFeedback;
    }

    const updatedSubmission = await this.prisma.submission.update({
      where: { submissionId },
      data: updateData,
    });

    // Create audit log
    const auditChanges: Record<string, unknown> = {
      previousStatus: submission.approvalStatus,
    };
    if (dto.approvedHours !== undefined) auditChanges.approvedHours = dto.approvedHours;
    if (dto.userFeedback !== undefined) auditChanges.userFeedback = dto.userFeedback;
    if (dto.hoursJustification !== undefined) auditChanges.hoursJustification = dto.hoursJustification;

    await this.prisma.submissionAuditLog.create({
      data: {
        submissionId,
        adminId: reviewerId,
        action: 'review',
        newStatus: dto.approvalStatus,
        approvedHours: dto.approvedHours ?? null,
        changes: auditChanges as any,
      },
    });

    // Sync approved hours and justification to project
    const projectUpdateData: Record<string, unknown> = {};
    if (dto.approvedHours !== undefined) {
      projectUpdateData.approvedHours = dto.approvedHours;
    }
    if (dto.hoursJustification !== undefined) {
      projectUpdateData.hoursJustification = dto.hoursJustification;
    }
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

    // Airtable sync on approval
    if (dto.approvalStatus === 'approved') {
      try {
        const project = await this.prisma.project.findUnique({
          where: { projectId: submission.projectId },
          include: { user: true },
        });

        if (project) {
          const isResubmission = !!project.airtableRecId;
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
              airtableRecId: project.user.airtableRecId,
            },
            project: {
              projectTitle: project.projectTitle,
              projectType: project.projectType,
              description: project.description,
              playableUrl: project.playableUrl,
              repoUrl: project.repoUrl,
              screenshotUrl: project.screenshotUrl,
              approvedHours: project.approvedHours,
              hoursJustification: project.hoursJustification,
              airtableRecId: project.airtableRecId,
            },
          };

          if (isResubmission) {
            await this.airtableService.updateApprovedProject(project.airtableRecId, approvedProjectData.project);
          } else {
            const { recordId: airtableRecId } = await this.airtableService.createApprovedProject(approvedProjectData);
            if (airtableRecId) {
              await this.prisma.project.update({
                where: { projectId: project.projectId },
                data: { airtableRecId },
              });
            }
          }
        }
      } catch (error) {
        // Airtable sync failure shouldn't block the review
        console.error('Airtable sync failed during reviewer approval:', error);
      }
    }

    // Send email notification to the user
    try {
      await this.mailService.sendSubmissionReviewEmail(
        submission.project.user.email,
        {
          projectTitle: submission.project.projectTitle,
          projectId: submission.projectId,
          approved: dto.approvalStatus === 'approved',
          approvedHours: dto.approvedHours,
          feedback: dto.userFeedback || undefined,
        },
      );
    } catch (error) {
      console.error('Email notification failed during reviewer approval:', error);
    }

    return { success: true, submissionId, status: dto.approvalStatus };
  }

  async saveNote(targetType: 'project' | 'user', targetId: number, reviewerId: number, dto: SaveNoteDto) {
    return this.prisma.reviewerNote.upsert({
      where: {
        targetType_targetId_reviewerId: {
          targetType,
          targetId,
          reviewerId,
        },
      },
      update: { content: dto.content },
      create: {
        targetType,
        targetId,
        reviewerId,
        content: dto.content,
      },
    });
  }

  async getNote(targetType: 'project' | 'user', targetId: number, reviewerId: number) {
    const note = await this.prisma.reviewerNote.findUnique({
      where: {
        targetType_targetId_reviewerId: {
          targetType,
          targetId,
          reviewerId,
        },
      },
    });
    return { content: note?.content ?? '' };
  }

  async saveChecklist(submissionId: number, reviewerId: number, dto: SaveChecklistDto) {
    return this.prisma.reviewerChecklist.upsert({
      where: {
        submissionId_reviewerId: {
          submissionId,
          reviewerId,
        },
      },
      update: { checkedItems: dto.checkedItems },
      create: {
        submissionId,
        reviewerId,
        checkedItems: dto.checkedItems,
      },
    });
  }

  async getChecklist(submissionId: number, reviewerId: number) {
    const checklist = await this.prisma.reviewerChecklist.findUnique({
      where: {
        submissionId_reviewerId: {
          submissionId,
          reviewerId,
        },
      },
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
    isFraud: boolean;
    isSus: boolean;
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
      isFraud: user.isFraud,
      isSus: user.isSus,
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
