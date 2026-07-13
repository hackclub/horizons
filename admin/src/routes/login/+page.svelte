<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { api } from '$lib/api';
	import { ensureUser, clearUser, type CurrentUser } from '$lib/auth';
	import { theme } from '$lib/themeStore';

	const PRIVILEGED_ROLES = ['admin', 'superadmin', 'reviewer', 'event_viewer'];

	// 'checking' while the session resolves, 'signin' when logged out,
	// 'unauthorized' when signed in without a reviewer/admin role.
	let view = $state<'checking' | 'signin' | 'unauthorized'>('checking');
	let user = $state<CurrentUser | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);

	// Where to land after login. Relative same-origin paths only — the OAuth
	// callback enforces the same rule on its end.
	function nextPath(): string {
		const next = $page.url.searchParams.get('next');
		if (next && next.startsWith('/') && !next.startsWith('//')) return next;
		return `${base}/home`;
	}

	onMount(async () => {
		user = await ensureUser();
		if (user && PRIVILEGED_ROLES.includes(user.role)) {
			goto(nextPath());
			return;
		}
		view = user ? 'unauthorized' : 'signin';
	});

	async function signIn() {
		busy = true;
		error = null;
		try {
			const { data } = await api.GET('/api/user/auth/login', {
				params: { query: { redirect: nextPath() } },
			});
			if (data?.url) {
				window.location.href = data.url;
				return;
			}
			error = 'Could not start login — please try again.';
		} catch {
			error = 'Could not start login — please try again.';
		} finally {
			busy = false;
		}
	}

	async function switchAccount() {
		busy = true;
		try {
			await api.POST('/api/user/auth/logout', {});
		} catch {
			// Session may already be dead server-side — signing in again is
			// still the right next step.
		} finally {
			clearUser();
			user = null;
			view = 'signin';
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Horizons — Admin Login</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-rv-bg px-6 font-[Inter,sans-serif] text-rv-text">
	<div class="w-full max-w-sm rounded-xl border border-rv-border bg-rv-surface p-8">
		<div class="mb-6 flex flex-col items-center gap-3 text-center">
			<img src="{base}/logos/horizons_admin_icon.svg" alt="" class="size-10" class:invert={$theme === 'dark'} />
			<div>
				<h1 class="text-xl font-semibold">Horizons Admin</h1>
				<p class="mt-1 text-sm text-rv-dim">Reviewer &amp; admin dashboard</p>
			</div>
		</div>

		{#if view === 'checking'}
			<p class="text-center text-sm text-rv-dim">Checking session…</p>
		{:else if view === 'signin'}
			<button
				class="w-full rounded-lg bg-rv-accent px-4 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
				onclick={signIn}
				disabled={busy}
			>
				{busy ? 'Redirecting…' : 'Sign in with Hack Club'}
			</button>
			{#if error}
				<p class="mt-3 text-center text-sm text-rv-red">{error}</p>
			{/if}
		{:else}
			<div class="flex flex-col gap-4">
				<p class="text-center text-sm leading-relaxed text-rv-dim">
					{#if user?.email}
						<span class="text-rv-text">{user.email}</span> doesn't have reviewer or admin access.
					{:else}
						This account doesn't have reviewer or admin access.
					{/if}
				</p>
				<button
					class="w-full rounded-lg border border-rv-border bg-rv-surface2 px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-rv-border disabled:opacity-50"
					onclick={switchAccount}
					disabled={busy}
				>
					{busy ? 'Signing out…' : 'Sign in with a different account'}
				</button>
				<a href="/" class="text-center text-sm text-rv-dim underline hover:text-rv-text">
					Go to Horizons
				</a>
			</div>
		{/if}
	</div>
</div>
