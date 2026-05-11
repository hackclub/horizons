import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const QUALIFY_SECONDS = 3600;
const REFRESH_COOLDOWN_MS = 30 * 60 * 1000;

@Injectable()
export class StreakService {
  private readonly logger = new Logger(StreakService.name);
  private readonly lastRefreshAt = new Map<number, number>();

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
   * Idempotent. Skips entirely for non-qualifying days because nothing reads
   * non-qualified UserDailyActivity rows (walkConsecutiveDaysEndingAt filters
   * by qualified=true), and writing them generates dead-tuple churn that
   * triggers autovacuum on a hot read table. Side benefit: a previously
   * qualifying day can no longer be silently downgraded by a later sync that
   * reports lower seconds.
   */
  async recordDailyActivity(
    userId: number,
    localDate: Date,
    seconds: number,
  ): Promise<void> {
    if (seconds < QUALIFY_SECONDS) return;
    await this.prisma.userDailyActivity.upsert({
      where: { userId_localDate: { userId, localDate } },
      create: { userId, localDate, seconds, qualified: true },
      update: { seconds, qualified: true },
    });
    await this.recomputeStreak(userId, localDate);
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
   * Read-time decay. lastActiveDate is written in UTC-day buckets by the
   * snapshot cron (which fires at UTC midnight), so the decay rule is also
   * keyed on UTC days — comparing against local-tz "yesterday" would create
   * a phase mismatch where positive-offset users see a brief 0d window
   * every local morning before the cron catches up. The next qualifying
   * day's recordDailyActivity will overwrite cleanly.
   */
  applyLazyDecay(user: {
    currentStreak: number;
    lastActiveDate: Date | null;
  }): number {
    if (!user.currentStreak || !user.lastActiveDate) return user.currentStreak;
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    const yesterdayUtc = todayUtc.getTime() - DAY_MS;
    if (user.lastActiveDate.getTime() < yesterdayUtc) return 0;
    return user.currentStreak;
  }

  /**
   * Per-user on-demand refresh. Fetches today's UTC Hackatime activity for
   * the caller, sums seconds on their linked Hackatime projects, and
   * upserts a UserDailyActivity row so the streak reflects in-progress
   * coding without waiting for the next daily cron.
   *
   * Two short-circuits keep cost flat:
   *   - If today's local bucket already qualified, the streak number can't
   *     change until tomorrow's local midnight — return cached, skip the
   *     Hackatime call and all writes.
   *   - Otherwise enforce a 30-min per-user cooldown (per process). The
   *     qualifying boundary is 1h of activity, so 30-min spacing catches
   *     the crossover with comfortable headroom.
   */
  async refreshUserActivity(
    userId: number,
  ): Promise<{ currentStreak: number; longestStreak: number; refreshed: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        timezone: true,
        lastActiveDate: true,
        currentStreak: true,
        longestStreak: true,
      },
    });
    if (!user) return { currentStreak: 0, longestStreak: 0, refreshed: false };

    const todayUtcStart = new Date();
    todayUtcStart.setUTCHours(0, 0, 0, 0);
    const todayLocal = this.localDateForUtcDay(todayUtcStart, user.timezone);
    const alreadyCountedToday =
      user.lastActiveDate?.getTime() === todayLocal.getTime();

    const now = Date.now();
    const last = this.lastRefreshAt.get(userId) ?? 0;
    const cooledDown = now - last >= REFRESH_COOLDOWN_MS;

    let refreshed = false;
    if (!alreadyCountedToday && cooledDown) {
      this.lastRefreshAt.set(userId, now);
      refreshed = true;
      try {
        await this.fetchAndRecordToday(userId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Refresh failed for user ${userId}: ${msg}`);
      }
    }

    if (refreshed) {
      const updated = await this.prisma.user.findUnique({
        where: { userId },
        select: { currentStreak: true, longestStreak: true, lastActiveDate: true },
      });
      return {
        currentStreak: this.applyLazyDecay({
          currentStreak: updated?.currentStreak ?? 0,
          lastActiveDate: updated?.lastActiveDate ?? null,
        }),
        longestStreak: updated?.longestStreak ?? 0,
        refreshed: true,
      };
    }

    return {
      currentStreak: this.applyLazyDecay({
        currentStreak: user.currentStreak,
        lastActiveDate: user.lastActiveDate,
      }),
      longestStreak: user.longestStreak,
      refreshed: false,
    };
  }

  private async fetchAndRecordToday(userId: number): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        hackatimeAccount: true,
        timezone: true,
        projects: {
          where: { nowHackatimeProjects: { isEmpty: false } },
          select: { nowHackatimeProjects: true },
        },
      },
    });
    if (!user?.hackatimeAccount) return;
    const allowedNames = new Set(
      user.projects.flatMap((p) => p.nowHackatimeProjects),
    );
    if (allowedNames.size === 0) return;

    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const nextDay = new Date(dayStart);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const dateStr = dayStart.toISOString().split('T')[0];
    const endDateStr = nextDay.toISOString().split('T')[0];

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const apiKey = process.env.HACKATIME_API_KEY;
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const url = `https://hackatime.hackclub.com/api/v1/users/${user.hackatimeAccount}/stats?features=projects&start_date=${dateStr}&end_date=${endDateStr}`;
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return;
    const data = await response.json();
    const projects = data?.data?.projects;
    let userSeconds = 0;
    if (Array.isArray(projects)) {
      for (const p of projects) {
        if (p?.name && allowedNames.has(p.name)) {
          userSeconds +=
            typeof p?.total_seconds === 'number' ? p.total_seconds : 0;
        }
      }
    }
    const localDate = this.localDateForUtcDay(dayStart, user.timezone);
    await this.recordDailyActivity(userId, localDate, userSeconds);
  }

  /**
   * Top users by current streak. Pulls a larger pool than `limit`, applies
   * read-time decay, drops users without a Slack display name, then ranks.
   * Excludes flagged accounts so the public leaderboard can't be polluted.
   */
  async getLeaderboard(
    limit: number,
  ): Promise<
    Array<{ rank: number; displayName: string; currentStreak: number }>
  > {
    const pool = await this.prisma.user.findMany({
      where: {
        currentStreak: { gt: 0 },
        slackUsername: { not: null },
        isFraud: false,
        isSus: false,
      },
      select: {
        slackUsername: true,
        currentStreak: true,
        lastActiveDate: true,
      },
      orderBy: [
        { currentStreak: 'desc' },
        { lastActiveDate: 'desc' },
        { userId: 'asc' },
      ],
      take: Math.max(limit * 4, 30),
    });

    const decayed = pool
      .map((u) => ({
        displayName: u.slackUsername!,
        currentStreak: this.applyLazyDecay({
          currentStreak: u.currentStreak,
          lastActiveDate: u.lastActiveDate,
        }),
      }))
      .filter((u) => u.currentStreak > 0)
      .sort((a, b) => b.currentStreak - a.currentStreak)
      .slice(0, limit);

    return decayed.map((u, i) => ({ rank: i + 1, ...u }));
  }
}
