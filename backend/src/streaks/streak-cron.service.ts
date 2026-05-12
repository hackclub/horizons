import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { StreakService } from './streak.service';

const BATCH_SIZE = 20;

@Injectable()
export class StreakCronService {
  private readonly logger = new Logger(StreakCronService.name);

  constructor(
    private prisma: PrismaService,
    private streakService: StreakService,
  ) {}

  /**
   * Hourly recognition + close-of-day pass. For every user with a linked
   * Hackatime account and at least one project, re-fetches today's and
   * yesterday's spans, refreshes the high-watermark UserDailyActivity rows,
   * and bumps `currentStreak` if today's local-day total crossed 1 hour.
   *
   * Running every hour (not just at user-local midnight) gives "recognize
   * today's streak the moment it crosses the threshold" semantics, and
   * makes every hour a retry surface — a single failed Hackatime call is
   * corrected automatically by the next tick.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async hourlySync(): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: {
        hackatimeAccount: { not: null },
        projects: { some: { nowHackatimeProjects: { isEmpty: false } } },
      },
      select: { userId: true },
    });

    if (users.length === 0) return;
    this.logger.log(`Hourly streak sync: ${users.length} users`);

    let ok = 0;
    let failed = 0;
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((u) => this.streakService.syncUserStreak(u.userId)),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') ok++;
        else failed++;
      }
    }
    this.logger.log(`Hourly streak sync done: ${ok} ok, ${failed} failed`);
  }
}
