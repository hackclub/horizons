<script lang="ts">
	import { page } from '$app/stores';
	import { base } from '$app/paths';
	import { theme, toggleTheme } from '$lib/themeStore';
	import {
		Home,
		PlaySquare,
		FileText,
		FolderKanban,
		Users,
		ShoppingBag,
		Gift,
		ArrowRightLeft,
		Settings,
		PanelLeftClose,
		PanelLeftOpen,
		Moon,
		Sun
	} from 'lucide-svelte';

	type NavItem = {
		href: string;
		label: string;
		icon: typeof Home;
		tint?: 'accent' | 'settings';
	};

	type Props = {
		user?: { email?: string; name?: string } | null;
		collapsed?: boolean;
		class?: string;
	};

	let { user = null, collapsed = $bindable(false), class: className = '' }: Props = $props();

	const navItems: NavItem[] = [
		{ href: '/home', label: 'Home', icon: Home },
		{ href: '/review-select', label: 'Review', icon: PlaySquare, tint: 'accent' },
		{ href: '/submissions', label: 'Submissions', icon: FileText },
		{ href: '/projects', label: 'Projects', icon: FolderKanban },
		{ href: '/users', label: 'Users', icon: Users },
		{ href: '/shop', label: 'Shop', icon: ShoppingBag },
		{ href: '/giftcodes', label: 'Gift Codes', icon: Gift },
		{ href: '/events', label: 'Events', icon: ArrowRightLeft }
	];

	const settingsItem: NavItem = {
		href: '/settings',
		label: 'Org Settings',
		icon: Settings,
		tint: 'settings'
	};

	function isActive(href: string): boolean {
		const path = $page.url.pathname.replace(/^\/admin/, '');
		if (href === '/') return path === '' || path === '/';
		return path === href || path.startsWith(href + '/');
	}

	function displayName(): string {
		if (user?.name) return user.name;
		if (user?.email) return user.email.split('@')[0];
		return 'User';
	}

	function navItemClass(active: boolean, tint?: string): string {
		const base = 'border border-transparent';
		if (active) return base + ' border-ds-border! bg-ds-surface font-medium text-ds-text shadow-(--color-ds-shadow)';
		if (tint === 'accent') return base + ' border-ds-accent-bg! text-ds-accent hover:bg-ds-surface2';
		return base + ' text-ds-text-secondary hover:bg-ds-surface2';
	}
</script>

<aside
	class="sticky top-0 flex h-screen shrink-0 flex-col gap-3 overflow-clip border-r border-ds-border bg-ds-bg font-dm
		{collapsed ? 'w-[52px]' : 'w-[200px]'} {className}"
	style="transition: width 0.2s ease"
>
	<!-- Logo + collapse toggle -->
	<div class="flex items-center px-3 pb-2 pt-4 {collapsed ? 'justify-center' : 'justify-between'}">
		<img src="{base}/logos/horizons_admin_icon.svg" alt="Horizons" class="size-6" class:invert={$theme === 'dark'} />
		{#if !collapsed}
			<button
				class="rounded p-0.5 text-ds-text-placeholder hover:text-ds-text"
				onclick={() => (collapsed = true)}
				title="Collapse sidebar"
			>
				<PanelLeftClose size={16} />
			</button>
		{/if}
	</div>

	{#if collapsed}
		<div class="flex justify-center px-1">
			<button
				class="rounded p-1.5 text-ds-text-placeholder hover:text-ds-text"
				onclick={() => (collapsed = false)}
				title="Expand sidebar"
			>
				<PanelLeftOpen size={16} />
			</button>
		</div>
	{/if}

	<!-- Main navigation -->
	<nav class="flex flex-1 flex-col justify-between px-2 pb-1 {collapsed ? 'items-center' : ''}">
		<div class="flex flex-col gap-1.5 {collapsed ? 'items-center' : ''} w-full">
			{#each navItems as item}
				{@const active = isActive(item.href)}
				<a
					href="{base}{item.href}"
					class="flex items-center rounded-lg transition-[border-color,box-shadow,background-color] duration-200
						{collapsed ? 'justify-center p-2' : 'gap-1.5 p-2 text-xs'}
						{navItemClass(active, item.tint)}"
					title={collapsed ? item.label : undefined}
				>
					<item.icon size={16} />
					{#if !collapsed}
						<span>{item.label}</span>
					{/if}
				</a>
			{/each}
		</div>

		<!-- Settings (pinned to bottom of nav) -->
		<div class="flex flex-col gap-1.5 {collapsed ? 'items-center' : ''} w-full">
			<!-- Dark mode toggle -->
			<button
				class="flex items-center rounded-lg text-ds-text-placeholder hover:bg-ds-surface2 hover:text-ds-text
					{collapsed ? 'justify-center p-2' : 'gap-1.5 p-2 text-xs'}"
				onclick={toggleTheme}
				title={$theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
			>
				{#if $theme === 'dark'}
					<Sun size={16} />
					{#if !collapsed}<span>Light Mode</span>{/if}
				{:else}
					<Moon size={16} />
					{#if !collapsed}<span>Dark Mode</span>{/if}
				{/if}
			</button>

			<!-- Settings link -->
			<a
				href="{base}{settingsItem.href}"
				class="flex items-center rounded-lg border border-transparent transition-[border-color,box-shadow,background-color] duration-200
					{collapsed ? 'justify-center p-2' : 'gap-1.5 p-2 text-xs'}
					{isActive(settingsItem.href)
					? 'border-ds-border! bg-ds-surface font-medium text-ds-text shadow-(--color-ds-shadow)'
					: 'border-ds-settings-bg! text-ds-settings hover:bg-ds-surface2'}"
				title={collapsed ? settingsItem.label : undefined}
			>
				<settingsItem.icon size={16} />
				{#if !collapsed}
					<span>{settingsItem.label}</span>
				{/if}
			</a>
		</div>
	</nav>

	<!-- User info -->
	<div class="flex items-center border-t border-ds-border p-3 {collapsed ? 'justify-center' : ''}">
		<div class="flex items-center gap-1.5">
			<div class="flex size-5 shrink-0 items-center justify-center rounded-full bg-ds-border text-[10px] font-semibold text-ds-surface">
				{displayName().charAt(0).toUpperCase()}
			</div>
			{#if !collapsed}
				<span class="text-xs font-semibold text-ds-text-muted">{displayName()}</span>
			{/if}
		</div>
	</div>
</aside>
