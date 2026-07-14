<script lang="ts">
	import { tick, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { api, type components } from '$lib/api';
	import { currentUser } from '$lib/auth';
	import { cachedGet } from '$lib/swr';
	import { matchesScopedQuery } from '$lib/search';
	import Highlight from './Highlight.svelte';
	import { Search, CornerDownLeft, ArrowLeft, ArrowRight, ArrowUp, ArrowDown } from 'lucide-svelte';

	type AdminProject = components['schemas']['AdminProjectListItemResponse'];
	type AdminUser = components['schemas']['AdminUserResponse'];

	// The ledger endpoint has no exported item schema, so mirror the shape the
	// transactions page uses for the fields we search/display.
	type LedgerEntry = {
		transactionId: number;
		itemDescription: string;
		cost: number;
		user: { email: string; firstName: string; lastName: string; slackUserId: string | null };
		item: { name: string } | null;
		event: { slug: string; title: string } | null;
	};

	// A normalized, type-agnostic result row the template renders.
	type Result = { key: string; title: string; subtitle: string; href: string };

	type EntityKey = 'projects' | 'users' | 'transactions';
	type EntityType = {
		key: EntityKey;
		label: string;
		placeholder: string;
		// Tailwind classes for the active pill, keyed off the app's ds tokens so
		// the palette tracks light/dark like the rest of the dash.
		activeClass: string;
	};

	const TYPES: EntityType[] = [
		{
			key: 'projects',
			label: 'Project',
			placeholder: 'Look up a project',
			activeClass: 'border-ds-green/50 bg-ds-green-bg text-ds-green',
		},
		{
			key: 'users',
			label: 'Users',
			placeholder: 'Look up a user',
			activeClass: 'border-ds-accent/50 bg-ds-accent-bg text-ds-accent',
		},
		{
			key: 'transactions',
			label: 'Transactions',
			placeholder: 'Look up a transaction',
			activeClass: 'border-ds-settings/50 bg-ds-settings-bg text-ds-settings',
		},
	];

	const MAX_RESULTS = 8;

	// Only admins can hit /api/admin/* — reviewers/event-viewers share this
	// layout, so the palette is inert for them (Cmd+K does nothing).
	let enabled = $derived(
		$currentUser?.role === 'admin' || $currentUser?.role === 'superadmin',
	);

	let open = $state(false);
	let query = $state('');
	let typeIndex = $state(0);
	let selected = $state(0);
	let inputEl = $state<HTMLInputElement | null>(null);
	let listEl = $state<HTMLDivElement | null>(null);

	let activeType = $derived(TYPES[typeIndex]);

	// Loaded datasets, filtered client-side. Users are searched server-side
	// (the endpoint is paginated) so they live in their own state.
	let projects = $state<AdminProject[]>([]);
	let transactions = $state<LedgerEntry[]>([]);
	let users = $state<AdminUser[]>([]);
	let loading = $state(false);

	function fullName(u: { firstName?: string | null; lastName?: string | null }): string {
		return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || 'Unknown';
	}

	async function loadProjects() {
		const data = await cachedGet<AdminProject[]>(
			'cmdk:projects',
			async () => (await api.GET('/api/admin/projects')).data ?? [],
			{ maxAgeMs: 60_000 },
		);
		projects = data;
	}

	async function loadTransactions() {
		const data = await cachedGet<LedgerEntry[]>(
			'cmdk:transactions',
			async () =>
				((await api.GET('/api/admin/transactions')).data?.entries ?? []) as LedgerEntry[],
			{ maxAgeMs: 60_000 },
		);
		transactions = data;
	}

	// Server-side user search, debounced + sequenced so a slow response can't
	// clobber a newer query's results.
	let userSearchTimer: ReturnType<typeof setTimeout> | null = null;
	let userSearchSeq = 0;
	async function searchUsers(q: string) {
		const seq = ++userSearchSeq;
		if (!q.trim()) {
			users = [];
			return;
		}
		loading = true;
		try {
			const { data } = await api.GET('/api/admin/users', {
				params: { query: { page: 1, limit: MAX_RESULTS, q: q.trim() } },
			});
			if (seq !== userSearchSeq) return;
			users = data?.users ?? [];
		} finally {
			if (seq === userSearchSeq) loading = false;
		}
	}

	// Kick off the fetch a newly-active type needs. Cached, so switching back and
	// forth is instant after the first load.
	function ensureData(key: EntityKey) {
		if (key === 'projects') void loadProjects();
		else if (key === 'transactions') void loadTransactions();
		else scheduleUserSearch();
	}

	function scheduleUserSearch() {
		if (userSearchTimer) clearTimeout(userSearchTimer);
		const q = query;
		userSearchTimer = setTimeout(() => searchUsers(q), 180);
	}

	// Re-run whichever fetch the active type + query needs. Client-filtered types
	// (projects, transactions) need no refetch on keystroke; users do.
	$effect(() => {
		query;
		if (open && activeType.key === 'users') scheduleUserSearch();
	});

	const results = $derived.by<Result[]>(() => {
		if (!open) return [];
		const type = activeType.key;
		if (type === 'projects') {
			if (!query.trim()) return [];
			return projects
				.filter((p) =>
					matchesScopedQuery(
						{
							all: [
								p.projectTitle,
								fullName(p.user),
								p.user.email,
								p.user.slackUserId ?? '',
								p.description ?? '',
								p.repoUrl ?? '',
								p.playableUrl ?? '',
								`${p.projectId} #${p.projectId} ${p.joeProjectId ?? ''}`,
								(p.airtableRecIds ?? []).join(' '),
							].join('\n'),
						},
						'all',
						query,
					),
				)
				.slice(0, MAX_RESULTS)
				.map((p) => ({
					key: `p${p.projectId}`,
					title: p.projectTitle,
					subtitle: `${fullName(p.user)} · ${p.user.email} · #${p.projectId}`,
					href: `${base}/projects/${p.projectId}`,
				}));
		}
		if (type === 'transactions') {
			if (!query.trim()) return [];
			return transactions
				.filter((e) =>
					matchesScopedQuery(
						{
							all: [
								e.user.email,
								fullName(e.user),
								e.user.slackUserId ?? '',
								e.itemDescription,
								e.event?.slug ?? '',
								e.event?.title ?? '',
								e.item?.name ?? '',
								String(e.transactionId),
							].join('\n'),
						},
						'all',
						query,
					),
				)
				.slice(0, MAX_RESULTS)
				.map((e) => ({
					key: `t${e.transactionId}`,
					title: e.itemDescription,
					subtitle: `${fullName(e.user)} · ${e.user.email} · #${e.transactionId}`,
					href: `${base}/transactions?q=${e.transactionId}`,
				}));
		}
		// users — already filtered server-side (matches Slack display name too)
		return users.slice(0, MAX_RESULTS).map((u) => ({
			key: `u${u.userId}`,
			title: fullName(u),
			subtitle: [
				u.email,
				u.slackUsername ? `@${u.slackUsername}` : null,
				u.slackUserId,
			]
				.filter(Boolean)
				.join(' · '),
			href: `${base}/users?q=${encodeURIComponent(u.email)}`,
		}));
	});

	// Clamp the highlighted row whenever the result set shrinks.
	$effect(() => {
		if (selected >= results.length) selected = Math.max(0, results.length - 1);
	});

	async function openPalette() {
		if (!enabled) return;
		open = true;
		selected = 0;
		ensureData(activeType.key);
		await tick();
		inputEl?.focus();
		inputEl?.select();
	}

	function closePalette() {
		open = false;
		query = '';
		selected = 0;
	}

	function switchType(delta: number) {
		typeIndex = (typeIndex + delta + TYPES.length) % TYPES.length;
		selected = 0;
		ensureData(activeType.key);
	}

	function moveSelection(delta: number) {
		if (results.length === 0) return;
		selected = (selected + delta + results.length) % results.length;
		scrollSelectedIntoView();
	}

	async function scrollSelectedIntoView() {
		await tick();
		listEl?.querySelector<HTMLElement>(`[data-idx="${selected}"]`)?.scrollIntoView({
			block: 'nearest',
		});
	}

	function activate(result: Result | undefined) {
		if (!result) return;
		closePalette();
		void goto(result.href);
	}

	function atStart(): boolean {
		return inputEl?.selectionStart === 0 && inputEl?.selectionEnd === 0;
	}
	function atEnd(): boolean {
		const len = query.length;
		return inputEl?.selectionStart === len && inputEl?.selectionEnd === len;
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
			e.preventDefault();
			if (open) closePalette();
			else void openPalette();
			return;
		}
		if (open && e.key === 'Escape') {
			e.preventDefault();
			closePalette();
		}
	}

	// Capture phase so the shortcut fires before any element-level handler can
	// swallow it (e.g. modals that stopPropagation on keydown, focused inputs).
	// A bubbling <svelte:window> handler misses those — this makes Cmd/Ctrl+K
	// work on every page regardless of what has focus.
	onMount(() => {
		window.addEventListener('keydown', onWindowKeydown, { capture: true });
		return () => window.removeEventListener('keydown', onWindowKeydown, { capture: true });
	});

	function onInputKeydown(e: KeyboardEvent) {
		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				moveSelection(1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				moveSelection(-1);
				break;
			case 'Enter':
				e.preventDefault();
				activate(results[selected]);
				break;
			case 'Tab':
				e.preventDefault();
				switchType(e.shiftKey ? -1 : 1);
				break;
			// Left/right switch entity type — but only at the text boundaries so
			// they still position the caret while editing a query.
			case 'ArrowLeft':
				if (atStart()) {
					e.preventDefault();
					switchType(-1);
				}
				break;
			case 'ArrowRight':
				if (atEnd()) {
					e.preventDefault();
					switchType(1);
				}
				break;
		}
	}
