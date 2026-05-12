import * as dotenv from 'dotenv';
import * as path from 'path';

// Load backend/.env before anything that reads process.env.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { fetchSpans, secondsPerLocalDay, type Span } from './spans';

const API_KEY = process.env.HACKATIME_API_KEY || '';
const HACKATIME_ACCOUNT = '100';
const HORIZONS_USER_ID = 1;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Integration test for the Hackatime spans fetcher and per-local-day bucketing.
 * Hits the real Hackatime API — run manually, not in CI.
 *
 * Usage:
 *   pnpm --filter backend test spans.integration --runInBand
 *
 * Requires HACKATIME_API_KEY in backend/.env. Fetches the last 7 UTC days for
 * hackatime user 100 (horizons user 1) and verifies span shape, bucket totals,
 * and that UTC vs NYC tz bucketing preserve total seconds.
 */
describe('Hackatime spans (integration)', () => {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  let spans: Span[] = [];

  beforeAll(async () => {
    if (!API_KEY) {
      throw new Error('Missing HACKATIME_API_KEY in backend/.env');
    }
    spans = await fetchSpans({
      hackatimeAccount: HACKATIME_ACCOUNT,
      apiKey: API_KEY,
      startDateYmd: ymd(sevenDaysAgo),
      endDateYmd: ymd(now),
      projectNames: [],
      timeoutMs: 30_000,
    });
    console.log(
      `Fetched ${spans.length} spans for hackatime user ${HACKATIME_ACCOUNT} ` +
        `(horizons user ${HORIZONS_USER_ID}) from ${ymd(sevenDaysAgo)} to ${ymd(now)}`,
    );
  }, 35_000);

  it('returns a well-formed Span array', () => {
    expect(Array.isArray(spans)).toBe(true);
    for (const s of spans) {
      expect(typeof s.start).toBe('number');
      expect(typeof s.end).toBe('number');
      expect(s.end).toBeGreaterThan(s.start);
    }
    if (spans.length > 0) {
      const projects = new Set(
        spans.map((s) => s.project).filter((p): p is string => !!p),
      );
      console.log(`Distinct projects: ${Array.from(projects).join(', ') || '(none labeled)'}`);
      console.log('Sample span:', spans[0]);
    }
  });

  it('buckets into UTC per-day totals that fit inside the window', () => {
    const buckets = secondsPerLocalDay(spans, 'UTC');
    console.log('UTC per-day totals:');
    for (const [day, sec] of [...buckets].sort()) {
      console.log(`  ${day}: ${Math.round(sec / 60)} min`);
    }
    const totalSec = [...buckets.values()].reduce((a, b) => a + b, 0);
    const windowSec = (now.getTime() - sevenDaysAgo.getTime()) / 1000;
    expect(totalSec).toBeLessThanOrEqual(windowSec);
  });

  it('preserves total seconds across timezones (only attribution shifts)', () => {
    const utcTotal = [...secondsPerLocalDay(spans, 'UTC').values()].reduce(
      (a, b) => a + b,
      0,
    );
    const nyBuckets = secondsPerLocalDay(spans, 'America/New_York');
    const nyTotal = [...nyBuckets.values()].reduce((a, b) => a + b, 0);

    // Same union of intervals → same total seconds, regardless of tz used to
    // split them at local-midnight boundaries.
    expect(Math.abs(utcTotal - nyTotal)).toBeLessThanOrEqual(1);

    console.log('NYC per-day totals:');
    for (const [day, sec] of [...nyBuckets].sort()) {
      console.log(`  ${day}: ${Math.round(sec / 60)} min`);
    }
  });
});
