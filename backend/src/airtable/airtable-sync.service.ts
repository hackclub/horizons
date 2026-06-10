import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AirtableService } from './airtable.service';

/**
 * Daily sweep of the Users table. The per-event hooks in
 * AirtableService.syncUserStats keep things fresh in normal flow, but stats
 * also drift via paths that don't trigger a sync (Hackatime recalc, manual
 * project edits). This cron walks every user with an Airtable record and
 * rewrites the four computed fields.
 *
 * Also hosts the hourly Transactions sweep: live hooks mirror each
 * transaction on create/fulfill/refund, and syncAllTransactions backfills
 * any row whose airtableRecId is still null.
 */
@Injectable()
export class AirtableSyncService implements OnModuleInit {
  private readonly logger = new Logger(AirtableSyncService.name);

  constructor(private airtableService: AirtableService) {}

  onModuleInit() {
    // Fire-and-forget so startup isn't blocked by a full table sweep.
    this.runSync('startup').catch((err) =>
      this.logger.error('Startup Airtable user-stats sync threw:', err),
    );
    this.runTransactionSync('startup').catch((err) =>
      this.logger.error('Startup Airtable transaction sync threw:', err),
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyUserStatsSync() {
    await this.runSync('daily');
  }

  // Catch-up for transactions whose live sync failed (plus the one-time
  // backfill on first deploy). Cheap no-op query when nothing is pending, so
  // running every 10 minutes keeps Airtable from lagging behind.
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleTransactionSync() {
    await this.runTransactionSync('interval');
  }

  private async runSync(trigger: 'startup' | 'daily') {
    this.logger.log(`Starting ${trigger} Airtable user-stats sync`);
    try {
      const result = await this.airtableService.syncAllUserStats();
      this.logger.log(
        `${trigger} Airtable user-stats sync complete: ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed`,
      );
    } catch (err) {
      this.logger.error(`${trigger} Airtable user-stats sync threw:`, err);
    }
  }

  private async runTransactionSync(trigger: 'startup' | 'interval') {
    this.logger.log(`Starting ${trigger} Airtable transaction sync`);
    try {
      const result = await this.airtableService.syncAllTransactions();
      this.logger.log(
        `${trigger} Airtable transaction sync complete: ${result.created} created, ${result.failed} failed`,
      );
    } catch (err) {
      this.logger.error(`${trigger} Airtable transaction sync threw:`, err);
    }
  }
}
