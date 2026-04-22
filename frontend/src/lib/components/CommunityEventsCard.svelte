<script lang="ts">
	import { onMount } from 'svelte';
	import enterSvg from '$lib/assets/prompts/enter.svg';
	import clickSvg from '$lib/assets/prompts/click.svg';
	import { parseNavKey } from '$lib/nav/wasd.svelte';

	interface Props {
		element?: HTMLElement | null;
		selected?: boolean;
		usingKeyboard?: boolean;
		postOnboarding?: boolean;
		description?: string;
		onmouseenter?: () => void;
		onclick?: (e: MouseEvent) => void;
		onEventClick?: (id: string) => void;
		focusedEventId?: string | null;
	}

	let {
		element = $bindable(null),
		selected = false,
		usingKeyboard = true,
		postOnboarding = false,
		description = '',
		onmouseenter,
		onclick,
		onEventClick,
		focusedEventId = $bindable(null),
	}: Props = $props();

	interface CommunityEvent {
		id: string;
		name: string;
		start: Date;
		end: Date;
		tagline: string;
	}

	let events = $state<CommunityEvent[]>([]);
	let now = $state(new Date());

	function parseEventsMd(md: string): CommunityEvent[] {
		const lines = md.split('\n');
		const out: CommunityEvent[] = [];
		let name = '', yml = '', inYaml = false;
		for (const line of lines) {
			if (line.startsWith('## ')) {
				if (name) out.push(buildEvent(name, yml));
				name = line.replace('## ', '').trim();
				yml = '';
				inYaml = false;
			} else if (line.startsWith('```yaml')) {
				inYaml = true;
			} else if (line === '```' && inYaml) {
				inYaml = false;
			} else if (inYaml) {
				yml += line + '\n';
			}
		}
		if (name) out.push(buildEvent(name, yml));
		return out;
	}

	function buildEvent(name: string, yamlStr: string): CommunityEvent {
		const map: Record<string, string> = {};
		for (const line of yamlStr.split('\n')) {
			if (!line.trim()) continue;
			const [k, ...v] = line.split(':');
			const value = v.join(':').trim().replace(/^['"]|['"]$/g, '');
			if (k && value) map[k.trim()] = value;
		}
		return {
			id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
			name,
			start: new Date(map.Start),
			end: new Date(map.End),
			tagline: map.Tagline || '',
		};
	}

	function formatTime(d: Date): string {
		return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
	}

	function weekdayShort(d: Date): string {
		return d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
	}

	let upcoming = $derived(
		events
			.filter((e) => e.end >= now)
			.sort((a, b) => a.start.getTime() - b.start.getTime())
	);

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
		fetch('/content/events.md')
			.then((r) => r.text())
			.then((t) => { events = parseEventsMd(t); })
			.catch(() => {});

		const interval = setInterval(() => { now = new Date(); }, 60000);
		return () => clearInterval(interval);
	});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div bind:this={element} role="link" tabindex="-1" class="card nav-card community-events-card"
	class:selected
	{onmouseenter}
	{onclick}>
	<p class="font-cook text-[16px] text-black m-0">UPCOMING COMMUNITY EVENTS</p>
	<div class="ce-banner"></div>
	<div class="ce-list">
		{#if upcoming.length === 0}
			<p class="font-bricolage text-[16px] text-black/50 m-0 px-2">No upcoming events.</p>
		{:else}
			{#each upcoming as event, i (event.id)}
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
						<p class="font-cook text-[20px] text-black leading-tight m-0">{event.name.toUpperCase()}</p>
						{#if event.tagline}
							<p class="font-bricolage text-[16px] text-black/70 m-0">{event.tagline.toUpperCase()}</p>
						{/if}
						<div class="ce-times">
							<span class="ce-time">{formatTime(event.start)}</span>
							<span class="ce-dash">&ndash;</span>
							<span class="ce-time">{formatTime(event.end)}</span>
						</div>
					</div>
				</button>
			{/each}
		{/if}
	</div>
	{#if selected && !postOnboarding}
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

	.ce-banner {
		width: 100%;
		height: 117px;
		border-radius: 8px;
		background-image: url('/event-bgs/orion-bg.png');
		background-size: cover;
		background-position: center;
		flex-shrink: 0;
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

	.ce-times {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.ce-time {
		background: rgba(0, 0, 0, 0.1);
		border-radius: 8px;
		padding: 2px 8px;
		font-family: 'Bricolage Grotesque', sans-serif;
		font-size: 16px;
		color: black;
	}

	.ce-dash {
		color: rgba(0, 0, 0, 0.4);
		font-family: 'Bricolage Grotesque', sans-serif;
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
