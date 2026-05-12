const HACKATIME_BASE_URL = 'https://hackatime.hackclub.com';

export interface Span {
  start: number;
  end: number;
  project?: string;
}

/**
 * Merge overlapping or adjacent intervals into disjoint ranges. Run this
 * before per-day bucketing so a user logging the same minute on two linked
 * Hackatime projects isn't double-counted. Adjacent spans (end == next.start)
 * are merged since there's no gap of activity between them.
 */
export function unionIntervals(spans: Span[]): Span[] {
  const sorted = spans
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);
  if (sorted.length === 0) return [];

  const merged: Span[] = [{ start: sorted[0].start, end: sorted[0].end }];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push({ start: cur.start, end: cur.end });
    }
  }
  return merged;
}

/**
 * Returns YYYY-MM-DD in the given IANA timezone for a unix-seconds timestamp.
 */
export function localDateOf(unixSec: number, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(unixSec * 1000));
}

/**
 * Minutes that `tz` is offset from UTC at the given UTC instant. Positive
 * for east-of-UTC (Tokyo = +540), negative for west (NYC in summer = -240).
 * Handles DST implicitly by asking Intl for the wall-clock at the instant.
 */
function tzOffsetMinutesAt(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const part = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const localEpoch = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return Math.round((localEpoch - utcMs) / 60000);
}

/**
 * Unix-seconds timestamp for local midnight of `dateStr` (YYYY-MM-DD) in `tz`.
 *
 * Uses one offset-lookup iteration, which is correct as long as DST transitions
 * don't happen at exactly 00:00 local — standard IANA zones transition at
 * 02:00 or 03:00, so this holds. Spans straddling a transition day are still
 * second-accurate; only the wall-clock-to-unix mapping for midnight matters.
 */
export function localMidnightUnixSec(dateStr: string, tz: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offset = tzOffsetMinutesAt(naive, tz);
  return Math.round((naive - offset * 60000) / 1000);
}

function addDays(yyyymmdd: string, n: number): string {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const ts = Date.UTC(y, m - 1, d) + n * 86400000;
  const dt = new Date(ts);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Bucket coding-activity intervals into per-local-day second totals.
 *
 * Spans crossing local midnight are split at the boundary so every second is
 * attributed to the calendar day it occurred on in `tz`. Spans are NOT assumed
 * to be merged — pass them through `unionIntervals` first if overlap dedup
 * matters (or call `secondsPerLocalDay` which does both).
 */
export function bucketSpansByLocalDay(
  spans: Span[],
  tz: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const { start, end } of spans) {
    if (end <= start) continue;
    let cursor = start;
    while (cursor < end) {
      const day = localDateOf(cursor, tz);
      const nextMidnight = localMidnightUnixSec(addDays(day, 1), tz);
      const segEnd = Math.min(nextMidnight, end);
      out.set(day, (out.get(day) ?? 0) + (segEnd - cursor));
      cursor = segEnd;
    }
  }
  return out;
}

/**
 * Dedupe overlapping spans, then bucket into per-local-day totals. Standard
 * entry point for streak qualification — output keys are YYYY-MM-DD strings
 * in `tz`, values are integer seconds.
 */
export function secondsPerLocalDay(
  rawSpans: Span[],
  tz: string,
): Map<string, number> {
  return bucketSpansByLocalDay(unionIntervals(rawSpans), tz);
}

/**
 * Fetch coding-activity spans for a Hackatime user.
 *
 * `start_date`/`end_date` are interpreted by Hackatime as UTC days. To capture
 * an entire local day at any timezone offset, callers should overshoot by one
 * UTC day on each side; `bucketSpansByLocalDay` discards the spans that fall
 * outside the target local-day window.
 *
 * Returns `[]` on non-2xx, network error, timeout, or unexpected shape. The
 * streak system treats "no data" as "no change," and high-watermark storage
 * ensures a transient empty response can never erode a day that previously
 * qualified.
 */
export async function fetchSpans(opts: {
  hackatimeAccount: string;
  apiKey: string;
  startDateYmd: string;
  endDateYmd: string;
  projectNames: string[];
  timeoutMs?: number;
  baseUrl?: string;
}): Promise<Span[]> {
  const base = opts.baseUrl ?? HACKATIME_BASE_URL;
  const params = new URLSearchParams({
    start_date: opts.startDateYmd,
    end_date: opts.endDateYmd,
  });
  if (opts.projectNames.length > 0) {
    params.set('filter_by_project', opts.projectNames.join(','));
  }
  const url = `${base}/api/v1/users/${encodeURIComponent(
    opts.hackatimeAccount,
  )}/heartbeats/spans?${params.toString()}`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10000),
    });
  } catch {
    return [];
  }
  if (!resp.ok) return [];

  let data: unknown;
  try {
    data = await resp.json();
  } catch {
    return [];
  }
  const raw = (data as { spans?: unknown })?.spans;
  if (!Array.isArray(raw)) return [];
  // The live Hackatime API returns `{start_time, end_time, duration}` per
  // span, despite the OpenAPI spec describing `{start, end, project}`. Be
  // permissive and accept either, prefering `*_time` since that's what real
  // responses use. Project is absent on real responses — server-side
  // filter_by_project does the project-name selection for us.
  const out: Span[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const start = typeof r.start_time === 'number' ? r.start_time
      : typeof r.start === 'number' ? r.start
      : null;
    const end = typeof r.end_time === 'number' ? r.end_time
      : typeof r.end === 'number' ? r.end
      : null;
    if (start == null || end == null || end <= start) continue;
    out.push({
      start,
      end,
      project: typeof r.project === 'string' ? r.project : undefined,
    });
  }
  return out;
}
