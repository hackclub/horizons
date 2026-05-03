<script lang="ts">
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		markdown?: string;
	}

	const { markdown = '' }: Props = $props();

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
	let openEventId = $state<string | null>(null);

	let events: Event[] = $derived.by(() => parseMarkdownToEvents(markdown).filter(e => !isOver(e)));
	let openEvent: Event | null = $derived(events.find(e => e.id === openEventId) ?? null);

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

	function isSameDay(date1: Date, date2: Date): boolean {
		return (
			date1.getFullYear() === date2.getFullYear() &&
			date1.getMonth() === date2.getMonth() &&
			date1.getDate() === date2.getDate()
		);
	}

	interface DateDisplay {
		startPrefix: string;
		startBox: string;
		endPrefix: string;
		endBox: string;
	}

	function ordinal(n: number): string {
		const s = ['th', 'st', 'nd', 'rd'];
		const v = n % 100;
		// 11th, 12th, 13th are exceptions — everything else follows the last digit
		return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
	}

	function getDateDisplay(event: Event): DateDisplay {
		const sameMonth =
			event.start.getMonth() === event.end.getMonth() &&
			event.start.getFullYear() === event.end.getFullYear();

		const startTime = event.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
		const endTime = event.end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
		const startMonth = event.start.toLocaleDateString('en-US', { month: 'short' });
		const endMonth = event.end.toLocaleDateString('en-US', { month: 'short' });
		const startOrd = ordinal(event.start.getDate());
		const endOrd = ordinal(event.end.getDate());

		if (isSameDay(event.start, event.end)) {
			// Date is shared — show outside, box only the times
			// "Jun 19th," [5:00 AM] – [2:00 PM]
			return {
				startPrefix: `${startMonth} ${startOrd},`,
				startBox: startTime,
				endPrefix: '',
				endBox: endTime
			};
		} else if (sameMonth) {
			// Month shared — show outside, box day+time for each
			// "Jun" [10th, 10:00 AM] – [12th, 5:00 PM]
			return {
				startPrefix: startMonth,
				startBox: `${startOrd}, ${startTime}`,
				endPrefix: '',
				endBox: `${endOrd}, ${endTime}`
			};
		} else {
			// Nothing shared — month outside each box
			// "Jun" [28th, 9:00 AM] – "Jul" [2nd, 6:00 PM]
			return {
				startPrefix: startMonth,
				startBox: `${startOrd}, ${startTime}`,
				endPrefix: endMonth,
				endBox: `${endOrd}, ${endTime}`
			};
		}
	}

	interface MonthGroup {
		label: string;
		events: Event[];
	}

	function isLive(event: Event): boolean {
		return now >= event.start && now <= event.end;
	}

	function isOver(event: Event): boolean {
		return now > event.end;
	}

	let monthGroups: MonthGroup[] = $derived.by(() => {
		const map = new Map<string, MonthGroup>();
		for (const event of events) {
			const key = `${event.start.getFullYear()}-${event.start.getMonth()}`;
			if (!map.has(key)) {
				map.set(key, {
					label: event.start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
					events: []
				});
			}
			map.get(key)!.events.push(event);
		}
		return Array.from(map.values());
	});

	// Row time display: start day is already shown in the left stamp,
	// so start box is just the time; end box includes the day if it differs.
	function getRowTimes(event: Event): { startBox: string; endBox: string } {
		const sameMonth =
			event.start.getMonth() === event.end.getMonth() &&
			event.start.getFullYear() === event.end.getFullYear();

		const startTime = event.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
		const endTime = event.end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

		if (isSameDay(event.start, event.end)) {
			return { startBox: startTime, endBox: endTime };
		} else if (sameMonth) {
			return { startBox: startTime, endBox: `${ordinal(event.end.getDate())}, ${endTime}` };
		} else {
			const endMonth = event.end.toLocaleDateString('en-US', { month: 'short' });
			return { startBox: startTime, endBox: `${endMonth} ${ordinal(event.end.getDate())}, ${endTime}` };
		}
	}

	function parseMarkdownText(text: string): string {
		return text
			.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" class="underline hover:opacity-70">$1</a>')
			.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
			.replace(/\n/g, '<br />');
	}

	function openCard(eventId: string) {
		openEventId = eventId;
	}

	function closeCard() {
		openEventId = null;
	}

	function handleKeydown(ev: KeyboardEvent) {
		if (ev.key === 'Escape') closeCard();
	}

	onMount(() => {
		const interval = setInterval(() => { now = new Date(); }, 60000);
		return () => clearInterval(interval);
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Event detail modal -->
{#if openEvent}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center"
		role="button" tabindex="-1"
		onclick={closeCard}
		style="animation: fade-in 0.2s ease both"
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="bg-[#f3e8d8] border-4 border-black rounded-[20px] shadow-[8px_8px_0px_0px_black] flex flex-col"
			style="width: min(600px, calc(100vw - 3rem)); animation: scale-in 0.25s cubic-bezier(0.22,1,0.36,1) both"
			role="dialog" aria-modal="true" tabindex="0"
			onclick={ev => ev.stopPropagation()}
		>
			<!-- Header bar -->
			<div class="flex items-start justify-between gap-4 p-7">
				<div class="flex-1 min-w-0">
					<h2 class="font-cook text-black leading-tight m-0" style="font-size: clamp(1.75rem, 5vw, 2.5rem); letter-spacing: 0.06em">
						{openEvent.name}
					</h2>
					<p class="font-bricolage text-black/60 text-base mt-1 m-0 leading-snug">
						{@html parseMarkdownText(openEvent.tagline)}
					</p>
				</div>
				<button
					class="shrink-0 w-9 h-9 bg-black text-[#f3e8d8] rounded-full border-2 border-black flex items-center justify-center font-bricolage font-bold text-sm cursor-pointer hover:opacity-70 transition-opacity"
					onclick={closeCard} aria-label={m.comp_events_close()}
				>✕</button>
			</div>

			<!-- Date strip -->
			<div class="mx-7 border-t-2 border-black pt-4 pb-4 flex flex-wrap items-center gap-2 font-bricolage font-semibold text-sm">
				{#if true}
					{@const d = getDateDisplay(openEvent)}
					<span class="text-black/50">{d.startPrefix}</span>
					<span class="date-box">{d.startBox}</span>
					<span class="text-black/40">–</span>
					{#if d.endPrefix}<span class="text-black/50">{d.endPrefix}</span>{/if}
					<span class="date-box">{d.endBox}</span>
				{/if}
				{#if isLive(openEvent)}
					<span class="live-badge"><span class="live-dot"></span>{m.comp_events_live_now()}</span>
				{/if}
			</div>

			<!-- Body -->
			{#if openEvent.description || openEvent.joinInfo}
				<div class="mx-7 mb-7 flex flex-col gap-4 border-t-2 border-black pt-4">
					{#if openEvent.description}
						<p class="font-bricolage text-black/70 text-sm leading-relaxed m-0">
							{@html parseMarkdownText(openEvent.description)}
						</p>
					{/if}
					{#if openEvent.joinInfo}
						<div class="font-bricolage font-semibold text-sm text-black border-t border-black/20 pt-3">
							{@html parseMarkdownText(openEvent.joinInfo)}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}

<!-- Schedule list -->
<div class="w-full flex flex-col items-center pb-12 px-4">
	<div class="w-full" style="max-width: 740px">
		<h1 class="font-cook text-black tracking-widest text-center mb-12" style="font-size: 3rem">
			{m.comp_events_community_events()}
		</h1>

		<div class="flex flex-col gap-10">
			{#each monthGroups as group, gi (group.label)}
				<div class="flex flex-col gap-3">
					<!-- Month header -->
					<div class="flex items-center gap-4">
						<span class="font-cook text-black/40 text-sm tracking-[0.2em] uppercase shrink-0">
							{group.label}
						</span>
						<div class="flex-1 h-0.75 bg-black rounded-full"></div>
					</div>

					<!-- Event cards -->
					{#each group.events as event, i (event.id)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<button
							id={event.id}
							class="event-card w-full bg-[#f3e8d8] border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] p-5 text-left cursor-pointer outline-none"
							class:live={isLive(event)}
							style="--card-index: {gi * 10 + i}"
							onclick={() => openCard(event.id)}
							aria-label={m.comp_events_view_details({ name: event.name })}
						>
							<div class="flex items-stretch gap-4">
								<!-- Day stamp -->
								<div class="shrink-0 text-center border-r-2 border-black pr-4 flex flex-col justify-center" style="min-width: 3rem">
									<div class="font-cook text-black leading-none" style="font-size: 2rem">{event.start.getDate()}</div>
									<div class="font-bricolage text-black/40 text-xs uppercase tracking-widest mt-0.5">
										{event.start.toLocaleDateString('en-US', { weekday: 'short' })}
									</div>
								</div>

								<!-- Name + tagline -->
								<div class="flex-1 min-w-0">
									<p class="font-cook text-black m-0 leading-tight" style="font-size: 1.25rem; letter-spacing: 0.04em">
										{event.name}
									</p>
									<p class="font-bricolage text-black/55 text-sm m-0 mt-1 truncate">
										{@html parseMarkdownText(event.tagline)}
									</p>
								</div>

								<!-- Times -->
								<div class="shrink-0 flex flex-col items-end gap-1 font-bricolage font-semibold text-xs">
									{#if true}
										{@const times = getRowTimes(event)}
										<div class="flex items-center gap-1.5">
											<span class="date-box">{times.startBox}</span>
											<span class="text-black/40">–</span>
											<span class="date-box">{times.endBox}</span>
										</div>
									{/if}
									{#if isLive(event)}
										<span class="live-badge"><span class="live-dot"></span>{m.comp_events_live()}</span>
									{/if}
								</div>
							</div>
						</button>
					{/each}
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	/* Staggered slide-in matching the project cards */
	@keyframes card-enter {
		from { transform: translateX(-120vw); }
		to   { transform: translateX(0); }
	}
	.event-card {
		animation: card-enter var(--enter-duration) var(--enter-easing) both;
		animation-delay: calc(var(--card-index, 0) * 60ms);
		transition: transform var(--juice-duration) var(--juice-easing),
		            box-shadow var(--juice-duration) var(--juice-easing);
	}
	.event-card:hover {
		transform: translateY(-3px);
		box-shadow: 6px 8px 0px 0px black;
	}
	.event-card.live {
		border-color: #e53e3e;
		box-shadow: 4px 4px 0px 0px #e53e3e;
	}

	.date-box {
		background: #e8d5bb;
		border-radius: 0.3rem;
		padding: 0.1rem 0.4rem;
		color: rgba(0,0,0,0.85);
		font-weight: 600;
	}

	.live-badge {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.65rem;
		font-weight: 700;
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
	@keyframes pulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50%       { opacity: 0.4; transform: scale(0.7); }
	}

	@keyframes fade-in {
		from { opacity: 0; }
		to   { opacity: 1; }
	}
	@keyframes scale-in {
		from { opacity: 0; transform: scale(0.96); }
		to   { opacity: 1; transform: scale(1); }
	}
</style>
