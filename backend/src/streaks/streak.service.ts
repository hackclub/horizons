import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const QUALIFY_SECONDS = 3600;

@Injectable()
export class StreakService {
  private readonly logger = new Logger(StreakService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Returns YYYY-MM-DD in the given IANA timezone using the en-CA locale,
   * which formats reliably as ISO date.
   */
  private formatLocalDate(date: Date, tz: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  /**
   * Bucket a UTC day to the user's local date by anchoring on UTC noon of
   * that day. Boundary hours are slightly under-attributed in exchange for
   * a single Hackatime call per UTC day rather than two.
   */
  localDateForUtcDay(dayStart: Date, timezone: string | null): Date {
    const tz = timezone ?? 'UTC';
    const noon = new Date(dayStart.getTime() + 12 * 60 * 60 * 1000);
    const dateStr = this.formatLocalDate(noon, tz);
    return new Date(`${dateStr}T00:00:00.000Z`);
  }

  /**
   * Idempotent. Upserts the activity row, then recomputes streak when the
   * day qualifies (>= 1 hour).
   */
  async recordDailyActivity(
    userId: number,
    localDate: Date,
    seconds: number,
  ): Promise<void> {
    const qualified = seconds >= QUALIFY_SECONDS;
    await this.prisma.userDailyActivity.upsert({
      where: { userId_localDate: { userId, localDate } },
      create: { userId, localDate, seconds, qualified },
      update: { seconds, qualified },
    });
    if (qualified) {
      await this.recomputeStreak(userId, localDate);
    }
  }

  /**
   * Update currentStreak/longestStreak/lastActiveDate after a new qualifying
   * day D was recorded. Idempotent for D == lastActiveDate.
   */
  async recomputeStreak(userId: number, D: Date): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        lastActiveDate: true,
        currentStreak: true,
        longestStreak: true,
      },
    });
    if (!user) return;

    const L = user.lastActiveDate;
    const C = user.currentStreak;
    const M = user.longestStreak;
    const Dt = D.getTime();

    let nextStreak: number;
    let nextLast: Date;

    if (!L) {
      nextStreak = 1;
      nextLast = D;
    } else {
      const Lt = L.getTime();
      if (Dt === Lt) return;
      if (Dt === Lt + DAY_MS) {
        nextStreak = C + 1;
        nextLast = D;
      } else if (Dt > Lt + DAY_MS) {
        nextStreak = 1;
        nextLast = D;
      } else {
        // Backfilling an older day — recompute from history ending at L.
        nextStreak = await this.walkConsecutiveDaysEndingAt(userId, L);
        nextLast = L;
      }
    }

    await this.prisma.user.update({
      where: { userId },
      data: {
        currentStreak: nextStreak,
        longestStreak: Math.max(M, nextStreak),
        lastActiveDate: nextLast,
      },
    });
  }

  private async walkConsecutiveDaysEndingAt(
    userId: number,
    endDate: Date,
  ): Promise<number> {
    const rows = await this.prisma.userDailyActivity.findMany({
      where: { userId, qualified: true, localDate: { lte: endDate } },
      orderBy: { localDate: 'desc' },
      select: { localDate: true },
      take: 365,
    });
    if (rows.length === 0) return 0;
    if (rows[0].localDate.getTime() !== endDate.getTime()) return 0;

    let count = 1;
    let prev = rows[0].localDate.getTime();
    for (let i = 1; i < rows.length; i++) {
      const cur = rows[i].localDate.getTime();
      if (cur === prev - DAY_MS) {
        count++;
        prev = cur;
      } else {
        break;
      }
    }
    return count;
  }

  /**
   * Read-time decay: if the stored streak is more than one day stale in the
   * user's local timezone, return 0 without mutating the DB. The next
   * qualifying day's recordDailyActivity will overwrite cleanly.
   */
  applyLazyDecay(user: {
    currentStreak: number;
    lastActiveDate: Date | null;
    timezone: string | null;
  }): number {
    if (!user.currentStreak || !user.lastActiveDate) return user.currentStreak;
    const tz = user.timezone ?? 'UTC';
    const todayStr = this.formatLocalDate(new Date(), tz);
    const today = new Date(`${todayStr}T00:00:00.000Z`);
    const yesterday = today.getTime() - DAY_MS;
    if (user.lastActiveDate.getTime() < yesterday) return 0;
    return user.currentStreak;
  }
}
