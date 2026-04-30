import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AirtableService } from '../airtable/airtable.service';
import { MailService } from '../mail/mail.service';
import { SlackService } from '../slack/slack.service';
import { ManifestService } from '../manifest/manifest.service';
import { ReviewSubmissionDto } from '../reviewer/dto/review-submission.dto';
import { AUDIT_ACTIONS } from './audit-actions';

function describeDetermination(
  newStatus: 'approved' | 'rejected',
  reviewPassed: boolean | null,
  fraudRaw: boolean | null,
  isSilent: boolean,
): string {
  if (newStatus === 'approved') {
    if (fraudRaw === null) return 'approved: fraud gate disabled, passed review';
    return 'approved: passed fraud and passed review';
  }
  if (isSilent) {
    if (reviewPassed === true) return 'rejected (silent): failed fraud, passed review';
    if (reviewPassed === false) return 'rejected (silent): failed both gates';
    return 'rejected (silent): failed fraud before review';
  }
  if (fraudRaw === true) return 'rejected: failed review, passed fraud';
  if (fraudRaw === null) return 'rejected: failed review, fraud gate disabled';
  return 'rejected: failed review';
}

/** Format decimal hours as "Xh Ymin". */
function formatHoursMin(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

interface FraudReviewInfo {
  joeProjectId: string;
  reviewedAt: Date;
  hackatimeProjects: string[];
}

/**
 * Wrap the reviewer's analysis with boilerplate hours summary + fraud line + footer.
 */
function buildFullJustification(
  reviewerAnalysis: string,
  hackatimeHours: number | null,
  approvedHours: number,
  submitterSlackId: string | null,
  submissionDate: Date,
  reviewerSlackId: string | null,
  fraudReview?: FraudReviewInfo | null,
): string {
  const parts: string[] = [];

  const tracked =
    hackatimeHours != null ? formatHoursMin(hackatimeHours) : 'unknown';
  const approved = formatHoursMin(approvedHours);
  if (
    hackatimeHours != null &&
    Math.abs(hackatimeHours - approvedHours) < 0.05
  ) {
    parts.push(
      `This user tracked ${tracked} on Hackatime. No adjustment was made.`,
    );
  } else {
    parts.push(
      `This user tracked ${tracked} on Hackatime. This was adjusted to ${approved} after review.`,
    );
  }

  if (reviewerAnalysis.trim()) {
    parts.push('', reviewerAnalysis.trim());
  }

  const submitterRef = submitterSlackId || 'unknown';
  const submitDate = submissionDate.toISOString().split('T')[0];
  const reviewerRef = reviewerSlackId || 'unknown';
  const today = new Date().toISOString().split('T')[0];

  parts.push('');
  parts.push(`Project was submitted by @/${submitterRef} on ${submitDate}.`);

  if (fraudReview) {
    const fraudDate = fraudReview.reviewedAt.toISOString().split('T')[0];
    const projectsSuffix =
      fraudReview.hackatimeProjects.length > 0
        ? `, who reviewed the time tracked on ${fraudReview.hackatimeProjects.join(', ')}`
        : '';
    parts.push(
      `Project passed fraud review (case ${fraudReview.joeProjectId}) from the Fraud Squad on ${fraudDate}${projectsSuffix}.`,
    );
  }

  parts.push(`Project was reviewed by @/${reviewerRef} on ${today}.`);

  return parts.join('\n');
}

/**
 * Owns the reconciliation between the reviewer gate (Submission.reviewPassed) and
 * the fraud gate (Project.joeFraudPassed). Submission.approvalStatus stays `pending`
 * until both gates resolve, at which point this service transitions it to the final
 * outcome and fires all downstream side effects (Airtable sync, Slack, email, project
 * data copy).
 */
@Injectable()
export class SubmissionApprovalService {
  constructor(
    private prisma: PrismaService,
    private airtableService: AirtableService,
    private mailService: MailService,
    private slackService: SlackService,
    private manifestService: ManifestService,
  ) {}

  /**
   * Record the reviewer's decision and attempt to reconcile. If the fraud gate
   * hasn't produced a result yet, approvalStatus stays pending and nothing else
   * fires — the fraud poll will re-run this reconciliation when fraud resolves.
   */
  async recordReviewerDecision(
    submissionId: number,
    passed: boolean,
    reviewerId: number,
    dto: ReviewSubmissionDto,
  ): Promise<void> {
    const data: Record<string, unknown> = {
      reviewPassed: passed,
      pendingSendEmail: dto.sendEmail === true,
      reviewedBy: reviewerId.toString(),
      reviewedAt: new Date(),
    };
    if (dto.hoursJustification !== undefined) {
      data.reviewerAnalysis = dto.hoursJustification;
    }
    await this.prisma.submission.update({
      where: { submissionId },
      data,
    });
    await this.evaluateAndFinalize(submissionId, reviewerId);
  }

  /**
   * Edit-in-place path for admins updating an already-finalized submission
   * (e.g., adjusting approvedHours on an already-approved submission).
   * Keeps the Airtable record in sync; does not re-run the state machine.
   */
  async updateFinalizedSubmission(
    submissionId: number,
    reviewerId: number,
    dto: ReviewSubmissionDto,
  ): Promise<void> {
    const submission = await this.prisma.submission.findUnique({
      where: { submissionId },
      include: {
        project: { include: { user: true } },
      },
    });
    if (!submission || submission.approvalStatus !== 'approved') return;

    // Rebuild the full justification if the reviewer edited it.
    let fullJustification: string | undefined;
    if (dto.hoursJustification !== undefined) {
      const reviewer = await this.prisma.user.findUnique({
        where: { userId: reviewerId },
        select: { slackUserId: true },
      });
      fullJustification = buildFullJustification(
        dto.hoursJustification,
        submission.hackatimeHours,
        dto.approvedHours ?? submission.approvedHours ?? 0,
        submission.project.user.slackUserId,
        submission.createdAt,
        reviewer?.slackUserId ?? null,
        this.buildFraudReviewInfo(submission.project),
      );
    }

    const effective = fullJustification
      ? { ...dto, hoursJustification: fullJustification }
      : dto;

    await this.syncProjectData(submission, effective);
    if (submission.airtableRecId) {
      await this.updateAirtableRecord(submission, effective);
    }
  }

  /**
   * Called by the fraud poll after updating Project.joeFraudPassed. Fans out over
   * every pending submission on the project and re-runs reconciliation.
   */
  async onFraudStatusChanged(projectId: number): Promise<void> {
    const pending = await this.prisma.submission.findMany({
      where: { projectId, approvalStatus: 'pending' },
      select: { submissionId: true },
    });
    for (const s of pending) {
      await this.evaluateAndFinalize(s.submissionId, 0);
    }
  }

  private isFraudEnabled(): boolean {
    return !!(
      process.env.JOE_API_BASE_URL &&
      process.env.JOE_API_KEY &&
      process.env.JOE_EVENT_ID
    );
  }

  /**
   * Reconcile the two gates and transition approvalStatus from pending if possible.
   * CAS on approvalStatus='pending' makes this idempotent under reviewer + fraud-poll
   * races — exactly one caller wins the transition and fires side effects.
   *
   * Rule: fraud=false silent-rejects only when the reviewer has NOT explicitly
   * rejected. If the reviewer rejected, that decision is authoritative and the
   * user gets normal feedback (DM, in-app status, resubmit allowed). Pure
   * fraud-only rejections stay silent — the user sees "pending" and can't
   * resubmit, so fraud actors get no signal.
   *
   * Truth table:
   *   reviewPassed=null, fraud=null            → pending (both gates open)
   *   reviewPassed=null, fraud=true            → pending (awaiting reviewer)
   *   reviewPassed=null, fraud=false           → rejected, silent (fraud kicks out)
   *   reviewPassed=true, fraud=null            → pending (awaiting fraud)
   *   reviewPassed=true, fraud=true            → approved + full side effects
   *   reviewPassed=true, fraud=false           → rejected, silent
   *   reviewPassed=false, fraud=null           → rejected, normal (reviewer wins)
   *   reviewPassed=false, fraud=true           → rejected, normal
   *   reviewPassed=false, fraud=false          → rejected, normal (reviewer's call stands)
   */
  private async evaluateAndFinalize(
    submissionId: number,
    actorUserId: number,
  ): Promise<void> {
    const submission = await this.prisma.submission.findUnique({
      where: { submissionId },
      include: {
        project: { include: { user: true } },
      },
    });
    if (!submission || submission.approvalStatus !== 'pending') return;

    const reviewPassed = submission.reviewPassed;
    const fraudEnabled = this.isFraudEnabled();
    const fraudRaw = submission.project.joeFraudPassed;
    const fraudEffective = fraudEnabled ? fraudRaw : true;

    // Fraud failure rejects, but only silently if the reviewer hasn't also
    // rejected. A reviewer rejection is authoritative — the user deserves the
    // feedback even when fraud also fired.
    if (fraudEffective === false) {
      await this.commitTransition(
        submission,
        'rejected',
        reviewPassed !== false,
        actorUserId,
        fraudRaw,
      );
      return;
    }

    // Reviewer hasn't decided; wait.
    if (reviewPassed === null) return;

    // Reviewer approved but fraud hasn't returned; wait.
    if (reviewPassed === true && fraudEffective === null) return;

    if (reviewPassed === true && fraudEffective === true) {
      await this.commitTransition(
        submission,
        'approved',
        false,
        actorUserId,
        fraudRaw,
      );
      return;
    }

    // reviewPassed === false and fraud is not failed — normal rejection.
    await this.commitTransition(
      submission,
      'rejected',
      false,
      actorUserId,
      fraudRaw,
    );
  }

  private async commitTransition(
    submission: {
      submissionId: number;
      projectId: number;
      hackatimeHours: number | null;
      createdAt: Date;
      playableUrl: string | null;
      repoUrl: string | null;
      screenshotUrl: string | null;
      description: string | null;
      approvedHours: number | null;
      hoursJustification: string | null;
      reviewerAnalysis: string | null;
      reviewPassed: boolean | null;
      reviewedBy: string | null;
      pendingSendEmail: boolean;
      project: {
        projectTitle: string;
        projectId: number;
        playableUrl: string | null;
        repoUrl: string | null;
        screenshotUrl: string | null;
        description: string | null;
        joeProjectId: string | null;
        joeFraudPassed: boolean | null;
        joeFraudReviewedAt: Date | null;
        nowHackatimeProjects: string[];
        user: { email: string; slackUserId: string | null };
      };
    },
    newStatus: 'approved' | 'rejected',
    isSilent: boolean,
    actorUserId: number,
    fraudRaw: boolean | null,
  ): Promise<void> {
    // CAS: only the first caller wins the pending → terminal transition.
    const result = await this.prisma.submission.updateMany({
      where: { submissionId: submission.submissionId, approvalStatus: 'pending' },
      data: {
        approvalStatus: newStatus,
        silentReject: isSilent,
        finalizedAt: new Date(),
      },
    });
    if (result.count === 0) return;

    await this.prisma.submissionAuditLog.create({
      data: {
        submissionId: submission.submissionId,
        adminId: actorUserId,
        action: AUDIT_ACTIONS.finalize,
        newStatus,
        approvedHours: submission.approvedHours ?? null,
        changes: {
          reviewPassed: submission.reviewPassed,
          joeFraudPassed: fraudRaw,
          silent: isSilent,
          determination: describeDetermination(
            newStatus,
            submission.reviewPassed,
            fraudRaw,
            isSilent,
          ),
        },
      },
    });

    if (newStatus === 'approved') {
      await this.fireApprovalSideEffects(submission);
    } else if (!isSilent) {
      await this.fireRejectionSideEffects(submission);
    }
  }

  private async fireApprovalSideEffects(submission: {
    submissionId: number;
    projectId: number;
    hackatimeHours: number | null;
    createdAt: Date;
    playableUrl: string | null;
    repoUrl: string | null;
    screenshotUrl: string | null;
    description: string | null;
    approvedHours: number | null;
    hoursJustification: string | null;
    reviewerAnalysis: string | null;
    reviewedBy: string | null;
    pendingSendEmail: boolean;
    project: {
      projectTitle: string;
      projectId: number;
      playableUrl: string | null;
      repoUrl: string | null;
      screenshotUrl: string | null;
      description: string | null;
      joeProjectId: string | null;
      joeFraudPassed: boolean | null;
      joeFraudReviewedAt: Date | null;
      nowHackatimeProjects: string[];
      user: { email: string; slackUserId: string | null };
    };
  }): Promise<void> {
    // Rebuild the full justification from the persisted reviewer analysis +
    // current project / reviewer state. This defers to finalization time so
    // that fraud review info (populated after reviewer acted) is included.
    const reviewerId = Number(submission.reviewedBy);
    const reviewer = Number.isFinite(reviewerId)
      ? await this.prisma.user.findUnique({
          where: { userId: reviewerId },
          select: { slackUserId: true },
        })
      : null;
    const fullJustification = buildFullJustification(
      submission.reviewerAnalysis ?? '',
      submission.hackatimeHours,
      submission.approvedHours ?? 0,
      submission.project.user.slackUserId,
      submission.createdAt,
      reviewer?.slackUserId ?? null,
      this.buildFraudReviewInfo(submission.project),
    );

    await this.syncProjectData(submission, {
      approvalStatus: 'approved',
      approvedHours: submission.approvedHours ?? undefined,
      hoursJustification: fullJustification,
    });
    await this.syncAirtable(submission, {
      approvedHours: submission.approvedHours ?? undefined,
      hoursJustification: fullJustification,
    });
    await this.sendNotifications(submission, {
      approved: true,
      approvedHours: submission.approvedHours ?? undefined,
      feedback: submission.hoursJustification,
      sendEmail: submission.pendingSendEmail,
    });
  }

  private async fireRejectionSideEffects(submission: {
    approvedHours: number | null;
    hoursJustification: string | null;
    pendingSendEmail: boolean;
    project: {
      projectTitle: string;
      projectId: number;
      user: { email: string };
    };
  }): Promise<void> {
    await this.sendNotifications(submission, {
      approved: false,
      approvedHours: submission.approvedHours ?? undefined,
      feedback: submission.hoursJustification,
      sendEmail: submission.pendingSendEmail,
    });
  }

  private buildFraudReviewInfo(project: {
    joeProjectId: string | null;
    joeFraudPassed: boolean | null;
    joeFraudReviewedAt: Date | null;
    nowHackatimeProjects: string[];
  }): FraudReviewInfo | null {
    if (!project.joeFraudPassed || !project.joeProjectId) return null;
    return {
      joeProjectId: project.joeProjectId,
      reviewedAt: project.joeFraudReviewedAt ?? new Date(),
      hackatimeProjects: project.nowHackatimeProjects,
    };
  }

  private async syncProjectData(
    submission: {
      projectId: number;
      playableUrl: string | null;
      repoUrl: string | null;
      screenshotUrl: string | null;
      description: string | null;
    },
    dto: {
      approvalStatus?: 'pending' | 'approved' | 'rejected';
      approvedHours?: number;
      hoursJustification?: string;
      adminComment?: string;
    },
  ): Promise<void> {
    const data: Record<string, unknown> = {};
    if (dto.approvedHours !== undefined) data.approvedHours = dto.approvedHours;
    if (dto.hoursJustification !== undefined)
      data.hoursJustification = dto.hoursJustification;
    if (dto.adminComment !== undefined) data.adminComment = dto.adminComment;
    if (dto.approvalStatus === 'approved') {
      data.playableUrl = submission.playableUrl;
      data.repoUrl = submission.repoUrl;
      data.screenshotUrl = submission.screenshotUrl;
      data.description = submission.description;
    }
    if (Object.keys(data).length === 0) return;
    await this.prisma.project.update({
      where: { projectId: submission.projectId },
      data,
    });
  }

  /** Create the Airtable record on first approval. Delta hours vs the prior approved submission. */
  private async syncAirtable(
    submission: {
      submissionId: number;
      projectId: number;
      createdAt: Date;
      playableUrl: string | null;
      repoUrl: string | null;
      screenshotUrl: string | null;
      description: string | null;
      project: {
        playableUrl: string | null;
        repoUrl: string | null;
        screenshotUrl: string | null;
        description: string | null;
      };
    },
    dto: { approvedHours?: number; hoursJustification?: string },
  ): Promise<void> {
    try {
      const project = await this.prisma.project.findUnique({
        where: { projectId: submission.projectId },
        include: { user: true },
      });
      if (!project) return;

      const totalApprovedHours = dto.approvedHours || 0;

      const lastApprovedSubmission = await this.prisma.submission.findFirst({
        where: {
          projectId: submission.projectId,
          approvalStatus: 'approved',
          createdAt: { lt: submission.createdAt },
        },
        orderBy: { createdAt: 'desc' },
        select: { approvedHours: true },
      });
      const previouslyApprovedHours =
        lastApprovedSubmission?.approvedHours || 0;

      // Subtract hours already shipped to other YSWS programs (from Manifest)
      // so we don't double-credit work the user already got hours for. Sum
      // hoursShipped across non-Horizons submissions; null/missing entries
      // contribute 0, so this is a safe no-op if Manifest is disabled or the
      // codeUrl isn't registered.
      const codeUrl = submission.repoUrl || submission.project.repoUrl;
      let priorYswsHoursShipped = 0;
      if (codeUrl && this.manifestService.isEnabled()) {
        const manifest = await this.manifestService.lookup(codeUrl);
        priorYswsHoursShipped = (manifest?.submissions ?? [])
          .filter((s) => (s.yswsName ?? '').toLowerCase() !== 'horizons')
          .reduce((sum, s) => sum + (s.hoursShipped ?? 0), 0);
      }

      const deltaHours = Math.max(
        0,
        totalApprovedHours - previouslyApprovedHours - priorYswsHoursShipped,
      );

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
          playableUrl:
            submission.playableUrl || submission.project.playableUrl || '',
          repoUrl: submission.repoUrl || submission.project.repoUrl || '',
          screenshotUrl:
            submission.screenshotUrl || submission.project.screenshotUrl || '',
          approvedHours: deltaHours,
          hoursJustification:
            project.hoursJustification || dto.hoursJustification || '',
          description:
            submission.description ||
            submission.project.description ||
            undefined,
        },
      };

      const airtableResult =
        await this.airtableService.createApprovedProject(approvedProjectData);
      if (airtableResult.recordId) {
        await this.prisma.submission.update({
          where: { submissionId: submission.submissionId },
          data: { airtableRecId: airtableResult.recordId },
        });
      }
    } catch (error) {
      console.error('Airtable sync failed:', error);
    }
  }

  /** Update an existing Airtable record when editing an already-approved submission. */
  private async updateAirtableRecord(
    submission: {
      submissionId: number;
      projectId: number;
      createdAt: Date;
      airtableRecId: string | null;
      playableUrl: string | null;
      repoUrl: string | null;
      screenshotUrl: string | null;
      description: string | null;
    },
    dto: { approvedHours?: number; hoursJustification?: string },
  ): Promise<void> {
    if (!submission.airtableRecId) return;
    try {
      let approvedHours = dto.approvedHours;

      if (approvedHours !== undefined) {
        const lastApprovedSubmission = await this.prisma.submission.findFirst({
          where: {
            projectId: submission.projectId,
            approvalStatus: 'approved',
            createdAt: { lt: submission.createdAt },
          },
          orderBy: { createdAt: 'desc' },
          select: { approvedHours: true },
        });
        const previouslyApprovedHours =
          lastApprovedSubmission?.approvedHours || 0;
        approvedHours = Math.max(0, approvedHours - previouslyApprovedHours);
      }

      await this.airtableService.updateApprovedProject(
        submission.airtableRecId,
        {
          playableUrl: submission.playableUrl || undefined,
          repoUrl: submission.repoUrl || undefined,
          screenshotUrl: submission.screenshotUrl || undefined,
          description: submission.description || undefined,
          approvedHours,
          hoursJustification: dto.hoursJustification,
        },
      );
    } catch (error) {
      console.error('Airtable update failed:', error);
    }
  }

  private async sendNotifications(
    submission: {
      project: {
        projectTitle: string;
        projectId: number;
        user: { email: string };
      };
      hoursJustification: string | null;
    },
    payload: {
      approved: boolean;
      approvedHours?: number;
      feedback: string | null;
      sendEmail: boolean;
    },
  ): Promise<void> {
    if (payload.sendEmail) {
      try {
        await this.mailService.sendSubmissionReviewEmail(
          submission.project.user.email,
          {
            projectTitle: submission.project.projectTitle,
            projectId: submission.project.projectId,
            approved: payload.approved,
            approvedHours: payload.approvedHours,
            feedback: payload.feedback,
          },
        );
      } catch (error) {
        console.error('Email notification failed:', error);
      }
    }

    try {
      await this.slackService.notifySubmissionReview(
        submission.project.user.email,
        {
          projectTitle: submission.project.projectTitle,
          projectId: submission.project.projectId,
          approved: payload.approved,
          approvedHours: payload.approvedHours,
          feedback: payload.feedback,
        },
      );
    } catch (error) {
      console.error('Slack notification failed:', error);
    }
  }
}
