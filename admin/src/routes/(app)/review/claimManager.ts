import { api, type components } from '$lib/api';

type ClaimInfo = components['schemas']['ClaimInfoResponse'];

// Frontend pings every 30s; backend treats >90s as stale. Three missed
// heartbeats before another reviewer can take over without prompting.
const HEARTBEAT_INTERVAL_MS = 30_000;

export interface ClaimManager {
	/**
	 * Acquire a claim on the submission. If another reviewer holds an active
	 * claim, calls `onConflict` with their info instead of claiming. Replaces
	 * any existing claim held by this manager (releases first).
	 */
	attach(
		submissionId: number,
		opts: { onConflict: (claim: ClaimInfo) => void },
	): Promise<void>;
	/** Force-claim, used after the user confirms takeover from the conflict modal. */
	takeover(submissionId: number): Promise<boolean>;
	/** Explicitly release whatever claim this manager currently holds. */
	release(): Promise<void>;
	/** Stop heartbeats and forget state without releasing on the server. */
	destroy(): void;
}

export function createClaimManager(): ClaimManager {
	let activeSubmissionId: number | null = null;
	let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	let onConflictHandler: ((claim: ClaimInfo) => void) | null = null;

	function stopHeartbeat() {
		if (heartbeatTimer) {
			clearInterval(heartbeatTimer);
			heartbeatTimer = null;
		}
	}

	function startHeartbeat(submissionId: number) {
		stopHeartbeat();
		heartbeatTimer = setInterval(async () => {
			try {
				const { data } = await api.POST('/api/reviewer/submissions/{id}/heartbeat', {
					params: { path: { id: submissionId } },
				});
				// We lost the claim — someone took over. Surface as a conflict so the
				// UI can warn instead of silently letting the reviewer keep typing.
				if (data && !data.claimed && data.claim && onConflictHandler) {
					stopHeartbeat();
					onConflictHandler(data.claim);
				}
			} catch {
				// Network blip — keep ticking; backend will go stale if we drop for real.
			}
		}, HEARTBEAT_INTERVAL_MS);
	}

	async function releaseInternal(submissionId: number) {
		try {
			await api.DELETE('/api/reviewer/submissions/{id}/claim', {
				params: { path: { id: submissionId } },
			});
		} catch {
			// Best-effort — stale timeout cleans up anyway.
		}
	}

	const manager: ClaimManager = {
		async attach(submissionId, { onConflict }) {
			if (activeSubmissionId !== null && activeSubmissionId !== submissionId) {
				const prior = activeSubmissionId;
				stopHeartbeat();
				activeSubmissionId = null;
				await releaseInternal(prior);
			}
			onConflictHandler = onConflict;
			activeSubmissionId = submissionId;
			const { data } = await api.POST('/api/reviewer/submissions/{id}/claim', {
				params: { path: { id: submissionId } },
				body: {},
			});
			if (!data) return;
			if (!data.claimed) {
				if (data.claim) onConflict(data.claim);
				return;
			}
			startHeartbeat(submissionId);
		},
		async takeover(submissionId) {
			activeSubmissionId = submissionId;
			const { data } = await api.POST('/api/reviewer/submissions/{id}/claim', {
				params: { path: { id: submissionId } },
				body: { force: true },
			});
			if (data?.claimed) {
				startHeartbeat(submissionId);
				return true;
			}
			return false;
		},
		async release() {
			stopHeartbeat();
			const id = activeSubmissionId;
			activeSubmissionId = null;
			if (id !== null) {
				await releaseInternal(id);
			}
		},
		destroy() {
			stopHeartbeat();
			activeSubmissionId = null;
			onConflictHandler = null;
		},
	};

	return manager;
}
