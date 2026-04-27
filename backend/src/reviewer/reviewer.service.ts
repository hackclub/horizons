import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  ReviewSubmissionDto,
  QuickApproveDto,
  SaveNoteDto,
  SaveChecklistDto,
} from './dto/review-submission.dto';
import { FraudReviewService } from '../fraud-review/fraud-review.service';
import { ManifestService } from '../manifest/manifest.service';
import { SubmissionApprovalService } from '../submission-approval/submission-approval.service';
import { AUDIT_ACTIONS } from '../submission-approval/audit-actions';

// Scoped user fields — no PII like email, address, birthday
const SCOPED_USER_SELECT = {
  userId: true,
  firstName: true,
  lastName: true,
  slackUserId: true,
  birthday: true, // used to compute age only, never sent raw
  hackatimeStartDate: true,
} as const;

@Injectable()
export class ReviewerService {
  constructor(
    private prisma: PrismaService,
    private fraudReviewService: FraudReviewService,
    private submissionApprovalService: SubmissionApprovalService,
    private manifestService: ManifestService,
  ) {}

  /**
   * Reviewer-facing Manifest lookup: shows whether this project's codeUrl has
   * been submitted to other YSWS programs (for cross-program fraud signal).
   * Returns null when the project has no codeUrl, manifest is disabled, or
   * the project isn't registered.
   */
  async getProjectManifestLookup(projectId: number) {
    const project = await this.prisma.project.findUnique({
      where: { projectId },
      select: { repoUrl: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (!project.repoUrl || !this.manifestService.isEnabled()) {
      return { codeUrl: project.repoUrl, manifest: null };
    }

    const manifest = await this.manifestService.lookup(project.repoUrl);
    return { codeUrl: project.repoUrl, manifest };
  }

  /**
   * Get the review queue: all pending submissions with scoped project/user data.
   * Returns minimal info for the queue list, not full details.
   */
  async getReviewQueue() {
    // Fraud and review run independently now, but still refresh fraud state on
    // queue open so any late fraud results can finalize pending submissions
    // before the reviewer sees them.
    if (this.fraudReviewService.isEnabled()) {
      await this.fraudReviewService.pollPendingProjects();
    }

    const submissions = await this.prisma.submission.findMany({
      where: {
        approvalStatus: 'pending',
        reviewPassed: null,
      },
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
            joeFraudPassed: true,
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
    const allAuditLogs = submission.project.submissions.flatMap(
      (s) => s.auditLogs,
    );
    const reviewerIds = [...new Set(allAuditLogs.map((l) => l.adminId))];
    const reviewers = await this.prisma.user.findMany({
      where: { userId: { in: reviewerIds } },
      select: { userId: true, firstName: true, lastName: true },
    });
    const reviewerMap = new Map(reviewers.map((r) => [r.userId, r]));

    // Build timeline from all submissions on this project
    const timeline = this.buildTimeline(
      submission.project.submissions,
      reviewerMap,
    );

    // Compact list of sibling submissions so reviewers can jump between
    // resubmissions of the same project without leaving the detail view.
    const submissionsList = submission.project.submissions
      .map((s) => ({
        submissionId: s.submissionId,
        createdAt: s.createdAt,
        approvalStatus: s.approvalStatus,
        reviewPassed: s.reviewPassed,
        reviewedAt: s.reviewedAt,
        hackatimeHours: s.hackatimeHours,
      }))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

    return {
      submissionId: submission.submissionId,
      projectId: submission.projectId,
      approvalStatus: submission.approvalStatus,
      reviewPassed: submission.reviewPassed,
      finalizedAt: submission.finalizedAt,
      reviewedAt: submission.reviewedAt,
      approvedHours: submission.approvedHours,
      hackatimeHours: submission.hackatimeHours,
      // submission.hoursJustification stores the reviewer's user-facing feedback
      // (the DTO field `userFeedback` is persisted here — name is historical).
      userFeedback: submission.hoursJustification,
      // Raw reviewer analysis used to build the Airtable "ship justification".
      reviewerAnalysis: submission.reviewerAnalysis,
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
        adminComment: submission.project.adminComment,
        nowHackatimeHours: submission.project.nowHackatimeHours,
        nowHackatimeProjects: submission.project.nowHackatimeProjects,
        joeFraudPassed: submission.project.joeFraudPassed,
        joeTrustScore: submission.project.joeTrustScore,
        user: this.scopeUserData(submission.project.user),
      },
      timeline,
      submissions: submissionsList,
    };
  }

  /**
   * Update a submission: change status, hours, feedback, etc.
   *
   * Reviewer decisions (dto.approvalStatus set) are recorded as one gate in the
   * two-gate approval flow — the state machine in SubmissionApprovalService
   * reconciles with the fraud gate and fires side effects on transition.
   * Field-only updates (no status) persist directly on the submission.
   */
  async reviewSubmission(
    submissionId: number,
    dto: ReviewSubmissionDto,
    reviewerId: number,
  ) {
    const submission = await this.prisma.submission.findUnique({
      where: { submissionId },
      select: { submissionId: true, approvalStatus: true },
    });

    if (!submission) {
      throw new NotFoundException(`Submission ${submissionId} not found`);
    }

    // Persist field-level edits (hours / user feedback / analysis / admin
    // comment) directly. These run independent of the verdict so reviewers can
    // save a draft comment or analysis without finalizing approve/reject.
    const fieldUpdates: Record<string, unknown> = {};
    if (dto.approvedHours !== undefined) {
      fieldUpdates.approvedHours = dto.approvedHours;
    }
    if (dto.userFeedback !== undefined) {
      fieldUpdates.hoursJustification = dto.userFeedback;
    }
    if (dto.hoursJustification !== undefined) {
      fieldUpdates.reviewerAnalysis = dto.hoursJustification;
    }
    if (dto.adminComment !== undefined) {
      // adminComment lives on the Project row — write through.
      await this.prisma.project.update({
        where: {
          projectId: (await this.prisma.submission.findUniqueOrThrow({
            where: { submissionId },
            select: { projectId: true },
          })).projectId,
        },
        data: { adminComment: dto.adminComment },
      });
    }
    if (Object.keys(fieldUpdates).length > 0) {
      await this.prisma.submission.update({
        where: { submissionId },
        data: fieldUpdates,
      });
    }

    // Audit log captures what the reviewer changed.
    const auditChanges: Record<string, unknown> = {};
    if (dto.approvalStatus !== undefined)
      auditChanges.previousStatus = submission.approvalStatus;
    if (dto.approvedHours !== undefined)
      auditChanges.approvedHours = dto.approvedHours;
    if (dto.userFeedback !== undefined)
      auditChanges.userFeedback = dto.userFeedback;
    if (dto.hoursJustification !== undefined)
      auditChanges.hoursJustification = dto.hoursJustification;
    if (dto.adminComment !== undefined)
      auditChanges.adminComment = dto.adminComment;
    await this.prisma.submissionAuditLog.create({
      data: {
        submissionId,
        adminId: reviewerId,
        action: dto.approvalStatus !== undefined ? 'review' : 'update',
        newStatus: dto.approvalStatus || null,
        approvedHours: dto.approvedHours ?? null,
        changes: auditChanges as any,
      },
    });

    // Reviewer's decision. When pending, record into the state machine —
    // it will finalize iff the fraud gate has already resolved.
    // When already finalized (approved/rejected), treat as an edit and sync
    // the Airtable record in place without re-running the state machine.
    if (dto.approvalStatus !== undefined) {
      const passed = dto.approvalStatus === 'approved';
      if (submission.approvalStatus === 'pending') {
        await this.submissionApprovalService.recordReviewerDecision(
          submissionId,
          passed,
          reviewerId,
          dto,
        );
      } else if (submission.approvalStatus === 'approved') {
        await this.submissionApprovalService.updateFinalizedSubmission(
          submissionId,
          reviewerId,
          dto,
        );
      }
      // If already rejected, no edit path — reviewer decision is a no-op.
    } else if (submission.approvalStatus === 'approved') {
      // Field-only edit on an already-approved submission still needs Airtable sync.
      await this.submissionApprovalService.updateFinalizedSubmission(
        submissionId,
        reviewerId,
        dto,
      );
    }

    return {
      success: true,
      submissionId,
      status: dto.approvalStatus ?? submission.approvalStatus,
    };
  }

  /**
   * Quick-approve: auto-fills hours from hackatime and marks the reviewer gate
   * as passed. Final approval still requires fraud to pass.
   */
  async quickApproveSubmission(
    submissionId: number,
    reviewerId: number,
    dto: QuickApproveDto,
  ) {
    const submission = await this.prisma.submission.findUnique({
      where: { submissionId },
      include: { project: { select: { nowHackatimeHours: true } } },
    });
    if (!submission) {
      throw new NotFoundException(`Submission ${submissionId} not found`);
    }

    const hackatimeHours = submission.project.nowHackatimeHours || 0;
    const approvedHours = dto.approvedHours ?? hackatimeHours;
    const autoAnalysis = `Quick approved with ${approvedHours.toFixed(1)} hours.`;
    const reviewerAnalysisText = dto.hoursJustification || autoAnalysis;

    await this.prisma.submission.update({
      where: { submissionId },
      data: {
        approvedHours,
        hoursJustification: dto.userFeedback || '',
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
          userFeedback: dto.userFeedback || null,
        },
      },
    });

    await this.submissionApprovalService.recordReviewerDecision(
      submissionId,
      true,
      reviewerId,
      {
        approvalStatus: 'approved',
        approvedHours,
        hoursJustification: reviewerAnalysisText,
        userFeedback: dto.userFeedback,
        sendEmail: false,
      },
    );

    return { success: true, submissionId, status: 'approved' };
  }

  /**
   * Poll the fraud review platform for all projects awaiting a decision,
   * submit any that were missed (e.g. API was down), and update pass/fail status.
   */
  async refreshFraudStatuses() {
    return this.fraudReviewService.pollPendingProjects();
  }

  /**
   * Reviewer leaderboard + general review timing stats.
   * Leaderboard: broken down by all-time, past 7 days, and today.
   * General stats: longest wait, average and median review time (past 30 days).
   */
  async getReviewStats() {
    const submissions = await this.prisma.submission.findMany({
      where: {
        reviewedBy: { not: null },
        approvalStatus: { in: ['approved', 'rejected'] },
      },
      select: {
        reviewedBy: true,
        reviewedAt: true,
        createdAt: true,
      },
    });

    const now = new Date();
    const dayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const weekStart = new Date(dayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const thirtyDaysAgo = new Date(dayStart);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Leaderboard buckets keyed by reviewerId
    const allTime = new Map<string, number>();
    const week = new Map<string, number>();
    const day = new Map<string, number>();

    // Review durations for general stats (past 30 days only)
    const recentDurationsMs: number[] = [];

    for (const sub of submissions) {
      const reviewerId = sub.reviewedBy!;
      allTime.set(reviewerId, (allTime.get(reviewerId) || 0) + 1);

      if (sub.reviewedAt && sub.reviewedAt >= weekStart) {
        week.set(reviewerId, (week.get(reviewerId) || 0) + 1);
      }
      if (sub.reviewedAt && sub.reviewedAt >= dayStart) {
        day.set(reviewerId, (day.get(reviewerId) || 0) + 1);
      }

      // Review duration = reviewedAt - createdAt
      if (sub.reviewedAt && sub.reviewedAt >= thirtyDaysAgo) {
        recentDurationsMs.push(
          sub.reviewedAt.getTime() - sub.createdAt.getTime(),
        );
      }
    }

    // Resolve reviewer names
    const reviewerIds = [...allTime.keys()]
      .map((id) => parseInt(id))
      .filter((id) => !isNaN(id));
    const reviewerUsers = await this.prisma.user.findMany({
      where: { userId: { in: reviewerIds } },
      select: { userId: true, firstName: true, lastName: true },
    });
    const userMap = new Map(
      reviewerUsers.map((u) => [u.userId.toString(), u]),
    );

    const buildLeaderboard = (bucket: Map<string, number>) =>
      [...bucket.entries()]
        .map(([id, count]) => {
          const user = userMap.get(id);
          return {
            reviewerId: id,
            name: user
              ? `${user.firstName} ${user.lastName}`
              : `User ${id}`,
            count,
          };
        })
        .sort((a, b) => b.count - a.count);

    // General stats from past-30-day durations
    recentDurationsMs.sort((a, b) => a - b);
    const toHours = (ms: number) =>
      Math.round((ms / (1000 * 60 * 60)) * 10) / 10;

    const longestWaitHours =
      recentDurationsMs.length > 0
        ? toHours(recentDurationsMs[recentDurationsMs.length - 1])
        : null;
    const avgReviewHours =
      recentDurationsMs.length > 0
        ? toHours(
            recentDurationsMs.reduce((a, b) => a + b, 0) /
              recentDurationsMs.length,
          )
        : null;
    let medianReviewHours: number | null = null;
    if (recentDurationsMs.length > 0) {
      const mid = Math.floor(recentDurationsMs.length / 2);
      const medianMs =
        recentDurationsMs.length % 2 === 1
          ? recentDurationsMs[mid]
          : (recentDurationsMs[mid - 1] + recentDurationsMs[mid]) / 2;
      medianReviewHours = toHours(medianMs);
    }

    // Pending submissions for longest current wait
    const oldestPending = await this.prisma.submission.findFirst({
      where: { approvalStatus: 'pending' },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    const longestCurrentWaitHours = oldestPending
      ? toHours(now.getTime() - oldestPending.createdAt.getTime())
      : null;

    return {
      leaderboard: {
        allTime: buildLeaderboard(allTime),
        week: buildLeaderboard(week),
        day: buildLeaderboard(day),
      },
      general: {
        longestWaitLast30Days: longestWaitHours,
        avgReviewTimeLast30Days: avgReviewHours,
        medianReviewTimeLast30Days: medianReviewHours,
        longestCurrentWait: longestCurrentWaitHours,
        reviewsLast30Days: recentDurationsMs.length,
      },
    };
  }

  /**
   * List all finalized (approved/rejected) submissions, newest first.
   * Frontend splits this into "mine" vs "all" using currentReviewerId.
   */
  async getPastReviews(currentReviewerId: number) {
    const submissions = await this.prisma.submission.findMany({
      where: {
        approvalStatus: { in: ['approved', 'rejected'] },
        reviewedBy: { not: null },
      },
      orderBy: { reviewedAt: 'desc' },
      select: {
        submissionId: true,
        projectId: true,
        approvalStatus: true,
        reviewPassed: true,
        approvedHours: true,
        hackatimeHours: true,
        reviewedBy: true,
        reviewedAt: true,
        project: {
          select: {
            projectId: true,
            projectTitle: true,
            projectType: true,
            user: { select: SCOPED_USER_SELECT },
          },
        },
      },
    });

    const reviewerIds = [
      ...new Set(
        submissions
          .map((s) => s.reviewedBy)
          .filter((id): id is string => id !== null)
          .map((id) => parseInt(id))
          .filter((id) => !isNaN(id)),
      ),
    ];
    const reviewers = await this.prisma.user.findMany({
      where: { userId: { in: reviewerIds } },
      select: { userId: true, firstName: true, lastName: true },
    });
    const reviewerMap = new Map(
      reviewers.map((r) => [r.userId.toString(), r]),
    );

    const reviews = submissions.map((s) => {
      const reviewer = s.reviewedBy ? reviewerMap.get(s.reviewedBy) : null;
      return {
        submissionId: s.submissionId,
        projectId: s.projectId,
        projectTitle: s.project.projectTitle,
        projectType: s.project.projectType,
        reviewerId: s.reviewedBy,
        reviewerName: reviewer
          ? `${reviewer.firstName} ${reviewer.lastName}`
          : s.reviewedBy
            ? `User ${s.reviewedBy}`
            : 'Unknown',
        // Overall reconciled outcome (reviewer + fraud gates).
        approvalStatus: s.approvalStatus,
        // Reviewer's own decision — can diverge from approvalStatus when fraud
        // silently rejects a reviewer-approved submission.
        reviewPassed: s.reviewPassed,
        approvedHours: s.approvedHours,
        hackatimeHours: s.hackatimeHours,
        reviewedAt: s.reviewedAt,
        user: this.scopeUserData(s.project.user),
      };
    });

    return { currentReviewerId, reviews };
  }

  /** Save the adminComment field on a project or user. */
  async saveNote(
    targetType: 'project' | 'user',
    targetId: number,
    dto: SaveNoteDto,
    reviewerId: number,
  ) {
    if (targetType === 'project') {
      const prior = await this.prisma.project.findUnique({
        where: { projectId: targetId },
        select: { adminComment: true },
      });
      await this.prisma.project.update({
        where: { projectId: targetId },
        data: { adminComment: dto.content },
      });
      // Anchor the audit entry to the latest submission on this project.
      // Projects with no submissions yet won't be audited — notes before a
      // first submission have nothing to show up on in the timeline.
      const latest = await this.prisma.submission.findFirst({
        where: { projectId: targetId },
        orderBy: { createdAt: 'desc' },
        select: { submissionId: true },
      });
      if (latest) {
        await this.prisma.submissionAuditLog.create({
          data: {
            submissionId: latest.submissionId,
            adminId: reviewerId,
            action: AUDIT_ACTIONS.noteUpdate,
            changes: {
              targetType: 'project',
              targetId,
              previous: prior?.adminComment ?? '',
              next: dto.content,
            },
          },
        });
      }
    } else {
      // TODO: user-level note audit has no natural submission anchor.
      // Revisit if we add a user-scoped audit log.
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
    hackatimeStartDate: Date | null;
  }) {
    let age: number | null = null;
    if (user.birthday) {
      const today = new Date();
      const birth = new Date(user.birthday);
      age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < birth.getDate())
      ) {
        age--;
      }
    }

    return {
      userId: user.userId,
      firstName: user.firstName,
      lastName: user.lastName,
      slackUserId: user.slackUserId,
      age,
      hackatimeStartDate: user.hackatimeStartDate,
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
    reviewerMap: Map<
      number,
      { userId: number; firstName: string; lastName: string }
    >,
  ) {
    type TimelineEntry =
      | {
          type: 'submitted' | 'resubmitted';
          hours: number | null;
          timestamp: Date;
        }
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
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
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
    events.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    return events;
  }
}
