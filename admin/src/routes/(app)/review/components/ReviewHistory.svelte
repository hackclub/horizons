<script lang="ts">
	import type { components } from '$lib/api';
	type TimelineEntry = components['schemas']['TimelineEntryResponse'];
	import { timeAgo, formatDate } from '../utils';
	import { Skeleton } from '$lib/components';

	interface Props {
		timeline: TimelineEntry[];
		loading?: boolean;
	}

	let { timeline, loading = false }: Props = $props();
</script>

<div class="px-4 py-3.5">
	<div class="text-[11px] uppercase tracking-[0.8px] text-rv-dim font-semibold mb-2.5">
		Review History
	</div>

	{#if loading}
		{#each Array(3) as _, i}
			{#if i > 0}
				<hr class="border-none border-t border-rv-divider my-1.5" />
			{/if}
			<div class="flex items-start gap-2 py-1.5">
				<Skeleton class="h-1.5 w-1.5 rounded-full mt-1.25 shrink-0" />
				<Skeleton class="h-3 flex-1" />
			</div>
		{/each}
	{:else if timeline.length === 0}
		<p class="text-[13px] text-rv-dim italic">No review history yet.</p>
	{:else}
		{#each timeline as event, index}
			{#if index > 0}
				<hr class="border-none border-t border-rv-divider my-1.5" />
			{/if}

			{#if event.type === 'submitted' || event.type === 'resubmitted'}
				<div class="flex items-start gap-2 py-1.5 text-[12px] text-rv-dim">
					<span
						class="w-1.5 h-1.5 rounded-full mt-1.25 shrink-0"
						class:bg-rv-blue={event.type === 'submitted'}
						class:bg-rv-accent={event.type === 'resubmitted'}
					></span>
					<span>
						{event.type === 'submitted' ? 'Submitted' : 'Re-submitted'} with
						<strong class="text-rv-text font-semibold">{event.hours ?? '?'}h</strong>
						<span class="border-b border-dotted border-rv-dim cursor-default" title={formatDate(event.timestamp)}>{timeAgo(event.timestamp)}</span>
					</span>
				</div>
			{:else if event.type === 'approved'}
				<div class="pb-2.5 last:pb-0">
					<span class="inline-block text-[10px] font-bold px-1.75 py-0.5 rounded mb-1 bg-rv-green-bg text-rv-green">
						&#10003; Approved
					</span>
					{#if event.approvedHours != null && event.submittedHours != null && event.approvedHours !== event.submittedHours}
						<span class="inline-block text-[10px] font-bold px-1.75 py-0.5 rounded mb-1 bg-[rgba(255,152,0,0.15)] text-[#ff9800]">
							{event.submittedHours}h &rarr; {event.approvedHours}h override
						</span>
					{/if}
					{#if event.userFeedback}
						<div class="text-[13px] leading-normal mt-1">{event.userFeedback}</div>
					{/if}
					<div class="text-[11px] text-rv-dim mt-1">
						reviewed by @{event.reviewerName} &middot;
						<span class="border-b border-dotted border-rv-dim cursor-default" title={formatDate(event.timestamp)}>{timeAgo(event.timestamp)}</span>
					</div>

					{#if event.hoursJustification}
						<div class="bg-[rgba(128,128,0,0.08)] border-l-[3px] border-rv-accent rounded-r-md px-3 py-2.5 mt-1.5">
							<div class="text-[10px] font-bold text-rv-accent uppercase tracking-[0.5px] mb-1">
								Hours Justification
							</div>
							<div class="text-[12px] leading-relaxed text-rv-text">
								{event.hoursJustification}
							</div>
						</div>
					{/if}
				</div>
			{:else if event.type === 'rejected'}
				<div class="pb-2.5 last:pb-0">
					<span class="inline-block text-[10px] font-bold px-1.75 py-0.5 rounded mb-1 bg-rv-red-bg text-rv-red">
						&#8635; Changes Needed
					</span>
					{#if event.userFeedback}
						<div class="text-[13px] leading-normal mt-1">{event.userFeedback}</div>
					{/if}
					<div class="text-[11px] text-rv-dim mt-1">
						reviewed by @{event.reviewerName} &middot;
						<span class="border-b border-dotted border-rv-dim cursor-default" title={formatDate(event.timestamp)}>{timeAgo(event.timestamp)}</span>
					</div>
				</div>
			{/if}
		{/each}
	{/if}
</div>
