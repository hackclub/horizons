<script lang="ts">
	export interface Tab {
		id: string;
		label: string;
	}

	interface Props {
		tabs: Tab[];
		activeTab: string;
		onTabChange: (tabId: string) => void;
	}

	let { tabs, activeTab, onTabChange }: Props = $props();
</script>

<div class="flex items-end bg-rv-surface border-b border-rv-border px-2 pt-1.5 shrink-0">
	{#each tabs as tab (tab.id)}
		<button
			class="relative px-4 py-2 text-[12px] font-semibold rounded-t-lg border border-b-0 cursor-pointer transition-all duration-150 -mb-px
				{activeTab === tab.id
					? 'bg-rv-bg text-rv-text border-rv-border z-10'
					: 'bg-transparent text-rv-dim border-transparent hover:text-rv-text hover:bg-rv-surface2'}"
			onclick={() => onTabChange(tab.id)}
		>
			{tab.label}
		</button>
	{/each}
</div>
