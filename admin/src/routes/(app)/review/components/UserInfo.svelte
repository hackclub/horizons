<script lang="ts">
	import type { components } from '$lib/api';
	type ScopedUser = components['schemas']['ScopedUserResponse'];
	import HoursBreakdown from './HoursBreakdown.svelte';

	interface Props {
		user: ScopedUser;
		repoUrl: string | null;
		playableUrl: string | null;
		readmeUrl: string | null;
		hackatimeHours: number | null;
		hackatimeProjects: string[];
		joeFraudPassed?: boolean | null;
		joeTrustScore?: number | null;
		onHoursChange?: (hours: number) => void;
	}

	let {
		user,
		repoUrl,
		playableUrl,
		readmeUrl,
		hackatimeHours,
		hackatimeProjects,
		joeFraudPassed = null,
		joeTrustScore = null,
		onHoursChange,
	}: Props = $props();

	const fraudBadge = $derived(
		joeFraudPassed === true
			? { label: 'Fraud: passed', class: 'border-green-500 text-green-600 bg-green-500/10' }
			: joeFraudPassed === false
				? { label: 'Fraud: failed', class: 'border-red-500 text-red-600 bg-red-500/10' }
				: { label: 'Fraud: pending', class: 'border-gray-400 text-gray-500 bg-gray-500/10' },
	);

	// Build Slack DM link from user's Slack ID
	const slackDmUrl = $derived(
		user.slackUserId ? `https://hackclub.slack.com/team/${user.slackUserId}` : null,
	);

	// Build README URL from repo — default to repo/blob/main/README.md
	const resolvedReadmeUrl = $derived(
		readmeUrl || (repoUrl ? `${repoUrl.replace(/\/$/, '')}/blob/main/README.md` : null),
	);

	// Build Airlock URL to open the repo in a sandboxed VM
	const airlockUrl = $derived(
		repoUrl ? `https://airlock.hackclub.com/?r=${encodeURIComponent(repoUrl)}` : null,
	);

	const hackatimeStartDateLabel = $derived(
		(user as any).hackatimeStartDate
			? new Date((user as any).hackatimeStartDate).toISOString().split('T')[0]
			: null,
	);

	const displayLabel = $derived(
		user.displayName ?? (user.slackUserId ? `@${user.slackUserId}` : 'Anonymous'),
	);

	let slackIdCopied = $state(false);
	let copyTimeout: ReturnType<typeof setTimeout> | null = null;
	async function copySlackId() {
		if (!user.slackUserId) return;
		try {
			await navigator.clipboard.writeText(user.slackUserId);
			slackIdCopied = true;
			if (copyTimeout) clearTimeout(copyTimeout);
			copyTimeout = setTimeout(() => (slackIdCopied = false), 1200);
		} catch {
			// clipboard unavailable — silent
		}
	}
</script>

<div class="p-4">
	<div class="flex items-center gap-2 mb-0.5">
		<span class="text-[18px] font-bold font-[Space_Mono,monospace]">{displayLabel}</span>
	</div>

	<div class="flex items-center gap-2 mb-3">
		<span class={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${fraudBadge.class}`}>
			{fraudBadge.label}
		</span>
		{#if joeTrustScore != null}
			<span class="inline-flex items-center rounded-full border border-rv-border text-rv-dim px-2 py-0.5 text-[11px] font-medium font-[Space_Mono,monospace]">
				Trust: {joeTrustScore}
			</span>
		{/if}
	</div>

	{#if slackDmUrl}
		<div class="text-[12px] text-rv-dim mb-3.5 flex items-center gap-2 flex-wrap">
			<a href={slackDmUrl} target="_blank" rel="noopener noreferrer" class="text-rv-dim no-underline inline-flex items-center gap-1 transition-all duration-150 hover:text-rv-accent">
				<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
			<span class="inline-flex items-center gap-1 font-[Space_Mono,monospace] text-rv-dim/80">
				<span>{user.slackUserId}</span>
				<button
					type="button"
					onclick={copySlackId}
					title={slackIdCopied ? 'Copied!' : 'Copy Slack ID'}
					aria-label="Copy Slack ID"
					class="inline-flex items-center justify-center p-0.5 rounded text-rv-dim hover:text-rv-accent transition-colors duration-150 cursor-pointer"
				>
					{#if slackIdCopied}
						<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="20 6 9 17 4 12" />
						</svg>
					{:else}
						<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
							<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
						</svg>
					{/if}
				</button>
			</span>
		</div>
	{/if}

	<div class="grid grid-cols-2 gap-2 mb-3.5 [&_a]:flex [&_a]:items-center [&_a]:gap-1.25 [&_a]:text-rv-dim [&_a]:no-underline [&_a]:text-[13px] [&_a]:font-medium [&_a]:py-1.5 [&_a]:px-3.5 [&_a]:border [&_a]:border-rv-border [&_a]:rounded-md [&_a]:transition-all [&_a]:duration-150 [&_a:hover]:text-rv-accent [&_a:hover]:border-rv-accent [&_a_svg]:w-3.5 [&_a_svg]:h-3.5">
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
			<a href={playableUrl} target="_blank" rel="noopener noreferrer" class="bg-[rgba(239,83,80,0.15)]! text-rv-red! border-[rgba(239,83,80,0.3)]! hover:bg-[rgba(239,83,80,0.25)]!">
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
		{#if airlockUrl}
			<a href={airlockUrl} target="_blank" rel="noopener noreferrer" class="border-rv-accent! text-rv-accent! hover:bg-rv-tag-bg!">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<rect x="2" y="3" width="20" height="14" rx="2" />
					<line x1="8" y1="21" x2="16" y2="21" />
					<line x1="12" y1="17" x2="12" y2="21" />
				</svg>
				Airlock ↗
			</a>
		{/if}
	</div>

	<HoursBreakdown totalHours={hackatimeHours} projects={hackatimeProjects} {onHoursChange} />

	{#if user.age !== null}
		<div class="text-[13px] text-rv-text flex items-center gap-1.5 mb-1">
			<svg class="w-3.5 h-3.5 text-rv-dim shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
				<circle cx="12" cy="7" r="4" />
			</svg>
			<span class="bg-rv-green-bg text-rv-green text-[11px] font-bold py-0.5 px-2 rounded-sm">{user.age}yo</span>
		</div>
	{/if}

	{#if hackatimeStartDateLabel}
		<div
			class="mt-2 rounded-md border border-rv-accent bg-rv-tag-bg p-2 text-[12px] text-rv-accent"
			title="This user has a custom Hackatime start date set by an admin (usually for CSV backfill). Hours counted below include Hackatime activity from this date onward — not the default event cutoff."
		>
			<div class="font-semibold">⚠ Custom Hackatime start: {hackatimeStartDateLabel}</div>
			<div>
				Hours include this user's Hackatime activity since this date (admin-set override). Default event cutoff does not apply.
			</div>
		</div>
	{/if}
</div>