</script>

{#if open}
	<!-- Backdrop: a click that lands on it (not on the palette within) dismisses. -->
	<div
		class="fixed inset-0 z-50 flex justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) closePalette();
		}}
	>
		<div
			class="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-ds-border bg-ds-surface font-dm shadow-[var(--color-ds-shadow-popout)]"
			role="dialog"
			aria-modal="true"
			aria-label="Search"
			tabindex="-1"
		>
			<!-- Search input -->
			<div class="flex items-center gap-3 border-b border-ds-border-divider px-4 py-3.5">
				<Search class="h-5 w-5 shrink-0 text-ds-text-tertiary" />
				<input
					bind:this={inputEl}
					bind:value={query}
					onkeydown={onInputKeydown}
					placeholder={activeType.placeholder}
					spellcheck="false"
					autocomplete="off"
					class="w-full bg-transparent text-lg text-ds-text placeholder:text-ds-text-placeholder focus:outline-none"
				/>
			</div>

			<!-- Type pills -->
			<div class="flex items-center gap-2 border-b border-ds-border-divider px-4 py-2.5">
				{#each TYPES as type, i (type.key)}
					<button
						type="button"
						onclick={() => {
							typeIndex = i;
							selected = 0;
							ensureData(type.key);
							inputEl?.focus();
						}}
						class="rounded-md border px-2 py-0.5 text-sm transition-colors cursor-pointer {i ===
						typeIndex
							? type.activeClass
							: 'border-ds-border text-ds-text-secondary hover:bg-ds-surface2'}"
					>
						{type.label}
					</button>
				{/each}
			</div>

			<!-- Results -->
			<div bind:this={listEl} class="min-h-0 flex-1 overflow-y-auto p-2">
				{#if results.length > 0}
					{#each results as result, i (result.key)}
						<button
							type="button"
							data-idx={i}
							onclick={() => activate(result)}
							onmousemove={() => (selected = i)}
							class="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-colors cursor-pointer {i ===
							selected
								? 'bg-ds-surface2'
								: 'hover:bg-ds-surface2/60'}"
						>
							<span class="w-full truncate text-sm font-medium text-ds-text">
								<Highlight text={result.title} {query} />
							</span>
							<span class="w-full truncate text-xs text-ds-text-secondary">
								<Highlight text={result.subtitle} {query} />
							</span>
						</button>
					{/each}
				{:else}
					<div class="px-3 py-10 text-center text-sm text-ds-text-tertiary">
						{#if loading}
							Searching…
						{:else if query.trim()}
							No {activeType.label.toLowerCase()} results for “{query.trim()}”
						{:else}
							Start typing to search {activeType.label.toLowerCase()}
						{/if}
					</div>
				{/if}
			</div>

			<!-- Footer hints -->
			<div
				class="flex items-center gap-4 border-t border-ds-border-divider px-4 py-2 text-xs text-ds-text-tertiary"
			>
				<span class="flex items-center gap-1">
					<ArrowUp class="h-3.5 w-3.5" /><ArrowDown class="h-3.5 w-3.5" /> select
				</span>
				<span class="flex items-center gap-1">
					<ArrowLeft class="h-3.5 w-3.5" /><ArrowRight class="h-3.5 w-3.5" /> switch type
				</span>
				<span class="flex items-center gap-1">
					<CornerDownLeft class="h-3.5 w-3.5" /> open
				</span>
				<span class="ml-auto">esc to close</span>
			</div>
		</div>
	</div>
{/if}
