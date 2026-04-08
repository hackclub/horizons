<script lang="ts">
	type TabItem = {
		label: string;
		value: string;
	};

	type Props = {
		items: TabItem[];
		value?: string;
		onchange?: (value: string) => void;
		variant?: 'default' | 'approve-reject';
		class?: string;
	};

	let { items, value = $bindable(''), onchange, variant = 'default', class: className = '' }: Props = $props();

	function getItemClass(item: TabItem, isActive: boolean): string {
		if (variant === 'approve-reject') {
			if (!isActive) return 'bg-transparent text-[#4c4c4c] hover:bg-white/10';
			if (item.value === 'approve') return 'bg-ds-green-bg text-ds-green border border-ds-green/30 shadow-[var(--color-ds-shadow)] hover:bg-[#c8e6c9]';
			if (item.value === 'reject' || item.value === 'changes') return 'bg-ds-red-bg text-ds-red border border-ds-red/30 shadow-[var(--color-ds-shadow)] hover:bg-[#ffcdd2]';
		}
		if (isActive) return 'bg-white border border-ds-border text-black shadow-[var(--color-ds-shadow)]';
		return 'bg-transparent text-ds-text-placeholder hover:bg-white/10';
	}
</script>

<div class="flex gap-1 items-center justify-center p-1 bg-[#eaebf8] rounded-lg shadow-[var(--color-ds-shadow)] {className}">
	{#each items as item}
		<button
			class="flex-1 px-2 py-1 rounded text-xs font-medium cursor-pointer border-none {getItemClass(item, value === item.value)}"
			onclick={() => { value = item.value; onchange?.(item.value); }}
		>
			{item.label}
		</button>
	{/each}
</div>
