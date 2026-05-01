<script lang="ts">
	import { onMount } from 'svelte';
	import enterSvg from '$lib/assets/prompts/enter.svg';
	import clickSvg from '$lib/assets/prompts/click.svg';
	import { parseNavKey } from '$lib/nav/wasd.svelte';
	import { api } from '$lib/api';

	interface Props {
		element?: HTMLElement | null;
		selected?: boolean;
		usingKeyboard?: boolean;
		postOnboarding?: boolean;
		description?: string;
		hideEnterHint?: boolean;
		onmouseenter?: () => void;
		onclick?: (e: MouseEvent) => void;
		onEventClick?: (id: string) => void;
		focusedEventId?: string | null;
		hasLiveEvent?: boolean;
		debugEvents?: CommunityEvent[] | null;
	}

	export interface CommunityEvent {
		id: string;
		name: string;
		start: Date;
		end: Date;
		tagline: string;
		joinInfo: string;
		description: string;
		actionUrl: string;
		actionLabel: string;
	}

	let {
		element = $bindable(null),
		selected = false,
		usingKeyboard = true,
		postOnboarding = false,
		description = '',
		hideEnterHint = false,
		onmouseenter,
		onclick,
		onEventClick,
		focusedEventId = $bindable(null),
		hasLiveEvent = $bindable(false),
		debugEvents = null,
	}: Props = $props();

	let fetchedEvents = $state<CommunityEvent[]>([]);
	let events = $derived<CommunityEvent[]>(debugEvents ?? fetchedEvents);
	let now = $state(new Date());

	function formatTime(d: Date): string {
		return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
	}

	function tzAbbr(d: Date): string {
		const parts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(d);
		return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
	}

	function weekdayShort(d: Date): string {
		return d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
	}

	let upcoming = $derived(
		events
			.filter((e) => e.end >= now)
			.sort((a, b) => a.start.getTime() - b.start.getTime())
	);

	function isLive(event: CommunityEvent): boolean {
		return event.start.getTime() <= now.getTime() && event.end.getTime() >= now.getTime();
	}

	$effect(() => {
		hasLiveEvent = events.some(isLive);
	});

	function handleEventClick(e: MouseEvent, id: string) {
		e.preventDefault();
		e.stopPropagation();
		onEventClick?.(id);
	}

	let focusedIndex = $state(-1);
	let eventEls = $state<(HTMLElement | null)[]>([]);

	$effect(() => {
		focusedEventId =
			focusedIndex >= 0 && focusedIndex < upcoming.length ? upcoming[focusedIndex].id : null;
	});

	$effect(() => {
		if (!selected) focusedIndex = -1;
	});

	$effect(() => {
		const el = eventEls[focusedIndex];
		if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	});

	function handleWindowKeydown(e: KeyboardEvent) {
		if (!selected) return;
		const dir = parseNavKey(e.key);
		if (dir === 'up') {
			e.preventDefault();
			focusedIndex = Math.max(-1, focusedIndex - 1);
		} else if (dir === 'down') {
			e.preventDefault();
			focusedIndex = Math.min(upcoming.length - 1, Math.max(0, focusedIndex + 1));
		}
	}

	onMount(() => {
		api.GET('/api/community-events')
			.then(({ data }) => {
				if (!data) return;
				fetchedEvents = data.map((item) => ({
					id: item.communityEventId,
					name: item.name,
					start: new Date(item.start),
					end: new Date(item.end),
					tagline: item.tagline ?? '',
					joinInfo: item.joinInfo ?? '',
					description: item.description ?? '',
					actionUrl: item.actionUrl ?? '',
					actionLabel: item.actionLabel ?? '',
				}));
			})
			.catch(() => {});

		const interval = setInterval(() => { now = new Date(); }, 60000);
		return () => clearInterval(interval);
	});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div bind:this={element} role="link" tabindex="-1" class="card nav-card community-events-card"
	class:selected
	class:input-keyboard={usingKeyboard}
	{onmouseenter}
	{onclick}>
	<p class="font-cook text-[16px] text-black m-0">UPCOMING COMMUNITY EVENTS</p>
	<div class="ce-list">
		{#if upcoming.length === 0}
			<p class="font-bricolage text-[16px] text-black/50 m-0 px-2">No upcoming events.</p>
		{:else}
			{#each upcoming as event, i (event.id)}
				{@const live = isLive(event)}
				<button
					bind:this={eventEls[i]}
					type="button"
					class="ce-event"
					class:focused={i === focusedIndex}
					onclick={(e) => handleEventClick(e, event.id)}
				>
					<div class="ce-date-stamp">
						<p class="font-cook text-[36px] text-black leading-none m-0">{event.start.getDate()}</p>
						<p class="font-bricolage text-[16px] text-black m-0">{weekdayShort(event.start)}</p>
					</div>
					<div class="ce-details">
						{#if live}
							<p class="ce-live font-cook m-0">LIVE</p>
						{/if}
						<p class="font-cook text-[20px] text-black leading-tight m-0">{event.name.toUpperCase()}</p>
						{#if event.tagline}
							<p class="font-bricolage text-[14px] text-black/70 m-0">{event.tagline.toUpperCase()}</p>
						{/if}
						<div class="ce-actions">
							{#if event.actionUrl}
								<a
									class="ce-action"
									href={event.actionUrl}
									target="_blank"
									rel="noopener noreferrer"
									onclick={(e) => e.stopPropagation()}
								>
									{(event.actionLabel || (live ? 'Join Now' : 'Open')).toUpperCase()}
								</a>
							{/if}
							<div class="ce-times">
								<span class="ce-time">{formatTime(event.start)}</span>
								<span class="ce-dash">&ndash;</span>
								<span class="ce-time">{formatTime(event.end)}</span>
								<span class="ce-tz">{tzAbbr(event.start)}</span>
							</div>
						</div>
					</div>
				</button>
			{/each}
		{/if}
	</div>
	{#if selected && !postOnboarding && !hideEnterHint}
		<div class="enter-hint">
			<img
				src={usingKeyboard ? enterSvg : clickSvg}
				alt={usingKeyboard ? 'Enter' : 'Click'}
				class="enter-hint-key"
			/>
			<span class="font-bricolage text-[12px] text-black font-semibold">TO VIEW COMMUNITY EVENTS</span>
		</div>
	{/if}

	{#if postOnboarding && selected}
		<div class="ce-popover">
			<p class="font-bricolage text-[16px] font-semibold text-black/70 m-0">{description}</p>
			<div class="popover-hint">
				<img
					src={usingKeyboard ? enterSvg : clickSvg}
					alt={usingKeyboard ? 'Enter' : 'Click'}
					class="enter-hint-key"
				/>
				<span class="font-bricolage text-[12px] text-black font-semibold">TO VIEW COMMUNITY EVENTS</span>
			</div>
		</div>
	{/if}
</div>

<style>
	.card {
		border: 4px solid black;
		border-radius: 20px;
		box-shadow: 4px 4px 0px 0px black;
		overflow: hidden;
		text-decoration: none;
		color: black;
	}

	.nav-card {
		display: block;
		position: relative;
		transition: transform var(--juice-duration) var(--juice-easing);
		cursor: pointer;
	}

	.nav-card.selected {
		transform: scale(var(--juice-scale));
		z-index: 10;
	}

	.community-events-card {
		width: 471px;
		height: 100%;
		background-color: #f3e8d8;
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 16px;
	}

	.ce-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding-right: 4px;
	}

	.ce-list::-webkit-scrollbar {
		width: 6px;
	}
	.ce-list::-webkit-scrollbar-track {
		background: transparent;
	}
	.ce-list::-webkit-scrollbar-thumb {
		background: rgba(0, 0, 0, 0.15);
		border-radius: 3px;
	}
	.ce-list::-webkit-scrollbar-thumb:hover {
		background: rgba(0, 0, 0, 0.3);
	}

	.ce-event {
		display: flex;
		gap: 16px;
		align-items: center;
		padding: 8px;
		border-radius: 8px;
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
		width: 100%;
		flex-shrink: 0;
		transition: background-color 0.15s ease;
	}

	.ce-event:hover,
	.ce-event.focused {
		background-color: rgba(0, 0, 0, 0.08);
	}

	/* In keyboard mode, suppress mouse-hover styling so only the focused event highlights */
	.community-events-card.input-keyboard .ce-event:hover {
		background-color: transparent;
	}
	.community-events-card.input-keyboard .ce-event.focused {
		background-color: rgba(0, 0, 0, 0.08);
	}

	/* In mouse mode, suppress keyboard-focus styling so only the hovered event highlights */
	.community-events-card:not(.input-keyboard) .ce-event.focused {
		background-color: transparent;
	}
	.community-events-card:not(.input-keyboard) .ce-event:hover {
		background-color: rgba(0, 0, 0, 0.08);
	}

	.ce-date-stamp {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 80px;
		height: 80px;
		border: 2px solid black;
		border-radius: 8px;
		flex-shrink: 0;
	}

	.ce-details {
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex: 1;
		min-width: 0;
	}

	.ce-live {
		color: #fc5b3c;
		font-size: 14px;
		letter-spacing: 0.04em;
		line-height: 1;
	}

	.ce-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		margin-top: 2px;
	}

	.ce-times {
		display: flex;
		gap: 6px;
		align-items: center;
	}

	.ce-time {
		background: rgba(0, 0, 0, 0.1);
		border-radius: 8px;
		padding: 2px 8px;
		font-family: 'Bricolage Grotesque', sans-serif;
		font-size: 14px;
		color: black;
	}

	.ce-action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		color: black;
		border: 2px solid black;
		border-radius: 8px;
		padding: 4px 12px;
		font-family: 'Bricolage Grotesque', sans-serif;
		font-size: 14px;
		font-weight: 600;
		text-decoration: none;
		transition: background-color 0.15s ease, color 0.15s ease;
		white-space: nowrap;
	}

	.ce-action:hover {
		background: black;
		color: #f3e8d8;
	}

	.ce-dash {
		color: rgba(0, 0, 0, 0.4);
		font-family: 'Bricolage Grotesque', sans-serif;
	}

	.ce-tz {
		font-family: 'Bricolage Grotesque', sans-serif;
		font-size: 14px;
		color: rgba(0, 0, 0, 0.5);
	}

	.enter-hint {
		position: absolute;
		bottom: 12px;
		right: 12px;
		z-index: 30;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 5px 12px;
		background: #f3e8d8;
		border: 2px solid black;
		border-radius: 8px;
	}

	.enter-hint-key {
		height: 22px;
		width: auto;
	}

	.ce-popover {
		position: absolute;
		bottom: 12px;
		left: 12px;
		right: 12px;
		z-index: 40;
		background: #f3e8d8;
		border: 3px solid black;
		border-radius: 12px;
		box-shadow: 3px 3px 0px 0px black;
		padding: 12px 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.popover-hint {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		align-self: flex-end;
	}
</style>
