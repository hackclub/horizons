<script lang="ts">
	import InputPrompt from '$lib/components/InputPrompt.svelte';
	import { goto } from '$app/navigation';
	import { EXIT_DURATION } from '$lib';
	import { onMount } from 'svelte';
	import { createListNav } from '$lib/nav/wasd.svelte';

	let markdown = $state('');
	let entered = $state(false);
	let navigating = $state(false);

	interface Event {
		id: string;
		name: string;
		start: Date;
		end: Date;
		joinInfo: string;
		tagline: string;
		description: string;
	}

	let now = $state(new Date());
	let events: Event[] = $derived.by(() => parseMarkdownToEvents(markdown).filter(e => !isOver(e)));

	const nav = createListNav({
		count: () => events.length,
		wheel: 80,
		onEscape: () => goBack(),
	});

	let selectedEvent: Event | undefined = $derived(events[nav.selectedIndex]);

	function parseMarkdownToEvents(markdownStr: string): Event[] {
		const lines = markdownStr.split('\n');
		const eventList: Event[] = [];
		let currentName = '';
		let currentYaml = '';
		let currentDescription: string[] = [];
		let inYaml = false;

		for (const line of lines) {
			if (line.startsWith('## ')) {
				if (currentName) {
					eventList.push(parseEvent(currentName, currentYaml, currentDescription.join('\n').trim()));
				}
				currentName = line.replace('## ', '').trim();
				currentYaml = '';
				currentDescription = [];
				inYaml = false;
			} else if (line.startsWith('```yaml')) {
				inYaml = true;
			} else if (line === '```' && inYaml) {
				inYaml = false;
			} else if (inYaml) {
				currentYaml += line + '\n';
			} else if (currentName && line.trim()) {
				currentDescription.push(line);
			}
		}

		if (currentName) {
			eventList.push(parseEvent(currentName, currentYaml, currentDescription.join('\n').trim()));
		}

		return eventList;
	}

	function parseEvent(name: string, yamlStr: string, description: string): Event {
		const yaml = parseYaml(yamlStr);
		const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
		return {
			id,
			name,
			start: new Date(yaml.Start),
			end: new Date(yaml.End),
			joinInfo: yaml.JoinInfo || '',
			tagline: yaml.Tagline || '',
			description
		};
	}

	function parseYaml(yamlStr: string): Record<string, string> {
		const result: Record<string, string> = {};
		for (const line of yamlStr.split('\n')) {
			if (!line.trim()) continue;
			const [key, ...valueParts] = line.split(':');
			const value = valueParts.join(':').trim().replace(/^['"]|['"]$/g, '');
			if (key && value) result[key.trim()] = value;
		}
		return result;
	}

	function ordinal(n: number): string {
		const s = ['th', 'st', 'nd', 'rd'];
		const v = n % 100;
		return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
	}

	function isLive(event: Event): boolean {
		return now >= event.start && now <= event.end;
	}

	function isOver(event: Event): boolean {
		return now > event.end;
	}

	function formatDate(event: Event): string {
		const weekday = event.start.toLocaleDateString('en-US', { weekday: 'long' });
		const month = event.start.toLocaleDateString('en-US', { month: 'long' });
		const day = ordinal(event.start.getDate());
		return `${weekday}, ${month} ${day}`;
	}

	function formatTime(date: Date): string {
		return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
	}

	function parseMarkdownText(text: string): string {
		return text
			.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" class="underline hover:opacity-70">$1</a>')
			.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
			.replace(/\n/g, '<br />');
	}

	interface MonthGroup {
		label: string;
		events: Event[];
	}

	let monthGroups: MonthGroup[] = $derived.by(() => {
		const map = new Map<string, MonthGroup>();
		for (const event of events) {
			const key = `${event.start.getFullYear()}-${event.start.getMonth()}`;
			if (!map.has(key)) {
				map.set(key, {
					label: event.start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase(),
					events: []
				});
			}
			map.get(key)!.events.push(event);
		}
		return Array.from(map.values());
	});

	async function goBack() {
		if (navigating) return;
		navigating = true;
		await new Promise(resolve => setTimeout(resolve, EXIT_DURATION + 350));
		goto('/app?noanimate');
	}

	let scrollOffset = $state(0);
	let listEl = $state<HTMLDivElement | null>(null);
	let listClipEl = $state<HTMLDivElement | null>(null);
	let cardRefs: (HTMLElement | null)[] = $state([]);

	$effect(() => {
		const el = cardRefs[nav.selectedIndex];
		if (el && listEl && listClipEl) {
			const containerHeight = listClipEl.clientHeight;
			const cardTop = el.offsetTop;
			const cardHeight = el.offsetHeight;

			// Center the selected card in the visible area
			let offset = -(cardTop + cardHeight / 2 - containerHeight / 2);
			offset = Math.min(offset, 0);

			const listHeight = listEl.scrollHeight;
			if (listHeight > containerHeight) {
				offset = Math.max(offset, -(listHeight - containerHeight));
			}

			scrollOffset = offset;
		}
	});

	onMount(() => {
		requestAnimationFrame(() => requestAnimationFrame(() => { entered = true; }));
		fetch('/content/events.md').then(r => r.text()).then(t => { markdown = t; });

		const interval = setInterval(() => { now = new Date(); }, 60000);
		return () => clearInterval(interval);
	});
</script>

<svelte:window onkeydown={nav.handleKeydown} />

<div class="page-wrap">
	<div class="page-content">
		<!-- Back button (in flow) -->
		<button class="back-btn fly-top" class:entered class:exiting={navigating} style="--fly-delay: 0ms; --fly-exit-delay: 150ms;" onclick={goBack}>
			<InputPrompt type="ESC" />
			<span class="font-cook text-2xl font-semibold text-black">BACK</span>
		</button>

		<!-- Main Content Area -->
		<div class="content-area fly-top" class:entered class:exiting={navigating} style="--fly-delay: 150ms; --fly-exit-delay: 0ms;">
			<!-- Left Panel: Selected Event Detail -->
			<div class="card detail-panel">
				{#if selectedEvent}
					<div class="flex flex-col gap-2 w-full">
						<p class="font-cook text-[32px] text-black leading-tight m-0">{selectedEvent.name.toUpperCase()}</p>
						<div class="flex gap-2 items-center flex-wrap">
							<p class="font-bricolage text-[24px] font-semibold text-black m-0">
								{formatDate(selectedEvent)}
							</p>
							<div class="flex gap-2 items-center">
								<span class="time-box">{formatTime(selectedEvent.start)}</span>
								<span class="font-bricolage text-black/40">&ndash;</span>
								<span class="time-box">{formatTime(selectedEvent.end)}</span>
							</div>
						</div>
						{#if selectedEvent.tagline}
							<p class="font-bricolage text-[20px] text-black m-0">{selectedEvent.tagline.toUpperCase()}</p>
						{/if}
					</div>
					<div class="w-full h-0 border-t-2 border-black/20"></div>
					{#if selectedEvent.description}
						<p class="font-bricolage text-[20px] text-black leading-relaxed m-0">
							{@html parseMarkdownText(selectedEvent.description)}
						</p>
					{/if}
					{#if selectedEvent.joinInfo}
						<div class="font-bricolage text-[20px] text-black">
							{@html parseMarkdownText(selectedEvent.joinInfo)}
						</div>
					{/if}
					{#if isLive(selectedEvent)}
						<span class="live-badge"><span class="live-dot"></span>LIVE NOW</span>
					{/if}
				{:else}
					<p class="font-bricolage text-[20px] text-black/50 m-0">No upcoming events</p>
				{/if}
			</div>

			<!-- Right Panel: Scrollable Event List -->
			<div class="list-col">
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="list-clip" bind:this={listClipEl} onwheel={nav.handleWheel}>
				<div class="list-inner" bind:this={listEl} style="transform: translateY({scrollOffset}px)">
					<p class="font-cook text-[24px] text-black m-0 shrink-0">COMMUNITY EVENTS</p>
					{#each monthGroups as group}
						<p class="font-cook text-[16px] text-black/60 m-0 shrink-0">{group.label}</p>
						{#each group.events as event}
							{@const globalIndex = events.indexOf(event)}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<button
								bind:this={cardRefs[globalIndex]}
								class="event-card"
								class:selected={nav.selectedIndex === globalIndex}
								class:live={isLive(event)}
								onclick={() => nav.select(globalIndex)}
							>
								<div class="date-stamp">
									<p class="font-cook text-[36px] text-black leading-none m-0">{event.start.getDate()}</p>
									<p class="font-bricolage text-[16px] text-black m-0">
										{event.start.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
									</p>
								</div>
								<div class="flex flex-col gap-2 flex-1 min-w-0">
									<p class="font-cook text-[20px] text-black leading-tight m-0">{event.name.toUpperCase()}</p>
									{#if event.tagline}
										<p class="font-bricolage text-[20px] text-black m-0">{event.tagline.toUpperCase()}</p>
									{/if}
									<div class="flex gap-2 items-center">
										<span class="time-box">{formatTime(event.start)}</span>
										<span class="font-bricolage text-black/40">&ndash;</span>
										<span class="time-box">{formatTime(event.end)}</span>
									</div>
								</div>
								{#if isLive(event)}
									<span class="live-badge"><span class="live-dot"></span>LIVE</span>
								{/if}
							</button>
						{/each}
					{/each}
				</div>
				</div>
			</div>
		</div>

		<!-- Info Row -->
		<div class="info-row" class:exiting={navigating}>
			<div class="card info-card">
				<div class="flex items-center gap-5">
					<p class="font-cook text-[24px] font-semibold text-black m-0 shrink-0 leading-none">USE</p>
					<InputPrompt type="WS" />
					<p class="font-cook text-[24px] font-semibold text-black m-0 shrink-0 leading-none">OR</p>
					<InputPrompt type="mouse-scroll" />
					<p class="font-cook text-[24px] font-semibold text-black m-0 shrink-0 leading-none">TO NAVIGATE</p>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.page-wrap {
		position: absolute;
		inset: 0;
		overflow: hidden;
	}

	.page-content {
		display: flex;
		flex-direction: column;
		gap: 32px;
		width: 100%;
		height: 100%;
		padding: 32px;
	}

	/* Back button — in flow at top */
	.back-btn {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 20px;
		background-color: #f3e8d8;
		border: 4px solid black;
		border-radius: 20px;
		box-shadow: 4px 4px 0px 0px black;
		cursor: pointer;
		overflow: hidden;
		flex-shrink: 0;
		align-self: flex-start;
		transition: background-color var(--selected-duration) ease, transform var(--juice-duration) var(--juice-easing);
	}
	.back-btn:hover {
		background-color: #ffa936;
		transform: scale(var(--juice-scale));
	}

	/* Content — fills remaining space */
	.content-area {
		display: flex;
		gap: 32px;
		flex: 1;
		min-height: 0;
		width: 100%;
	}

	/* Card base */
	.card {
		border: 4px solid black;
		border-radius: 20px;
		box-shadow: 4px 4px 0px 0px black;
		overflow: hidden;
		background-color: #f3e8d8;
	}

	/* Left detail panel */
	.detail-panel {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 30px;
		overflow-y: auto;
	}

	/* Right column */
	.list-col {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-height: 0;
		height: 100%;
		overflow: visible;
	}

	.list-clip {
		flex: 1;
		min-height: 0;
		overflow: visible;
	}

	.list-inner {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 8px;
		transition: transform 0.4s cubic-bezier(0.25, 1, 0.5, 1);
	}

	/* Event list card */
	.event-card {
		display: flex;
		gap: 16px;
		align-items: center;
		padding: 30px;
		border: 4px solid black;
		border-radius: 20px;
		box-shadow: 4px 4px 0px 0px black;
		background-color: #f3e8d8;
		cursor: pointer;
		text-align: left;
		outline: none;
		flex-shrink: 0;
		transition: transform var(--juice-duration) var(--juice-easing),
		            box-shadow var(--juice-duration) var(--juice-easing),
		            background-color var(--selected-duration) ease;
	}

	.event-card.selected {
		background-color: #ffa936;
		transform: scale(var(--juice-scale));
		z-index: 10;
	}

	.event-card:not(.selected):hover {
		transform: scale(1.02);
	}

	.event-card.live {
		border-color: #e53e3e;
	}
	.event-card.live.selected {
		border-color: #e53e3e;
		box-shadow: 4px 4px 0px 0px #e53e3e;
	}

	/* Date stamp box */
	.date-stamp {
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

	/* Time pill */
	.time-box {
		background: rgba(0, 0, 0, 0.1);
		border-radius: 8px;
		padding: 4px 8px;
		font-family: 'Bricolage Grotesque', sans-serif;
		font-size: 20px;
		color: black;
	}

	/* Info row */
	.info-row {
		display: flex;
		align-items: stretch;
		width: 100%;
		flex-shrink: 0;
	}
	.info-row.exiting {
		animation: fly-out-bottom var(--exit-duration) var(--exit-easing) both;
	}

	.info-card {
		display: flex;
		align-items: center;
		padding: 20px;
		cursor: default;
	}

	/* Live badge */
	.live-badge {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.75rem;
		font-weight: 700;
		font-family: 'Bricolage Grotesque', sans-serif;
		color: #e53e3e;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.live-dot {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: #e53e3e;
		animation: pulse 1.4s ease-in-out infinite;
	}

	/* Animations */
	.fly-top {
		transform: translateX(120vw);
	}
	.fly-top.entered {
		transform: translateX(0);
		transition: transform var(--enter-duration) var(--enter-easing) var(--fly-delay, 0ms);
	}
	.fly-top.exiting {
		transform: translateX(120vw);
		transition: transform var(--exit-duration) var(--exit-easing) var(--fly-exit-delay, 0ms);
	}

	@keyframes fly-out-bottom {
		from { transform: translateY(0); }
		to   { transform: translateY(120vh); }
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50%       { opacity: 0.4; transform: scale(0.7); }
	}
</style>
