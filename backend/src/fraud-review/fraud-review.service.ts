import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { SubmissionApprovalService } from '../submission-approval/submission-approval.service';

const FRAUD_POLL_INTERVAL_MS = 5 * 60 * 1000;

/** Shape of a single project returned by GET /events/{eventId}/projects */
interface JoeProject {
  id: string;
  name: string;
  organizerPlatformId: string | null;
  status: 'pending' | 'complete';
  review: {
    trustScore: number;
    justification: string;
    reviewedAt: string;
  } | null;
  outcome: {
    status: 'approved' | 'rejected';
    reason: string | null;
    recordedAt: string;
  } | null;
}

interface SubmitProjectPayload {
  name: string;
  codeLink: string;
  demoLink?: string;
  submitter: { slackId: string } | { email: string };
  hackatimeProjects?: string[];
  organizerPlatformId?: string;
}

@Injectable()
export class FraudReviewService {
  private readonly logger = new Logger(FraudReviewService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly eventId: string;
  private readonly enabled: boolean;

  constructor(
    private prisma: PrismaService,
    private submissionApprovalService: SubmissionApprovalService,
  ) {
    this.baseUrl = (process.env.JOE_API_BASE_URL || '').replace(/\/$/, '');
    this.apiKey = process.env.JOE_API_KEY || '';
    this.eventId = process.env.JOE_EVENT_ID || '';
    this.enabled = !!(this.baseUrl && this.apiKey && this.eventId);

    if (!this.enabled) {
      this.logger.warn(
        'Fraud review API not configured — set JOE_API_BASE_URL, JOE_API_KEY, and JOE_EVENT_ID to enable',
      );
    } else {
      this.logger.log(
        `Fraud review enabled — base=${this.baseUrl} eventId=${this.eventId}`,
      );
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private authHeaders() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Submit a project to the fraud review platform.
   * Returns the platform-assigned UUID, or null if the call fails.
   */
  async submitProject(payload: SubmitProjectPayload): Promise<string | null> {
    if (!this.enabled) return null;

    try {
      const response = await fetch(
        `${this.baseUrl}/events/${this.eventId}/projects`,
        {
          method: 'POST',
          headers: this.authHeaders(),
          body: JSON.stringify(payload),
        },
      );

      const data = (await response.json()) as { id?: string };

      if (!response.ok && response.status !== 200) {
        this.logger.error(
          `Fraud review submit failed (${response.status}): ${JSON.stringify(data)}`,
        );
        return null;
      }

      // 201 = created, 200 = already exists (deduplicated by organizerPlatformId)
      return data.id ?? null;
    } catch (error) {
      this.logger.error('Fraud review submit request threw', error);
      return null;
    }
  }

  /**
   * Fetch all projects for this event from the fraud review platform.
   * Returns a map of organizerPlatformId -> JoeProject for easy lookup.
   */
  async listAllProjects(): Promise<Map<string, JoeProject> | null> {
    if (!this.enabled) return null;

    try {
      const response = await fetch(
        `${this.baseUrl}/events/${this.eventId}/projects`,
        { headers: this.authHeaders() },
      );

      if (!response.ok) {
        this.logger.error(
          `Fraud review list projects failed (${response.status})`,
        );
        return null;
      }

      const data = (await response.json()) as { projects: JoeProject[] };
      const projectMap = new Map<string, JoeProject>();

      for (const project of data.projects) {
        // Index by organizerPlatformId so we can match to our DB rows
        if (project.organizerPlatformId) {
          projectMap.set(project.organizerPlatformId, project);
        }
        // Also index by Joe's UUID for lookups by joeProjectId
        projectMap.set(project.id, project);
      }

      return projectMap;
    } catch (error) {
      this.logger.error('Fraud review list projects threw', error);
      return null;
    }
  }

  /**
   * Submit a project to fraud review and persist the returned ID on the project row.
   * Fire-and-forget safe: errors are logged but not re-thrown.
   */
  async submitAndPersist(projectId: number): Promise<void> {
    try {
      const project = await this.prisma.project.findUnique({
        where: { projectId },
        include: {
          user: { select: { slackUserId: true, email: true } },
          submissions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { submissionId: true },
          },
        },
      });

      if (!project) return;
      if (project.joeProjectId) return;

      const latestSubmissionId = project.submissions[0]?.submissionId;
      if (!latestSubmissionId) return;

      const submitter = project.user.slackUserId
        ? { slackId: project.user.slackUserId }
        : { email: project.user.email };

      const fraudReviewId = await this.submitProject({
        name: project.projectTitle,
        codeLink: project.repoUrl || '',
        demoLink: project.playableUrl || undefined,
        submitter,
        hackatimeProjects:
          project.nowHackatimeProjects.length > 0
            ? project.nowHackatimeProjects
            : undefined,
        // Per-submission dedup key so each resubmission triggers a fresh
        // Joe review instead of returning the cached previous decision.
        organizerPlatformId: `project-${projectId}-submission-${latestSubmissionId}`,
      });

      if (fraudReviewId) {
        await this.prisma.project.update({
          where: { projectId },
          data: { joeProjectId: fraudReviewId },
        });
      }
    } catch (error) {
      this.logger.error(
        `submitAndPersist failed for project ${projectId}`,
        error,
      );
    }
  }

  /**
   * Pass/fail is driven solely by Joe's recorded outcome. Auto-rejected
   * projects (trustScore ≤ 4) never get an outcome and remain null here,
   * which the queue filter also excludes.
   */
  private didPassFraudReview(joeProject: JoeProject): boolean {
    return joeProject.outcome?.status === 'approved';
  }

  /**
   * Poll the fraud review platform for all projects awaiting a decision
   * and update their joeFraudPassed status in the DB.
   *
   * Also catches projects that were never submitted (e.g. API was down at
   * submission time) and submits them now.
   *
   * Runs automatically every 5 minutes via @nestjs/schedule, and can also
   * be triggered manually from the reviewer controller.
   */
  @Interval(FRAUD_POLL_INTERVAL_MS)
  async pollPendingProjects(): Promise<{ submitted: number; updated: number }> {
    if (!this.enabled) return { submitted: 0, updated: 0 };

    // Step 1: submit any projects that never got sent to fraud review
    const unsubmittedProjects = await this.prisma.project.findMany({
      where: {
        joeProjectId: null,
        joeFraudPassed: null,
        submissions: { some: { approvalStatus: 'pending' } },
      },
      select: { projectId: true },
    });

    let submitted = 0;
    for (const project of unsubmittedProjects) {
      await this.submitAndPersist(project.projectId);
      submitted++;
    }

    // Step 2: fetch all projects from Joe in a single API call
    const joeProjects = await this.listAllProjects();
    if (!joeProjects) return { submitted, updated: 0 };

    // Step 3: re-sync any project that has been submitted to Joe AND still
    // has a pending submission. We can't restrict this to joeFraudPassed=null
    // because Joe may flip a previously-passed project to rejected (manual
    // outcome) and we need to pick that up so it leaves the review queue.
    const pendingProjects = await this.prisma.project.findMany({
      where: {
        joeProjectId: { not: null },
        submissions: { some: { approvalStatus: 'pending' } },
      },
      select: { projectId: true, joeProjectId: true },
    });

    let updated = 0;
    for (const project of pendingProjects) {
      if (!project.joeProjectId) continue;

      // Match by joeProjectId (UUID) or by our organizerPlatformId
      const joeProject =
        joeProjects.get(project.joeProjectId) ??
        joeProjects.get(`project-${project.projectId}`);

      // Skip if Joe hasn't recorded an outcome yet — leave joeFraudPassed
      // null rather than overwriting with false for still-pending projects.
      if (!joeProject || !joeProject.outcome) continue;

      const passed = this.didPassFraudReview(joeProject);

      const fraudReviewedAt = joeProject.review?.reviewedAt
        ? new Date(joeProject.review.reviewedAt)
        : new Date();

      await this.prisma.project.update({
        where: { projectId: project.projectId },
        data: {
          joeFraudPassed: passed,
          joeFraudReviewedAt: fraudReviewedAt,
          joeTrustScore: joeProject.review?.trustScore ?? null,
          joeJustification: joeProject.review?.justification ?? null,
          joeOutcomeStatus: joeProject.outcome?.status ?? null,
          joeOutcomeReason: joeProject.outcome?.reason ?? null,
          joeOutcomeRecordedAt: joeProject.outcome?.recordedAt
            ? new Date(joeProject.outcome.recordedAt)
            : null,
        },
      });

      // Re-run the approval state machine for every pending submission on this
      // project — the fraud gate may have just resolved and allowed a transition.
      await this.submissionApprovalService.onFraudStatusChanged(
        project.projectId,
      );

      updated++;
    }

    return { submitted, updated };
  }
}
