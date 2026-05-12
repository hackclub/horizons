import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { fetchSpans, localDateOf, secondsPerLocalDay } from './spans';

const DAY_MS = 24 * 60 * 60 * 1000;
const QUALIFY_SECONDS = 3600;
const REFRESH_COOLDOWN_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

export interface SyncResult {
  currentStreak: number;
  longestStreak: number;
  todaySeconds: number;
  yesterdaySeconds: number;
}

@Injectable()
export class StreakService {
  private readonly logger = new Logger(StreakService.name);
  private readonly lastRefreshAt = new Map<number, number>();

  constructor(private prisma: PrismaService) {}

  /**
   * Read-time decay. `lastActiveDate` is a calendar date in the user's local
   * timezone; if it's older than yesterday-in-tz the displayed streak is 0.
   * Persisted row isn't mutated — next qualifying sync writes a fresh row,
   * and the next `extendStreakTo` resets the count from 1.
   *
   * `timezone` is optional for backwards compatibility with old callers and
   * tests; falls back to UTC, which matches pre-spans behavior.
   */
  applyLazyDecay(user: {
    currentStreak: number;
    lastActiveDate: Date | null;
    timezone?: string | null;
  }): number {
    if (!user.currentStreak || !user.lastActiveDate) return user.currentStreak;
    const tz = user.timezone ?? 'UTC';
    const todayLocal = localDateOf(Math.floor(Date.now() / 1000), tz);
    const yesterdayLocal = shiftYmd(todayLocal, -1);
    const lastYmd = dateToYmd(user.lastActiveDate);
    if (lastYmd < yesterdayLocal) return 0;
    return user.currentStreak;
  }

