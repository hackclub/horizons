<script lang="ts">
	import InputPrompt from '$lib/components/InputPrompt.svelte';
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		onclick: () => void;
	}

	let { onclick }: Props = $props();
</script>

<button class="back-btn absolute left-8 top-13 z-5 flex items-center gap-2.5 p-5 bg-[#f3e8d8] border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] cursor-pointer overflow-hidden" {onclick}>
	<InputPrompt type="ESC" />
	<span class="font-cook text-2xl font-semibold text-black">{m.comp_form_backbtn_label()}</span>
</button>

<style>
	.back-btn {
		transition:
			background-color var(--selected-duration) ease,
			transform var(--juice-duration) var(--juice-easing);
	}
	.back-btn:hover {
		background-color: #ffa936;
		transform: scale(var(--juice-scale));
	}
</style>
