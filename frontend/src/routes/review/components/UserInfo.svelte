<script lang="ts">
	import type { ScopedUser } from '../api';
	import HoursBreakdown from './HoursBreakdown.svelte';

	interface Props {
		user: ScopedUser;
		repoUrl: string | null;
		playableUrl: string | null;
		readmeUrl: string | null;
		hackatimeHours: number | null;
		hackatimeProjects: string[];
		onHoursChange?: (hours: number) => void;
	}

	let { user, repoUrl, playableUrl, readmeUrl, hackatimeHours, hackatimeProjects, onHoursChange }: Props =
		$props();

	// Build Slack DM link from user's Slack ID
	const slackDmUrl = $derived(
		user.slackUserId ? `https://hackclub.slack.com/team/${user.slackUserId}` : null,
	);

	// Build README URL from repo — default to repo/blob/main/README.md
	const resolvedReadmeUrl = $derived(
		readmeUrl || (repoUrl ? `${repoUrl.replace(/\/$/, '')}/blob/main/README.md` : null),
	);
</script>

<div class="user-header">
	<div class="user-name-row">
		<span class="user-name">{user.firstName} {user.lastName}</span>
		{#if user.isFraud}
			<span class="fraud-badge">FRAUD</span>
		{:else if user.isSus}
			<span class="sus-badge">SUS</span>
		{/if}
	</div>

	{#if slackDmUrl}
		<div class="user-email">
			<a href={slackDmUrl} target="_blank" rel="noopener noreferrer">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path
						d="M14.5 2a2.5 2.5 0 0 0 0 5H17V4.5A2.5 2.5 0 0 0 14.5 2z"
					/>
					<path d="M7 8.5a2.5 2.5 0 0 0 5 0V6H9.5A2.5 2.5 0 0 0 7 8.5z" />
					<path
						d="M9.5 22a2.5 2.5 0 0 0 0-5H7v2.5A2.5 2.5 0 0 0 9.5 22z"
					/>
					<path
						d="M17 15.5a2.5 2.5 0 0 0-5 0V18h2.5a2.5 2.5 0 0 0 2.5-2.5z"
					/>
				</svg>
				DM on Slack ↗
			</a>
		</div>
	{/if}

	<div class="user-links">
		{#if repoUrl}
			<a href={repoUrl} target="_blank" rel="noopener noreferrer">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="16 18 22 12 16 6" />
					<polyline points="8 6 2 12 8 18" />
				</svg>
				Code ↗
			</a>
		{/if}
		{#if playableUrl}
			<a href={playableUrl} target="_blank" rel="noopener noreferrer" class="demo-link">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polygon points="5 3 19 12 5 21 5 3" />
				</svg>
				Demo ↗
			</a>
		{/if}
		{#if resolvedReadmeUrl}
			<a href={resolvedReadmeUrl} target="_blank" rel="noopener noreferrer">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
					<polyline points="14 2 14 8 20 8" />
					<line x1="16" y1="13" x2="8" y2="13" />
					<line x1="16" y1="17" x2="8" y2="17" />
				</svg>
				README ↗
			</a>
		{/if}
		<!-- TODO: Implement Airlock link — opens project in sandboxed VM environment -->
		<a href="#" class="airlock-link" onclick={(e) => e.preventDefault()}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<rect x="2" y="3" width="20" height="14" rx="2" />
				<line x1="8" y1="21" x2="16" y2="21" />
				<line x1="12" y1="17" x2="12" y2="21" />
			</svg>
			Airlock ↗
		</a>
	</div>

	<HoursBreakdown totalHours={hackatimeHours} projects={hackatimeProjects} {onHoursChange} />

	{#if user.age !== null}
		<div class="user-meta-line">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
				<circle cx="12" cy="7" r="4" />
			</svg>
			<span class="age-badge">{user.age}yo</span>
		</div>
	{/if}
</div>

<style>
	.user-header {
		padding: 16px;
	}

	.user-name-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 2px;
	}

	.user-name {
		font-size: 18px;
		font-weight: 700;
		font-family: 'Space Mono', monospace;
	}

	.fraud-badge {
		background: var(--red-bg);
		color: var(--red);
		font-size: 10px;
		font-weight: 700;
		padding: 2px 6px;
		border-radius: 4px;
	}

	.sus-badge {
		background: rgba(245, 166, 35, 0.15);
		color: var(--accent);
		font-size: 10px;
		font-weight: 700;
		padding: 2px 6px;
		border-radius: 4px;
	}

	.user-email {
		font-size: 12px;
		color: var(--text-dim);
		margin-bottom: 14px;
	}

	.user-email a {
		color: var(--text-dim);
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		transition: color 0.15s;
	}

	.user-email a:hover {
		color: var(--accent);
	}

	.user-email a svg {
		width: 12px;
		height: 12px;
	}

	.user-links {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin-bottom: 14px;
	}

	.user-links a {
		display: flex;
		align-items: center;
		gap: 5px;
		color: var(--text-dim);
		text-decoration: none;
		font-size: 13px;
		font-weight: 500;
		padding: 6px 14px;
		border: 1px solid var(--border);
		border-radius: 6px;
		transition: all 0.15s;
	}

	.user-links a:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	.user-links a.demo-link {
		background: rgba(239, 83, 80, 0.15);
		color: var(--red);
		border-color: rgba(239, 83, 80, 0.3);
	}

	.user-links a.demo-link:hover {
		background: rgba(239, 83, 80, 0.25);
	}

	.user-links a.airlock-link {
		border-color: var(--accent);
		color: var(--accent);
		opacity: 0.5;
		cursor: not-allowed;
	}

	.user-links a svg {
		width: 14px;
		height: 14px;
	}

	.user-meta-line {
		font-size: 13px;
		color: var(--text);
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 4px;
	}

	.user-meta-line svg {
		width: 14px;
		height: 14px;
		color: var(--text-dim);
		flex-shrink: 0;
	}

	.age-badge {
		background: var(--green-bg);
		color: var(--green);
		font-size: 11px;
		font-weight: 700;
		padding: 2px 8px;
		border-radius: 4px;
	}
</style>
