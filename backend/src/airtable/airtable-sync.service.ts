import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AirtableService } from './airtable.service';

/**
 * Daily sweep of the Users table. The per-event hooks in
 * AirtableService.syncUserStats keep things fresh in normal flow, but stats
 * also drift via paths that don't trigger a sync (Hackatime recalc, manual
 * project edits). This cron walks every user with an Airtable record and
 * rewrites the four computed fields.
 */
@Injectable()
export class AirtableSyncService {
  private readonly logger = new Logger(AirtableSyncService.name);

  constructor(private airtableService: AirtableService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyUserStatsSync() {
    this.logger.log('Starting daily Airtable user-stats sync');
    try {
      const result = await this.airtableService.syncAllUserStats();
      this.logger.log(
        `Daily Airtable user-stats sync complete: ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed`,
      );
    } catch (err) {
      this.logger.error('Daily Airtable user-stats sync threw:', err);
    }
  }
}
