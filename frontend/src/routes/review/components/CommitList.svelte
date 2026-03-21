<script lang="ts">
	import type { GitHubCommit } from '../api';
	import { timeAgo } from '../utils';

	interface Props {
		commits: GitHubCommit[];
	}

	let { commits }: Props = $props();
</script>

<div class="gh-commits-header">
	<span>Commits</span>
	<span class="commit-count">{commits.length}</span>
</div>

<div class="commit-list">
	{#each commits as commit}
		<a class="commit-item" href={commit.url} target="_blank" rel="noopener noreferrer">
			<div class="commit-msg">{commit.message}</div>
			<div class="commit-meta">
				<span class="cm-avatar">{commit.authorLogin[0]?.toUpperCase() ?? '?'}</span>
				<span>{commit.authorLogin}</span> ·
				<span>{timeAgo(commit.date)}</span>
				<div class="commit-diff">
					{#if commit.additions > 0}
						<span class="diff-add">+{commit.additions}</span>
					{/if}
					{#if commit.deletions > 0}
						<span class="diff-del">-{commit.deletions}</span>
					{/if}
				</div>
			</div>
		</a>
	{/each}
</div>

<style>
	.gh-commits-header {
		padding: 12px 16px 8px;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.gh-commits-header span:first-child {
		font-size: 14px;
		font-weight: 700;
	}

	.commit-count {
		background: var(--red);
		color: #fff;
		font-size: 11px;
		font-weight: 700;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.commit-list {
		padding: 0 0 10px;
		overflow-y: auto;
		flex: 1;
		min-height: 0;
	}

	.commit-item {
		display: block;
		text-decoration: none;
		color: inherit;
		padding: 10px 16px;
		transition: background 0.1s;
		cursor: pointer;
		border-bottom: 1px solid var(--divider);
	}

	.commit-item:last-child {
		border-bottom: none;
	}

	.commit-item:hover {
		background: rgba(255, 255, 255, 0.03);
	}

	.commit-msg {
		font-size: 14px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-bottom: 3px;
	}

	.commit-meta {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: var(--text-dim);
	}

	.cm-avatar {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--surface2);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
		font-weight: 700;
		color: var(--text-dim);
		flex-shrink: 0;
	}

	.commit-diff {
		display: flex;
		gap: 6px;
		margin-left: auto;
	}

	.diff-add {
		color: var(--green);
		font-weight: 600;
		font-family: 'Space Mono', monospace;
		font-size: 11px;
	}

	.diff-del {
		color: var(--red);
		font-weight: 600;
		font-family: 'Space Mono', monospace;
		font-size: 11px;
	}
</style>
