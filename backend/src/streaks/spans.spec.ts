import {
  unionIntervals,
  localDateOf,
  localMidnightUnixSec,
  bucketSpansByLocalDay,
  secondsPerLocalDay,
} from './spans';

// 2026-05-10 is a Sunday in May; NYC is on EDT (UTC-4), Tokyo is UTC+9.
// Using a date well clear of DST boundaries so test math stays predictable.
const utcSec = (
  y: number,
  m: number,
  d: number,
  h = 0,
  mi = 0,
  s = 0,
): number => Date.UTC(y, m - 1, d, h, mi, s) / 1000;

describe('unionIntervals', () => {
  it('returns empty for empty input', () => {
    expect(unionIntervals([])).toEqual([]);
  });

  it('drops degenerate spans (end <= start)', () => {
    expect(
      unionIntervals([
        { start: 100, end: 100 },
        { start: 200, end: 150 },
      ]),
    ).toEqual([]);
  });

  it('passes through a single span', () => {
    expect(unionIntervals([{ start: 100, end: 200 }])).toEqual([
      { start: 100, end: 200 },
    ]);
  });

  it('sorts disjoint spans by start', () => {
    expect(
      unionIntervals([
        { start: 300, end: 400 },
        { start: 100, end: 200 },
      ]),
    ).toEqual([
      { start: 100, end: 200 },
      { start: 300, end: 400 },
    ]);
  });

  it('merges overlapping spans', () => {
    expect(
      unionIntervals([
        { start: 100, end: 200 },
        { start: 150, end: 250 },
      ]),
    ).toEqual([{ start: 100, end: 250 }]);
  });

  it('merges adjacent spans (end == next.start)', () => {
    expect(
      unionIntervals([
        { start: 100, end: 200 },
        { start: 200, end: 300 },
      ]),
    ).toEqual([{ start: 100, end: 300 }]);
  });

  it('merges a chain of three overlapping spans', () => {
    expect(
      unionIntervals([
        { start: 100, end: 200 },
        { start: 150, end: 250 },
        { start: 240, end: 350 },
      ]),
    ).toEqual([{ start: 100, end: 350 }]);
  });

  it('keeps unrelated spans separate while merging neighbors', () => {
    expect(
      unionIntervals([
        { start: 100, end: 200 },
        { start: 300, end: 400 },
        { start: 350, end: 500 },
      ]),
    ).toEqual([
      { start: 100, end: 200 },
      { start: 300, end: 500 },
    ]);
  });

  it('handles a fully-nested span', () => {
    expect(
      unionIntervals([
        { start: 100, end: 500 },
        { start: 200, end: 300 },
      ]),
    ).toEqual([{ start: 100, end: 500 }]);
  });

  it('does not mutate the input array', () => {
    const input = [
      { start: 300, end: 400 },
      { start: 100, end: 200 },
    ];
    unionIntervals(input);
    expect(input[0]).toEqual({ start: 300, end: 400 });
    expect(input[1]).toEqual({ start: 100, end: 200 });
  });
});

describe('localDateOf', () => {
  it('returns YYYY-MM-DD in UTC', () => {
    expect(localDateOf(utcSec(2026, 5, 10, 12), 'UTC')).toBe('2026-05-10');
  });

  it('returns same local day at UTC noon for NY (08:00 EDT)', () => {
    expect(localDateOf(utcSec(2026, 5, 10, 12), 'America/New_York')).toBe(
      '2026-05-10',
    );
  });

  it('rolls back across UTC midnight for negative offsets', () => {
    // 02:00 UTC = 22:00 prev-day EDT
    expect(localDateOf(utcSec(2026, 5, 10, 2), 'America/New_York')).toBe(
      '2026-05-09',
    );
  });

  it('rolls forward across UTC midnight for positive offsets', () => {
    // 20:00 UTC = 05:00 next-day JST
    expect(localDateOf(utcSec(2026, 5, 9, 20), 'Asia/Tokyo')).toBe(
      '2026-05-10',
    );
  });
});

describe('localMidnightUnixSec', () => {
  it('returns UTC midnight for UTC tz', () => {
    expect(localMidnightUnixSec('2026-05-10', 'UTC')).toBe(utcSec(2026, 5, 10));
  });

  it('returns 04:00 UTC for NYC midnight in May (EDT, UTC-4)', () => {
    expect(localMidnightUnixSec('2026-05-10', 'America/New_York')).toBe(
      utcSec(2026, 5, 10, 4),
    );
  });

  it('returns 05:00 UTC for NYC midnight in January (EST, UTC-5)', () => {
    expect(localMidnightUnixSec('2026-01-15', 'America/New_York')).toBe(
      utcSec(2026, 1, 15, 5),
    );
  });

  it('returns prev-day 15:00 UTC for Tokyo midnight (UTC+9)', () => {
    expect(localMidnightUnixSec('2026-05-10', 'Asia/Tokyo')).toBe(
      utcSec(2026, 5, 9, 15),
    );
  });
});

