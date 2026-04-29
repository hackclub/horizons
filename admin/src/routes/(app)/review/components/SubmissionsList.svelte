<script lang="ts">
	import type { components } from '$lib/api';
	import { timeAgo } from '../utils';

	type SubmissionSummary = components['schemas']['ProjectSubmissionSummary'];

	interface Props {
		submissions: SubmissionSummary[];
		activeSubmissionId: number;
		onSelect: (submissionId: number) => void;
	}

	let { submissions, activeSubmissionId, onSelect }: Props = $props();

	function statusLabel(s: SubmissionSummary): string {
		if (s.reviewPassed === true) return 'Approved';
		if (s.reviewPassed === false) return 'Rejected';
		if (s.approvalStatus === 'approved') return 'Approved';
		if (s.approvalStatus === 'rejected') return 'Rejected';
		return 'Pending';
	}
	function statusClass(s: SubmissionSummary): string {
		const label = statusLabel(s);
		if (label === 'Approved') return 'bg-rv-green/15 text-rv-green';
		if (label === 'Rejected') return 'bg-rv-red/15 text-rv-red';
		return 'bg-rv-surface2 text-rv-dim';
	}
</script>

<div class="p-4">
	<h3 class="text-[11px] uppercase tracking-wider text-rv-dim font-semibold mb-2">
		Submissions <span class="text-rv-text/60 font-normal normal-case ml-1">({submissions.length})</span>
	</h3>
	<div class="flex flex-col gap-1.5">
		{#each submissions as s, i (s.submissionId)}
			{@const isActive = s.submissionId === activeSubmissionId}
			<button
				class="flex flex-col gap-1 px-2.5 py-2 rounded-md border text-left font-inherit cursor-pointer transition-all duration-150 {isActive ? 'bg-rv-surface2 border-rv-accent' : 'bg-rv-surface border-rv-border hover:border-rv-accent'}"
				onclick={() => onSelect(s.submissionId)}
			>
				<div class="flex items-center justify-between gap-2">
					<span class="text-[12px] font-semibold text-rv-text">
						{i === 0 ? 'Latest' : `#${submissions.length - i}`}
					</span>
					<span class="py-0.5 px-2 rounded-xl text-[10px] font-semibold {statusClass(s)}">
						{statusLabel(s)}
					</span>
				</div>
				<div class="flex items-center justify-between gap-2 text-[11px] text-rv-dim">
					<span>{timeAgo(s.createdAt)}</span>
					{#if s.hackatimeHours != null}
						<span class="font-[Space_Mono,monospace]">{s.hackatimeHours.toFixed(1)}h</span>
					{/if}
				</div>
			</button>
		{/each}
	</div>
</div>
