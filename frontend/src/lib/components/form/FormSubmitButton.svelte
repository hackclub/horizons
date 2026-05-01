<script lang="ts">
	interface Props {
		label?: string;
		loadingLabel?: string;
		onclick: () => void;
		disabled?: boolean;
		loading?: boolean;
		blink?: boolean;
		class?: string;
		onfocus?: (event: FocusEvent) => void;
	}

	let {
		label = 'NEXT →',
		loadingLabel = 'SAVING...',
		onclick,
		disabled = false,
		loading = false,
		blink = false,
		class: customClass = '',
		onfocus,
	}: Props = $props();
</script>

<div class="flex items-center justify-center w-full">
	<button
		class="submit-btn bg-[#ffa936] border-2 border-black rounded-lg px-4 py-2 w-full max-w-[415px] font-bricolage text-base font-semibold text-black cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed {customClass}"
		class:blink
		type="button"
		{onclick}
		{onfocus}
		disabled={disabled || loading}
	>
		{loading ? loadingLabel : label}
	</button>
</div>

<style>
	.submit-btn {
		transition: transform var(--juice-duration) var(--juice-easing);
	}
	.submit-btn:hover {
		transform: scale(var(--juice-scale));
	}

	.blink {
		animation: white-blink 1.5s ease-in-out infinite;
	}

    @keyframes white-blink {
        0%, 100% { background-color: #fdd9a8; }
        50% { background-color: #fba74d; }
    }
</style>
