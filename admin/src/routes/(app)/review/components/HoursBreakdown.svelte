<script lang="ts">
	interface Props {
		/** Hours captured on the submission row at submit time. */
		submittedHours: number | null;
	}

	let { submittedHours }: Props = $props();
</script>

<div class="flex items-center gap-1.5 text-[13px] mb-0.5">
	<svg class="w-3.5 h-3.5 text-rv-dim shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
		<circle cx="12" cy="12" r="10" />
		<polyline points="12 6 12 12 16 14" />
	</svg>
	<strong>{(submittedHours ?? 0).toFixed(1)}h</strong>
	<span class="text-rv-dim text-[12px]">submitted</span>
</div>