  /**
   * Fetch `/heartbeats/spans` from Hackatime, bucket by user-local timezone,
   * upsert today and yesterday's local-day rows as high-watermarks, and
   * extend the streak if today (or yesterday's late-arriving heartbeats)
   * crosses 1 hour.
   *
   * Re-querying both days every hour is the self-heal: a single failed
   * fetch is corrected by the next hourly tick, and the high-watermark
   * means a transient downward Hackatime drift can't erode a day that
   * previously qualified.
   *
   * Returns the post-sync streak numbers (with lazy decay applied) so the
   * controller can hand them straight back to the caller.
   */
  async syncUserStreak(userId: number): Promise<SyncResult> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        hackatimeAccount: true,
        timezone: true,
        currentStreak: true,
        longestStreak: true,
        lastActiveDate: true,
        projects: {
          where: { nowHackatimeProjects: { isEmpty: false } },
          select: { nowHackatimeProjects: true },
        },
      },
    });
    if (!user) {
      return { currentStreak: 0, longestStreak: 0, todaySeconds: 0, yesterdaySeconds: 0 };
    }

    const tz = user.timezone ?? 'UTC';
    const baseResult: SyncResult = {
      currentStreak: this.applyLazyDecay({
        currentStreak: user.currentStreak,
        lastActiveDate: user.lastActiveDate,
        timezone: tz,
      }),
      longestStreak: user.longestStreak,
      todaySeconds: 0,
      yesterdaySeconds: 0,
    };

    if (!user.hackatimeAccount) return baseResult;
    const linkedNames = dedupe(
      user.projects.flatMap((p) => p.nowHackatimeProjects ?? []),
    );
    if (linkedNames.length === 0) return baseResult;

    const apiKey = process.env.HACKATIME_API_KEY;
    if (!apiKey) {
      this.logger.warn('HACKATIME_API_KEY not set, skipping sync');
      return baseResult;
    }

    const todayLocal = localDateOf(Math.floor(Date.now() / 1000), tz);
    const yesterdayLocal = shiftYmd(todayLocal, -1);

    // Overshoot the UTC window by a day on each side so spans straddling
    // the local-day boundaries are captured. The bucketer attributes each
    // second to the correct local day; spans outside the {yesterday,today}
    // window simply don't land in those buckets.
    const spans = await fetchSpans({
      hackatimeAccount: user.hackatimeAccount,
      apiKey,
      startDateYmd: shiftYmd(yesterdayLocal, -1),
      endDateYmd: shiftYmd(todayLocal, 1),
      projectNames: linkedNames,
      timeoutMs: FETCH_TIMEOUT_MS,
    });

    const buckets = secondsPerLocalDay(spans, tz);
    const yesterdaySeconds = buckets.get(yesterdayLocal) ?? 0;
    const todaySeconds = buckets.get(todayLocal) ?? 0;

    // Process yesterday first so extendStreakTo's adjacency check sees a
    // consistent chain when both days newly qualify in the same sync.
    for (const day of [yesterdayLocal, todayLocal] as const) {
      const seconds = buckets.get(day) ?? 0;
      const { qualified } = await this.writeDailyActivityHighWatermark(
        userId,
        day,
        seconds,
      );
      if (qualified) await this.extendStreakTo(userId, day);
    }

    const updated = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        currentStreak: true,
        longestStreak: true,
        lastActiveDate: true,
        timezone: true,
      },
    });
    return {
      currentStreak: this.applyLazyDecay({
        currentStreak: updated?.currentStreak ?? 0,
        lastActiveDate: updated?.lastActiveDate ?? null,
        timezone: updated?.timezone ?? tz,
      }),
      longestStreak: updated?.longestStreak ?? 0,
      todaySeconds,
      yesterdaySeconds,
    };
  }

  /**
   * Rebuild a user's UserDailyActivity rows and streak counters from raw
   * Hackatime spans over a wide window. Clears rows in the window first so
   * the rebuild has clean-slate semantics (high-watermark upserts can't
   * decrease, which is wrong when fixing previously-misattributed days).
   *
   * Use this after the spans cutover to migrate from the old UTC-bucketed
   * rows. Safe to call repeatedly; it converges to whatever the current
   * Hackatime data says.
   */
  async backfillUserStreak(
    userId: number,
    fromYmd: string,
  ): Promise<{ daysWritten: number }> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        hackatimeAccount: true,
        timezone: true,
        longestStreak: true,
        projects: {
          where: { nowHackatimeProjects: { isEmpty: false } },
          select: { nowHackatimeProjects: true },
        },
      },
    });
    if (!user?.hackatimeAccount) return { daysWritten: 0 };
    const linkedNames = dedupe(
      user.projects.flatMap((p) => p.nowHackatimeProjects ?? []),
    );
    if (linkedNames.length === 0) return { daysWritten: 0 };

    const apiKey = process.env.HACKATIME_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        `HACKATIME_API_KEY not set, skipping backfill for user ${userId}`,
      );
      return { daysWritten: 0 };
    }

    const tz = user.timezone ?? 'UTC';
    const todayLocal = localDateOf(Math.floor(Date.now() / 1000), tz);

    const spans = await fetchSpans({
      hackatimeAccount: user.hackatimeAccount,
      apiKey,
      startDateYmd: shiftYmd(fromYmd, -1),
      endDateYmd: shiftYmd(todayLocal, 1),
      projectNames: linkedNames,
      timeoutMs: 60_000,
    });

    const buckets = secondsPerLocalDay(spans, tz);

    // Clear the window so misattributed legacy rows can't survive the rebuild.
    await this.prisma.userDailyActivity.deleteMany({
      where: { userId, localDate: { gte: ymdToDate(fromYmd) } },
    });

    let daysWritten = 0;
    for (const [day, seconds] of buckets) {
      if (day < fromYmd || day > todayLocal) continue;
      if (seconds < QUALIFY_SECONDS) continue;
      await this.prisma.userDailyActivity.create({
        data: {
          userId,
          localDate: ymdToDate(day),
          seconds: Math.floor(seconds),
          qualified: true,
        },
      });
      daysWritten++;
    }

    await this.recomputeStreakFromHistory(userId);
    return { daysWritten };
  }

  /**
   * Drive backfillUserStreak across every user with linked Hackatime projects.
   * Used after the spans cutover to migrate historical UserDailyActivity rows
   * from the old UTC-bucketed shape. Backfills are sequential (not parallel)
   * so we don't fan out enough Hackatime calls to trip a rate limit on a
   * full-program rebuild.
   */
  async backfillAllUsers(fromYmd: string): Promise<{
    fromDate: string;
    usersProcessed: number;
    totalDaysWritten: number;
    results: Array<{ userId: number; daysWritten: number; error?: string }>;
  }> {
    const users = await this.prisma.user.findMany({
      where: {
        hackatimeAccount: { not: null },
        projects: { some: { nowHackatimeProjects: { isEmpty: false } } },
      },
      select: { userId: true },
    });

    const results: Array<{
      userId: number;
      daysWritten: number;
      error?: string;
    }> = [];
    let totalDaysWritten = 0;
    for (const { userId } of users) {
      try {
        const { daysWritten } = await this.backfillUserStreak(userId, fromYmd);
        results.push({ userId, daysWritten });
        totalDaysWritten += daysWritten;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Backfill failed for user ${userId}: ${msg}`);
        results.push({ userId, daysWritten: 0, error: msg });
      }
    }
    return {
      fromDate: fromYmd,
      usersProcessed: users.length,
      totalDaysWritten,
      results,
    };
  }

  /**
   * Idempotent state machine for moving the streak forward to a known
   * qualifying local day `T`.
   *
   *   L (lastActiveDate)         T (target qualifying day)
   *   ─────────────────          ─────────────────────────
   *   null                       → reset to 1
   *   == T                       → no-op (already counted)
   *   >  T                       → no-op (don't reach into the past)
   *   == T - 1 day               → currentStreak += 1
   *   <  T - 1 day               → reset to 1 (gap, no freezes)
   */
  private async extendStreakTo(userId: number, T: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { currentStreak: true, longestStreak: true, lastActiveDate: true },
    });
    if (!user) return;

    const targetMs = ymdToDate(T).getTime();
    const L = user.lastActiveDate;

    let nextStreak: number;
    if (!L) {
      nextStreak = 1;
    } else {
      const lastMs = L.getTime();
      if (lastMs === targetMs) return;
      if (lastMs > targetMs) return;
      nextStreak =
        lastMs === targetMs - DAY_MS ? user.currentStreak + 1 : 1;
    }

    await this.prisma.user.update({
      where: { userId },
      data: {
        currentStreak: nextStreak,
        lastActiveDate: ymdToDate(T),
        longestStreak: Math.max(user.longestStreak, nextStreak),
      },
    });
  }

  /**
   * Upsert UserDailyActivity for (userId, localDate) using monotonic max:
   * stored seconds can only grow. Returns `qualified: true` iff the new
   * watermark crosses 1 hour, so the caller knows whether to extend.
   *
   * Skips write for sub-1h rows that don't yet have a row — saves churn on
   * idle days. Once a row exists, every observation flows through max() so
   * the watermark survives downward Hackatime drift.
   */
  private async writeDailyActivityHighWatermark(
    userId: number,
    ymd: string,
    incoming: number,
  ): Promise<{ qualified: boolean }> {
    const localDate = ymdToDate(ymd);
    const incomingInt = Math.max(0, Math.floor(incoming));

    const existing = await this.prisma.userDailyActivity.findUnique({
      where: { userId_localDate: { userId, localDate } },
      select: { seconds: true, qualified: true },
    });

    if (!existing) {
      if (incomingInt < QUALIFY_SECONDS) return { qualified: false };
      await this.prisma.userDailyActivity.create({
        data: {
          userId,
          localDate,
          seconds: incomingInt,
          qualified: true,
        },
      });
      return { qualified: true };
    }

    const newSeconds = Math.max(existing.seconds, incomingInt);
    const newQualified = newSeconds >= QUALIFY_SECONDS;
    if (existing.seconds === newSeconds && existing.qualified === newQualified) {
      return { qualified: newQualified };
    }

    await this.prisma.userDailyActivity.update({
      where: { userId_localDate: { userId, localDate } },
      data: { seconds: newSeconds, qualified: newQualified },
    });
    return { qualified: newQualified };
  }

  /**
   * Rebuild currentStreak / longestStreak / lastActiveDate from the
   * UserDailyActivity history. Walks every qualified row in chronological
   * order, tracks the running consecutive-run length, takes the max for
   * longestStreak, and uses the trailing run for currentStreak.
   */
  private async recomputeStreakFromHistory(userId: number): Promise<void> {
    const rows = await this.prisma.userDailyActivity.findMany({
      where: { userId, qualified: true },
      orderBy: { localDate: 'asc' },
      select: { localDate: true },
    });

    if (rows.length === 0) {
      await this.prisma.user.update({
        where: { userId },
        data: { currentStreak: 0, longestStreak: 0, lastActiveDate: null },
      });
      return;
    }

    let longest = 0;
    let run = 0;
    let prevMs: number | null = null;
    for (const r of rows) {
      const ms = r.localDate.getTime();
      if (prevMs === null || ms !== prevMs + DAY_MS) {
        run = 1;
      } else {
        run += 1;
      }
      if (run > longest) longest = run;
      prevMs = ms;
    }

    const lastActiveDate = rows[rows.length - 1].localDate;
    await this.prisma.user.update({
      where: { userId },
      data: {
        currentStreak: run,
        longestStreak: longest,
        lastActiveDate,
      },
    });
  }

  /**
   * Public refresh endpoint backing POST /api/streaks/refresh. Per-process
   * 30-min cooldown, and a fast-path that skips the fetch entirely if the
   * user is already qualified for today's local bucket (the streak can't
   * change again until tomorrow's local midnight).
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

    const tz = user.timezone ?? 'UTC';
    const todayLocal = localDateOf(Math.floor(Date.now() / 1000), tz);
    const alreadyCountedToday =
      user.lastActiveDate && dateToYmd(user.lastActiveDate) === todayLocal;

    const now = Date.now();
    const cooledDown =
      now - (this.lastRefreshAt.get(userId) ?? 0) >= REFRESH_COOLDOWN_MS;

    if (alreadyCountedToday || !cooledDown) {
      return {
        currentStreak: this.applyLazyDecay({
          currentStreak: user.currentStreak,
          lastActiveDate: user.lastActiveDate,
          timezone: tz,
        }),
        longestStreak: user.longestStreak,
        refreshed: false,
      };
    }

    this.lastRefreshAt.set(userId, now);
    try {
      const result = await this.syncUserStreak(userId);
      return {
        currentStreak: result.currentStreak,
        longestStreak: result.longestStreak,
        refreshed: true,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Refresh failed for user ${userId}: ${msg}`);
      return {
        currentStreak: this.applyLazyDecay({
          currentStreak: user.currentStreak,
          lastActiveDate: user.lastActiveDate,
          timezone: tz,
        }),
        longestStreak: user.longestStreak,
        refreshed: false,
      };
    }
  }

  /**
   * Top users by current streak. Pulls a larger pool than `limit`, applies
   * read-time decay using each user's timezone, drops users without a
   * Slack display name, then ranks. Excludes flagged accounts so the
   * public leaderboard can't be polluted.
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
        timezone: true,
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
          timezone: u.timezone,
        }),
      }))
      .filter((u) => u.currentStreak > 0)
      .sort((a, b) => b.currentStreak - a.currentStreak)
      .slice(0, limit);

    return decayed.map((u, i) => ({ rank: i + 1, ...u }));
  }
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function ymdToDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function dateToYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shiftYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const ts = Date.UTC(y, m - 1, d) + deltaDays * DAY_MS;
  const dt = new Date(ts);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
