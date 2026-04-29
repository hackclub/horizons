<script lang="ts">
	import { type components } from '$lib/api';
	import { timeAgo } from '../utils';

	type ClaimInfo = components['schemas']['ClaimInfoResponse'];

	interface Props {
		claim: ClaimInfo;
		// Called when the reviewer chooses to back out (e.g. return to queue).
		onCancel: () => void;
		// Called when the reviewer chooses to take over the claim. The parent
		// is responsible for actually firing the force-claim request.
		onTakeover: () => void;
		taking?: boolean;
	}

	let { claim, onCancel, onTakeover, taking = false }: Props = $props();

	let initials = $derived(
		`${claim.firstName.charAt(0)}${claim.lastName.charAt(0)}`.toUpperCase(),
	);
</script>

<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
	role="dialog"
	aria-modal="true"
	aria-labelledby="claim-conflict-title"
>
	<div class="bg-rv-surface border border-rv-border rounded-xl shadow-xl max-w-[440px] w-[90%] p-6">
		<div class="flex items-start gap-3 mb-4">
			<div class="w-10 h-10 rounded-full bg-rv-tag-bg text-rv-accent flex items-center justify-center font-semibold text-sm shrink-0">
				{initials}
			</div>
			<div class="flex-1">
				<h2 id="claim-conflict-title" class="text-base font-semibold text-rv-text m-0 mb-1">
					Already being reviewed
				</h2>
				<p class="text-[13px] text-rv-dim m-0 leading-relaxed">
					<span class="text-rv-text font-medium">{claim.firstName} {claim.lastName}</span>
					opened this submission {timeAgo(claim.claimedAt)}.
					Last activity {timeAgo(claim.heartbeatAt)}.
				</p>
			</div>
		</div>

		<p class="text-[13px] text-rv-dim mb-5 leading-relaxed">
			Continuing will take over the review and end their session for this project.
			Coordinate with them first to avoid duplicate work.
		</p>

		<div class="flex gap-2 justify-end">
			<button
				class="px-4 py-2 rounded-md text-[13px] font-semibold font-inherit cursor-pointer border border-rv-border bg-transparent text-rv-dim hover:text-rv-text hover:border-rv-accent disabled:opacity-50 disabled:cursor-not-allowed"
				onclick={onCancel}
				disabled={taking}
			>
				Back to Queue
			</button>
			<button
				class="px-4 py-2 rounded-md text-[13px] font-semibold font-inherit cursor-pointer border border-rv-red bg-rv-red text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
				onclick={onTakeover}
				disabled={taking}
			>
				{taking ? 'Taking over...' : 'Take Over'}
			</button>
		</div>
	</div>
</div>
