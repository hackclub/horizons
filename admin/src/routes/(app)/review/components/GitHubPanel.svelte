<script lang="ts">
	import type { components } from '$lib/api';
	type GitHubRepo = components['schemas']['GitHubRepoResponse'];
	import { timeAgo } from '../utils';
	import CommitList from './CommitList.svelte';

	interface Props {
		repo: GitHubRepo | null;
		loading: boolean;
		error: string | null;
		repoUrl: string | null;
	}

	let { repo, loading, error, repoUrl }: Props = $props();
</script>

<div class="flex flex-1 flex-col min-h-0 overflow-hidden">
	<div class="flex items-center justify-between px-4 py-3.5">
		<div class="flex items-center gap-2">
			<svg class="w-4 h-4 text-rv-dim" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
				<path
					d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"
				/>
			</svg>
			<span class="text-[13px] text-rv-dim">GitHub</span>
		</div>
		{#if repo}
			<a
				class="font-[Space_Mono,monospace] text-[13px] font-bold text-rv-blue no-underline hover:underline"
				href={repoUrl}
				target="_blank"
				rel="noopener noreferrer"
			>
				{repo.fullName} ↗
			</a>
		{/if}
	</div>

	<hr class="border-none border-t border-rv-border m-0" />

	{#if loading}
		<div class="px-4 py-5 text-[13px] text-rv-dim text-center">Loading GitHub data...</div>
	{:else if error}
		<div class="px-4 py-3 text-[13px] text-[#e8a732] bg-[rgba(176,114,25,0.1)] rounded mx-3 my-2 text-center">
			{error}
		</div>
	{:else if !repo}
		<div class="px-4 py-5 text-[13px] text-rv-dim text-center">No GitHub data available.</div>
	{:else}
		<div class="flex justify-evenly px-4 py-3.5 text-[13px] text-rv-dim">
			<div class="flex items-center gap-1.25">
				<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polygon
						points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
					/>
				</svg>
				<strong class="text-rv-text font-semibold">{repo.stars}</strong>
			</div>
			<div class="flex items-center gap-1.25">
				<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="18" r="3" />
					<circle cx="6" cy="6" r="3" />
					<circle cx="18" cy="6" r="3" />
					<line x1="12" y1="15" x2="12" y2="9" />
					<path d="M6 9v3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V9" />
				</svg>
				<strong class="text-rv-text font-semibold">{repo.forks}</strong>
			</div>
			<div class="flex items-center gap-1.25">
				<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10" />
					<line x1="12" y1="8" x2="12" y2="12" />
					<line x1="12" y1="16" x2="12.01" y2="16" />
				</svg>
				<strong class="text-rv-text font-semibold">{repo.openIssues}</strong>
			</div>
			<div class="flex items-center gap-1.25">
				<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="18" cy="18" r="3" />
					<circle cx="6" cy="6" r="3" />
					<path d="M13 6h3a2 2 0 0 1 2 2v7" />
					<line x1="6" y1="9" x2="6" y2="21" />
				</svg>
				<strong class="text-rv-text font-semibold">{repo.pullRequests}</strong>
			</div>
		</div>

		<div class="flex items-center gap-3 px-4 py-2.5 text-[13px]">
			{#if repo.language}
				<span class="bg-[rgba(176,114,25,0.2)] text-[#e8a732] text-[12px] font-semibold px-2.5 py-0.75 rounded">
					{repo.language}
				</span>
			{/if}
			{#if repo.license}
				<span>{repo.license}</span>
			{/if}
		</div>

		<div class="flex gap-4 px-4 pt-2 pb-3 text-[12px] text-rv-dim">
			<span>Created {timeAgo(repo.createdAt)}</span>
			<span>Pushed {timeAgo(repo.pushedAt)}</span>
		</div>

		<hr class="border-none border-t border-rv-border m-0" />

		<CommitList commits={repo.commits} />
	{/if}
</div>