describe('bucketSpansByLocalDay', () => {
  it('attributes a within-day span entirely to that local day', () => {
    // 14:00-15:00 EDT = 18:00-19:00 UTC
    const buckets = bucketSpansByLocalDay(
      [{ start: utcSec(2026, 5, 10, 18), end: utcSec(2026, 5, 10, 19) }],
      'America/New_York',
    );
    expect(buckets.get('2026-05-10')).toBe(3600);
    expect(buckets.size).toBe(1);
  });

  it('splits a span crossing local midnight (evening coder, negative offset)', () => {
    // 23:00 EDT May 10 → 00:30 EDT May 11 = 03:00-04:30 UTC May 11
    const buckets = bucketSpansByLocalDay(
      [{ start: utcSec(2026, 5, 11, 3), end: utcSec(2026, 5, 11, 4, 30) }],
      'America/New_York',
    );
    expect(buckets.get('2026-05-10')).toBe(3600);
    expect(buckets.get('2026-05-11')).toBe(1800);
    expect(buckets.size).toBe(2);
  });

  it('splits at local midnight for positive offset', () => {
    // 23:00 JST May 9 → 01:00 JST May 10 = 14:00-16:00 UTC May 9
    const buckets = bucketSpansByLocalDay(
      [{ start: utcSec(2026, 5, 9, 14), end: utcSec(2026, 5, 9, 16) }],
      'Asia/Tokyo',
    );
    expect(buckets.get('2026-05-09')).toBe(3600);
    expect(buckets.get('2026-05-10')).toBe(3600);
  });

  it('accumulates multiple non-overlapping spans into the same bucket', () => {
    const buckets = bucketSpansByLocalDay(
      [
        { start: utcSec(2026, 5, 10, 10), end: utcSec(2026, 5, 10, 10, 30) },
        { start: utcSec(2026, 5, 10, 14), end: utcSec(2026, 5, 10, 14, 30) },
      ],
      'UTC',
    );
    expect(buckets.get('2026-05-10')).toBe(3600);
  });

  it('handles a span longer than 24h (three-day attribution)', () => {
    const buckets = bucketSpansByLocalDay(
      [{ start: utcSec(2026, 5, 10, 12), end: utcSec(2026, 5, 12, 12) }],
      'UTC',
    );
    expect(buckets.get('2026-05-10')).toBe(43200);
    expect(buckets.get('2026-05-11')).toBe(86400);
    expect(buckets.get('2026-05-12')).toBe(43200);
  });

  it('ignores degenerate spans', () => {
    const t = utcSec(2026, 5, 10, 12);
    expect(
      bucketSpansByLocalDay([{ start: t, end: t }], 'UTC').size,
    ).toBe(0);
  });

  it('handles a span starting exactly at local midnight', () => {
    // Exactly 04:00 UTC = 00:00 EDT May 10
    const buckets = bucketSpansByLocalDay(
      [{ start: utcSec(2026, 5, 10, 4), end: utcSec(2026, 5, 10, 5) }],
      'America/New_York',
    );
    expect(buckets.get('2026-05-10')).toBe(3600);
    expect(buckets.size).toBe(1);
  });
});

describe('secondsPerLocalDay', () => {
  it('dedupes fully-overlapping spans (different projects, same time)', () => {
    const start = utcSec(2026, 5, 10, 12);
    const buckets = secondsPerLocalDay(
      [
        { start, end: start + 1800, project: 'a' },
        { start, end: start + 1800, project: 'b' },
      ],
      'UTC',
    );
    expect(buckets.get('2026-05-10')).toBe(1800);
  });

  it('dedupes partial overlap (45m union from two 30m sessions)', () => {
    // a: 12:00-12:30, b: 12:15-12:45 → union 12:00-12:45 = 45m
    const start = utcSec(2026, 5, 10, 12);
    const buckets = secondsPerLocalDay(
      [
        { start, end: start + 1800 },
        { start: start + 900, end: start + 2700 },
      ],
      'UTC',
    );
    expect(buckets.get('2026-05-10')).toBe(2700);
  });

  it('dedupes across the midnight boundary', () => {
    // Two overlapping evening sessions in NYC: 22:00-00:30 and 23:00-01:00
    // Union: 22:00 May 10 → 01:00 May 11 (3h total)
    //   → 2h on May 10, 1h on May 11
    const buckets = secondsPerLocalDay(
      [
        { start: utcSec(2026, 5, 11, 2), end: utcSec(2026, 5, 11, 4, 30) },
        { start: utcSec(2026, 5, 11, 3), end: utcSec(2026, 5, 11, 5) },
      ],
      'America/New_York',
    );
    expect(buckets.get('2026-05-10')).toBe(7200);
    expect(buckets.get('2026-05-11')).toBe(3600);
  });
});
