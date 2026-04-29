<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { toasts, removeToast, type Toast } from '$lib/toastStore';

	function variantClass(t: Toast): string {
		switch (t.variant) {
			case 'success':
				return 'border-rv-green bg-rv-green text-white';
			case 'error':
				return 'border-rv-red bg-rv-red text-white';
			default:
				return 'border-rv-border bg-rv-surface text-rv-text';
		}
	}

	function iconPath(variant: Toast['variant']): string {
		switch (variant) {
			case 'success':
				return 'M5 13l4 4L19 7';
			case 'error':
				return 'M6 18L18 6M6 6l12 12';
			default:
				return 'M12 8v4m0 4h.01';
		}
	}
</script>

<div
	class="pointer-events-none fixed bottom-4 left-4 z-[100] flex flex-col gap-2"
	role="region"
	aria-live="polite"
	aria-label="Notifications"
>
	{#each $toasts as toast (toast.id)}
		<div
			in:fly={{ x: -20, duration: 180 }}
			out:fade={{ duration: 150 }}
			class="pointer-events-auto flex items-center gap-2 rounded-md border px-3 py-2 shadow-lg max-w-[360px] text-[13px] font-medium {variantClass(toast)}"
			role="status"
		>
			<svg
				class="w-4 h-4 shrink-0"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d={iconPath(toast.variant)} />
			</svg>
			<span class="flex-1">{toast.message}</span>
			<button
				onclick={() => removeToast(toast.id)}
				class="opacity-70 hover:opacity-100 cursor-pointer leading-none text-base"
				aria-label="Dismiss notification"
			>×</button>
		</div>
	{/each}
</div>
