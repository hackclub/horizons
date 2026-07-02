<script lang="ts">
	import { scale } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import Markdown from './Markdown.svelte';
	import PulseDot from './PulseDot.svelte';
	import type { UserAnnouncement } from '$lib/store/announcementsCache';

	let {
		items,
		detail,
		onSelect,
		onBack,
		onClose,
	}: {
		items: UserAnnouncement[];
		detail: UserAnnouncement | null;
		onSelect: (id: number) => void;
		onBack: () => void;
		onClose: () => void;
	} = $props();

	// The card is one persistent frame; the inner rail slides between the inbox
	// (left) and detail (right) panes. `detailPane` retains the last announcement
	// so its content stays visible while sliding back to the list.
	let lastDetail = $state<UserAnnouncement | null>(null);
	$effect(() => {
		if (detail) lastDetail = detail;
	});
	const detailPane = $derived(detail ?? lastDetail);
	const showDetail = $derived(!!detail);

	function ordinal(n: number): string {
		const s = ['th', 'st', 'nd', 'rd'];
		const v = n % 100;
		return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
	}

	const dateStr = $derived.by(() => {
		if (!detailPane) return '';
		const d = new Date(detailPane.createdAt);
		if (isNaN(d.getTime())) return '';
		return `${d.toLocaleDateString('en-US', { month: 'long' })} ${ordinal(d.getDate())}, ${d.getFullYear()}`;
	});
</script>

<div
	class="pointer-events-none fixed inset-0 z-71 flex items-center justify-center p-6"
	role="dialog"
	aria-modal="true"
	aria-label="Announcements"
>
	<div
		class="pointer-events-auto relative h-[639px] max-h-[85vh] w-[471px] max-w-[92vw] overflow-hidden rounded-[20px] border-4 border-black bg-[#f3e8d8] shadow-[4px_4px_0px_0px_black]"
		transition:scale={{ start: 0.9, opacity: 0, duration: 260, easing: backOut }}
		data-announcement-modal
	>
		<!-- Fixed close — stays put while the inner panes slide. -->
		<button
			type="button"
			class="absolute right-5 top-5 z-10 flex cursor-pointer items-center text-black outline-none"
			aria-label="Close"
			onclick={onClose}
		>
			<svg
				class="size-5"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M18 6 6 18" />
				<path d="m6 6 12 12" />
			</svg>
		</button>

		<div
			class="flex h-full transition-transform duration-300 ease-out"
			style="width: 200%; transform: translateX({showDetail ? '-50%' : '0'});"
		>
			<!-- Inbox pane -->
			<section class="flex h-full w-1/2 shrink-0 flex-col p-4">
				<div class="flex shrink-0 items-center pb-3">
					<p class="m-0 font-cook text-[16px] text-black">ANNOUNCEMENTS</p>
									</div>
				<!-- A scroll container always clips visual overflow at its padding box, so the
				     corner-centered unread dot's pulse ring (reaches 12px past the item) needs
				     >12px padding to sit fully inside: px-4/pt-4 (16px) give 4px clearance.
				     Matching negative margins pull the box back so item layout is unchanged. -->
				<div
					class="-mx-4 -mt-3 flex flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pt-4 pb-2"
				>
					{#if items.length === 0}
						<p class="m-0 font-bricolage text-[16px] text-black/50">No announcements yet.</p>
					{:else}
						{#each items as a (a.announcementId)}
							<button
								type="button"
								class="relative flex cursor-pointer items-start gap-2 rounded-lg border border-black px-2 py-4 text-left transition-colors outline-none {a.isRead
									? 'bg-transparent hover:bg-black/5'
									: 'bg-[#e7dac6]'}"
								onclick={() => onSelect(a.announcementId)}
							>
								<div class="flex min-w-0 flex-1 flex-col gap-1">
									<p class="m-0 font-cook text-[12px] uppercase text-black">{a.title}</p>
									<p class="m-0 font-bricolage text-[16px] text-black">{a.previewText}</p>
								</div>
								<svg
									class="size-6 shrink-0 self-center text-black"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="M5 12h14" />
									<path d="m12 5 7 7-7 7" />
								</svg>
								{#if !a.isRead}
									<PulseDot size={12} class="absolute -right-1.5 -top-1.5" />
								{/if}
							</button>
						{/each}
					{/if}
				</div>
			</section>

			<!-- Detail pane (sized to Figma 2974-2363: p-20, gap-16, title 24px, date 20px) -->
			<section class="flex h-full w-1/2 shrink-0 flex-col p-5">
				<div class="flex shrink-0 items-center pb-2">
					<button
						type="button"
						class="flex cursor-pointer items-center text-black outline-none transition-opacity duration-300 {showDetail
							? 'opacity-100'
							: 'opacity-0'}"
						aria-label="Back to announcements"
						onclick={onBack}
						tabindex={showDetail ? 0 : -1}
					>
						<svg
							class="size-5"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M19 12H5" />
							<path d="m12 19-7-7 7-7" />
						</svg>
					</button>
				</div>
				{#if detailPane}
					<div class="flex flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden overscroll-contain">
						<div class="flex flex-col gap-1.5">
							<div class="flex flex-col">
								<p class="m-0 font-cook text-[24px] text-black">{detailPane.title}</p>
								{#if dateStr}
									<p class="m-0 font-bricolage text-[20px] text-[#363636]">{dateStr}</p>
								{/if}
							</div>
							{#if detailPane.events.length}
								<div class="flex flex-wrap gap-1.5">
									{#each detailPane.events as ev (ev.slug)}
										<span class="rounded-sm bg-[#1a140c] px-1.5 py-1 font-bricolage text-[12px] text-[#f3e8d8]">
											{ev.title}
										</span>
									{/each}
								</div>
							{/if}
						</div>
						<Markdown source={detailPane.body} />
					</div>
				{/if}
			</section>
		</div>
	</div>
</div>
