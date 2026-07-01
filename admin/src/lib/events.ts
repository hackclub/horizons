import type { components } from '$lib/api';

type EventResponse = components['schemas']['EventResponse'];

/**
 * Slug of the "most upcoming" event, used to seed default event filters in the
 * review and fraud-review galleries: the event that starts soonest from now,
 * or — once every event has already started — the most recently started one
 * (the likely current cohort). Returns null when there are no events with a
 * valid start date to choose from.
 */
export function mostUpcomingEventSlug(
	events: readonly EventResponse[],
	now: number = Date.now(),
): string | null {
	const withTime = events
		.map((e) => ({ slug: e.slug, start: new Date(e.startDate).getTime() }))
		.filter((e) => Number.isFinite(e.start));
	if (withTime.length === 0) return null;
	const upcoming = withTime
		.filter((e) => e.start >= now)
		.sort((a, b) => a.start - b.start);
	if (upcoming.length > 0) return upcoming[0].slug;
	// Every event has already started — fall back to the most recent one.
	return withTime.sort((a, b) => b.start - a.start)[0].slug;
}
