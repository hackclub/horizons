import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AirtableService } from './airtable.service';

@Injectable()
export class AirtableBackfillService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private airtableService: AirtableService,
  ) {}

  onModuleInit() {
    if (process.env.RUN_AIRTABLE_USERS_BACKFILL !== 'true') {
      return;
    }

    console.log('[AirtableBackfill] Starting user backfill in background...');
    this.run()
      .then(() =>
        console.log(
          '[AirtableBackfill] Backfill complete. You can now remove RUN_AIRTABLE_USERS_BACKFILL.',
        ),
      )
      .catch((error) =>
        console.error('[AirtableBackfill] Backfill failed:', error),
      );
  }

  private async run() {
    const users = await this.prisma.user.findMany({
      select: {
        userId: true,
        email: true,
        createdAt: true,
        projects: {
          select: {
            createdAt: true,
            submissions: {
              select: { createdAt: true },
              orderBy: { createdAt: 'asc' as const },
              take: 1,
            },
          },
          orderBy: { createdAt: 'asc' as const },
        },
      },
    });

    console.log(`[AirtableBackfill] Processing ${users.length} users...`);

    let synced = 0;
    const skipped = 0;
    let failed = 0;

    for (const user of users) {
      try {
        await this.airtableService.syncUserEvent(
          user.email,
          user.userId,
          'signUp',
          this.toDateString(user.createdAt),
        );

        const firstProject = user.projects[0];
        if (firstProject) {
          await this.airtableService.syncUserEvent(
            user.email,
            user.userId,
            'firstProjectCreated',
            this.toDateString(firstProject.createdAt),
          );
        }

        let earliestSubmission: Date | null = null;
        for (const project of user.projects) {
          if (project.submissions.length > 0) {
            const date = project.submissions[0].createdAt;
            if (!earliestSubmission || date < earliestSubmission) {
              earliestSubmission = date;
            }
          }
        }
        if (earliestSubmission) {
          await this.airtableService.syncUserEvent(
            user.email,
            user.userId,
            'firstSubmit',
            this.toDateString(earliestSubmission),
          );
        }

        synced++;
      } catch (error) {
        console.error(`[AirtableBackfill] Failed for ${user.email}:`, error);
        failed++;
      }

      // Rate limit: Airtable allows 5 req/s, each user makes up to 3 requests
      await this.sleep(700);
    }

    console.log(
      `[AirtableBackfill] Done. Synced: ${synced}, Failed: ${failed}, Skipped: ${skipped}`,
    );
  }

  private toDateString(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
