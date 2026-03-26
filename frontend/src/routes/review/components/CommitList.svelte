<script lang="ts">
	import type { components } from '$lib/api';
	type GitHubCommit = components['schemas']['GitHubCommitResponse'];
	import { timeAgo } from '../utils';

	interface Props {
		commits: GitHubCommit[];
	}

	let { commits }: Props = $props();
</script>

<div class="flex items-center justify-between px-4 pt-3 pb-2">
	<span class="text-[14px] font-bold">Commits</span>
	<span class="bg-rv-red text-white text-[11px] font-bold w-6 h-6 rounded-full flex items-center justify-center">{commits.length}</span>
</div>

<div class="pb-2.5 overflow-y-auto flex-1 min-h-0">
	{#each commits as commit, i}
		<a
			class="block no-underline text-inherit px-4 py-2.5 transition-all duration-150 cursor-pointer hover:bg-white/[0.03] {i < commits.length - 1 ? 'border-b border-rv-divider' : ''}"
			href={commit.url}
			target="_blank"
			rel="noopener noreferrer"
		>
			<div class="text-[14px] font-medium whitespace-nowrap overflow-hidden text-ellipsis mb-[3px]">{commit.message}</div>
			<div class="flex items-center gap-2 text-[12px] text-rv-dim">
				<span class="w-[18px] h-[18px] rounded-full bg-rv-surface2 flex items-center justify-center text-[10px] font-bold text-rv-dim shrink-0">{commit.authorLogin[0]?.toUpperCase() ?? '?'}</span>
				<span>{commit.authorLogin}</span> ·
				<span>{timeAgo(commit.date)}</span>
				<div class="flex gap-1.5 ml-auto">
					{#if commit.additions > 0}
						<span class="text-rv-green font-semibold font-[Space_Mono,monospace] text-[11px]">+{commit.additions}</span>
					{/if}
					{#if commit.deletions > 0}
						<span class="text-rv-red font-semibold font-[Space_Mono,monospace] text-[11px]">-{commit.deletions}</span>
					{/if}
				</div>
			</div>
		</a>
	{/each}
</div>
