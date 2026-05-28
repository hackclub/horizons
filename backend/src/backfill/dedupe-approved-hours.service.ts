import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ManifestService } from '../manifest/manifest.service';

/**
 * One-shot backfill: applies the Manifest "other YSWS hours already shipped"
 * dedupe to existing `Submission.approvedHours` rows, then refreshes
 * `Project.approvedHours` to match the latest approved submission per project.
 *
 * Until the dedupe was moved into the submission-approval pipeline,
 * approvedHours stored on the row was the raw reviewer-entered value, which
 * meant downstream credit (leaderboard, shop balance, stats) ignored the
 * dedupe. This walks every approved submission once, re-applies the dedupe,
 * and brings stored values into line with the new semantic.
 *
 * Toggled by `BACKFILL_DEDUPE_APPROVED_HOURS`:
 *   unset / "off"  → no-op (default)
 *   "dry-run"      → log every change that would be made, write nothing
 *   "apply"        → log + write
 *
 * Intended workflow: deploy with `dry-run` first, verify the log, then redeploy
 * with `apply`. After a successful `apply` run, unset the variable so a future
 * restart doesn't re-dedupe and produce wrong values (this routine is NOT
 * idempotent — second run would dedupe twice).
 *
 * Honors prior reviewer opt-outs via SubmissionAuditLog: if the latest 'review'
 * action on a submission set ignorePriorYswsCredit=true, that row is left alone.
 */
@Injectable()
export class DedupeApprovedHoursBackfillService
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(DedupeApprovedHoursBackfillService.name);

  constructor(
    private prisma: PrismaService,
    private manifestService: ManifestService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const mode = (process.env.BACKFILL_DEDUPE_APPROVED_HOURS || '')
      .trim()
      .toLowerCase();

    if (!mode || mode === 'off') return;

    if (mode !== 'dry-run' && mode !== 'apply') {
      this.logger.warn(
        `BACKFILL_DEDUPE_APPROVED_HOURS="${mode}" not recognized — expected "dry-run", "apply", or "off". Skipping.`,
      );
      return;
    }

    if (!this.manifestService.isEnabled()) {
      this.logger.warn(
        'Backfill requested but Manifest is not configured — skipping.',
      );
      return;
    }

    const dryRun = mode === 'dry-run';
    this.logger.log(
      `Starting Submission.approvedHours dedupe backfill (mode=${mode}).`,
    );

    // Run in the background so it doesn't block the rest of bootstrap.
    void this.run(dryRun).catch((err) => {
      this.logger.error('Backfill threw', err as Error);
    });
  }

  private async run(dryRun: boolean): Promise<void> {
    let changedSubmissions = 0;
    let unchangedSubmissions = 0;
    let skippedNoCodeUrl = 0;
    let skippedOptOut = 0;
    let totalHoursRemoved = 0;
    const projectsToRefresh = new Set<number>();

    const submissions = await this.prisma.submission.findMany({
      where: { approvalStatus: 'approved' },
      include: { project: { select: { repoUrl: true } } },
      orderBy: { submissionId: 'asc' },
    });
    this.logger.log(`Found ${submissions.length} approved submissions.`);

    for (const sub of submissions) {
      const codeUrl = sub.repoUrl || sub.project.repoUrl;
      if (!codeUrl) {
        skippedNoCodeUrl++;
        continue;
      }
      if (await this.reviewerOptedOutOfDedupe(sub.submissionId)) {
        skippedOptOut++;
        continue;
      }

      const manifest = await this.manifestService.lookup(codeUrl);
      const priorYswsHoursShipped = (manifest?.submissions ?? [])
        .filter((s) => (s.yswsName ?? '').toLowerCase() !== 'horizons')
        .reduce((sum, s) => sum + (s.hoursShipped ?? 0), 0);

      if (priorYswsHoursShipped === 0) {
        unchangedSubmissions++;
        continue;
      }

      const current = sub.approvedHours ?? 0;
      const next = Math.max(0, current - priorYswsHoursShipped);
      if (next === current) {
        unchangedSubmissions++;
        continue;
      }

      this.logger.log(
        `submission ${sub.submissionId} (project ${sub.projectId}): ` +
          `${current.toFixed(2)}h → ${next.toFixed(2)}h ` +
          `(−${priorYswsHoursShipped.toFixed(2)}h other YSWS via ${codeUrl})`,
      );
      changedSubmissions++;
      totalHoursRemoved += current - next;
      projectsToRefresh.add(sub.projectId);

      if (!dryRun) {
        await this.prisma.submission.update({
          where: { submissionId: sub.submissionId },
          data: { approvedHours: next },
        });
      }
    }

    this.logger.log(
      `Submissions: ${changedSubmissions} changed, ${unchangedSubmissions} unchanged, ` +
        `${skippedNoCodeUrl} no codeUrl, ${skippedOptOut} reviewer opt-out`,
    );
    this.logger.log(
      `Total hours removed from Submission.approvedHours: ${totalHoursRemoved.toFixed(2)}h`,
    );
    this.logger.log(`Projects needing refresh: ${projectsToRefresh.size}`);

    // Refresh Project.approvedHours to the latest approved submission's stored
    // value for each affected project. Matches the live syncProjectData
    // semantic (latest-wins, not summed).
    let projectsUpdated = 0;
    for (const projectId of projectsToRefresh) {
      const latest = await this.prisma.submission.findFirst({
        where: { projectId, approvalStatus: 'approved' },
        orderBy: { createdAt: 'desc' },
        select: { approvedHours: true },
      });
      if (!latest) continue;
      const project = await this.prisma.project.findUnique({
        where: { projectId },
        select: { approvedHours: true },
      });
      const next = latest.approvedHours ?? 0;
      if (project?.approvedHours === next) continue;
      this.logger.log(
        `project ${projectId}: ${(project?.approvedHours ?? 0).toFixed(2)}h → ${next.toFixed(2)}h`,
      );
      projectsUpdated++;
      if (!dryRun) {
        await this.prisma.project.update({
          where: { projectId },
          data: { approvedHours: next },
        });
      }
    }
    this.logger.log(`Project.approvedHours updated: ${projectsUpdated}`);

    if (dryRun) {
      this.logger.log(
        'Dry-run complete. Set BACKFILL_DEDUPE_APPROVED_HOURS=apply and restart to commit.',
      );
    } else {
      this.logger.log(
        'Backfill applied. UNSET BACKFILL_DEDUPE_APPROVED_HOURS before the next restart — re-running will dedupe again.',
      );
    }
  }

  private async reviewerOptedOutOfDedupe(
    submissionId: number,
  ): Promise<boolean> {
    const lastReview = await this.prisma.submissionAuditLog.findFirst({
      where: { submissionId, action: 'review' },
      orderBy: { createdAt: 'desc' },
      select: { changes: true },
    });
    if (!lastReview?.changes) return false;
    const changes = lastReview.changes as Record<string, unknown>;
    return changes.ignorePriorYswsCredit === true;
  }
}
