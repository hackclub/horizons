import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ManifestService } from './manifest.service';

@Injectable()
export class ManifestBackfillService implements OnModuleInit {
  private readonly logger = new Logger(ManifestBackfillService.name);

  constructor(
    private prisma: PrismaService,
    private manifest: ManifestService,
  ) {}

  onModuleInit() {
    if (process.env.RUN_MANIFEST_BACKFILL !== 'true') {
      return;
    }

    if (!this.manifest.isEnabled()) {
      this.logger.warn(
        'Backfill requested but Manifest is not configured — skipping',
      );
      return;
    }

    this.logger.log('Starting Manifest backfill in background...');
    this.run()
      .then(() =>
        this.logger.log(
          'Backfill complete. You can now remove RUN_MANIFEST_BACKFILL.',
        ),
      )
      .catch((error) => this.logger.error('Backfill failed:', error));
  }

  private async run() {
    const projects = await this.prisma.project.findMany({
      where: {
        repoUrl: { not: null },
      },
      select: {
        projectId: true,
        repoUrl: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    this.logger.log(`Drafting ${projects.length} projects to Manifest...`);

    let drafted = 0;
    let failed = 0;

    for (const project of projects) {
      if (!project.repoUrl) continue;

      const result = await this.manifest.createDraft(project.repoUrl);
      if (result) {
        drafted++;
      } else {
        failed++;
        this.logger.warn(
          `Failed to draft project ${project.projectId} (${project.repoUrl})`,
        );
      }

      // Rate-limit so we don't hammer the Manifest service.
      await this.sleep(200);
    }

    this.logger.log(`Done. Drafted: ${drafted}, Failed: ${failed}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
