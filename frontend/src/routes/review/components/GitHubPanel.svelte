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

<div class="right-top">
	<div class="gh-header">
		<div class="gh-header-left">
			<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
				<path
					d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"
				/>
			</svg>
			<span>GitHub</span>
		</div>
		{#if repo}
			<a class="gh-repo-link" href={repoUrl} target="_blank" rel="noopener noreferrer">
				{repo.fullName} ↗
			</a>
		{/if}
	</div>

	<hr class="section-divider" />

	{#if loading}
		<div class="gh-loading">Loading GitHub data...</div>
	{:else if error}
		<div class="gh-error">{error}</div>
	{:else if !repo}
		<div class="gh-loading">No GitHub data available.</div>
	{:else}
		<div class="gh-stats">
			<div class="gh-stat">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polygon
						points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
					/>
				</svg>
				<strong>{repo.stars}</strong>
			</div>
			<div class="gh-stat">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="18" r="3" />
					<circle cx="6" cy="6" r="3" />
					<circle cx="18" cy="6" r="3" />
					<line x1="12" y1="15" x2="12" y2="9" />
					<path d="M6 9v3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V9" />
				</svg>
				<strong>{repo.forks}</strong>
			</div>
			<div class="gh-stat">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10" />
					<line x1="12" y1="8" x2="12" y2="12" />
					<line x1="12" y1="16" x2="12.01" y2="16" />
				</svg>
				<strong>{repo.openIssues}</strong>
			</div>
			<div class="gh-stat">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="18" cy="18" r="3" />
					<circle cx="6" cy="6" r="3" />
					<path d="M13 6h3a2 2 0 0 1 2 2v7" />
					<line x1="6" y1="9" x2="6" y2="21" />
				</svg>
				<strong>{repo.pullRequests}</strong>
			</div>
		</div>

		<div class="gh-info-row">
			{#if repo.language}
				<span class="lang-badge">{repo.language}</span>
			{/if}
			{#if repo.license}
				<span>{repo.license}</span>
			{/if}
		</div>

		<div class="gh-times">
			<span>Created {timeAgo(repo.createdAt)}</span>
			<span>Pushed {timeAgo(repo.pushedAt)}</span>
		</div>

		<hr class="section-divider" />

		<CommitList commits={repo.commits} />
	{/if}
</div>

<style>
	.right-top {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
	}

	.gh-header {
		padding: 14px 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.gh-header-left {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.gh-header-left svg {
		width: 16px;
		height: 16px;
		color: var(--text-dim);
	}

	.gh-header-left span {
		font-size: 13px;
		color: var(--text-dim);
	}

	.gh-repo-link {
		font-family: 'Space Mono', monospace;
		font-size: 13px;
		font-weight: 700;
		color: var(--blue);
		text-decoration: none;
	}

	.gh-repo-link:hover {
		text-decoration: underline;
	}

	.section-divider {
		border: none;
		border-top: 1px solid var(--border);
		margin: 0;
	}

	.gh-loading {
		padding: 20px 16px;
		font-size: 13px;
		color: var(--text-dim);
		text-align: center;
	}

	.gh-error {
		padding: 12px 16px;
		font-size: 13px;
		color: #e8a732;
		background: rgba(176, 114, 25, 0.1);
		border-radius: 4px;
		margin: 8px 12px;
		text-align: center;
	}

	.gh-stats {
		display: flex;
		justify-content: space-evenly;
		padding: 14px 16px;
		font-size: 13px;
		color: var(--text-dim);
	}

	.gh-stat {
		display: flex;
		align-items: center;
		gap: 5px;
	}

	.gh-stat svg {
		width: 14px;
		height: 14px;
	}

	.gh-stat strong {
		color: var(--text);
		font-weight: 600;
	}

	.gh-info-row {
		padding: 10px 16px;
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 13px;
	}

	.lang-badge {
		background: rgba(176, 114, 25, 0.2);
		color: #e8a732;
		font-size: 12px;
		font-weight: 600;
		padding: 3px 10px;
		border-radius: 4px;
	}

	.gh-times {
		padding: 8px 16px 12px;
		font-size: 12px;
		color: var(--text-dim);
		display: flex;
		gap: 16px;
	}
</style>
