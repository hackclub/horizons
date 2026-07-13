// Cached accessors for the data shared between the review gallery and the
// per-project review page. The queue / past-reviews / fraud-rejected
// endpoints are the slowest in the backend, and previously every navigation
// between gallery and project refetched all of them from scratch.
//
// Verdict submissions and fraud refreshes must call the matching
// invalidate*() helper (or pass { fresh: true }) so reviewers never act on a
// queue that omits their own last action.

import { api } from '$lib/api';
import { cachedGet, invalidate } from '$lib/swr';

const QUEUE_KEY = 'reviewer:queue';
const PAST_REVIEWS_KEY = 'reviewer:past-reviews';
const FRAUD_REJECTED_KEY = 'reviewer:fraud-rejected';
const EVENTS_KEY = 'events';
const PRIORITY_QUEUE_KEY = 'admin:priority-queue';

export function getQueue(opts: { fresh?: boolean } = {}) {
	if (opts.fresh) invalidate(QUEUE_KEY);
	return cachedGet(
		QUEUE_KEY,
		async () => {
			const { data, error } = await api.GET('/api/reviewer/queue');
			if (error) throw new Error('Failed to fetch review queue');
			return data ?? [];
		},
		{ maxAgeMs: 60_000 },
	);
}

export function getPastReviews(opts: { fresh?: boolean } = {}) {
	if (opts.fresh) invalidate(PAST_REVIEWS_KEY);
	return cachedGet(
		PAST_REVIEWS_KEY,
		async () => {
			const { data } = await api.GET('/api/reviewer/past-reviews');
			return data ?? null;
		},
		{ maxAgeMs: 120_000 },
	);
}

export function getFraudRejected(opts: { fresh?: boolean } = {}) {
	if (opts.fresh) invalidate(FRAUD_REJECTED_KEY);
	return cachedGet(
		FRAUD_REJECTED_KEY,
		async () => {
			const { data } = await api.GET('/api/reviewer/fraud-rejected');
			return data ?? [];
		},
		{ maxAgeMs: 120_000 },
	);
}

export function getEvents() {
	return cachedGet(
		EVENTS_KEY,
		async () => {
			const { data } = await api.GET('/api/events');
			return data ?? [];
		},
		{ maxAgeMs: 300_000 },
	);
}

export function getPriorityQueue() {
	return cachedGet(
		PRIORITY_QUEUE_KEY,
		async () => {
			// Admin-only endpoint; reviewers get an error and an empty queue,
			// matching the previous per-page behavior.
			const { data } = await api.GET('/api/admin/priority-queue');
			return data ?? [];
		},
		{ maxAgeMs: 120_000 },
	);
}

/** Call after any verdict/skip/claim action that changes queue membership. */
export function invalidateReviewData() {
	invalidate(QUEUE_KEY);
	invalidate(PAST_REVIEWS_KEY);
	invalidate(FRAUD_REJECTED_KEY);
}
