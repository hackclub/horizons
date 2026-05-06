<script lang="ts">
	import { Skeleton } from '$lib/components';

	type Props = {
		label: string;
		value?: string | number;
		valueClass?: string;
		sublabel?: string | null;
		loading?: boolean;
	};

	let {
		label,
		value,
		valueClass = 'text-rv-text',
		sublabel = null,
		loading = false,
	}: Props = $props();
</script>

<div class="bg-rv-surface border border-rv-border rounded-lg p-4">
	<div class="text-[11px] text-rv-dim uppercase tracking-wide mb-1">{label}</div>
	{#if loading}
		<Skeleton class="h-7 w-20" />
		{#if sublabel !== null}
			<Skeleton class="h-3 w-32 mt-1" />
		{/if}
	{:else}
		<div class="text-xl font-bold {valueClass}">{value}</div>
		{#if sublabel}
			<div class="text-[10px] text-rv-dim mt-0.5">{sublabel}</div>
		{/if}
	{/if}
</div>
