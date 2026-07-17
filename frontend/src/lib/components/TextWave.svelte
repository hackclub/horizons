<script lang="ts">
	interface Props {
		text: string;
		duration?: number;
		delay?: number;
		amplitude?: number;
		disabled?: boolean;
		offset?: number;
	}

	let { text, duration = 2, delay = 0.04, amplitude = 2, disabled = false, offset = 0 }: Props = $props();

	// Group characters into words, preserving each char's global index for wave timing
	function getWordGroups(t: string): { char: string; i: number }[][] {
		const groups: { char: string; i: number }[][] = [];
		let current: { char: string; i: number }[] = [];
		for (let i = 0; i < t.length; i++) {
			if (t[i] === ' ') {
				if (current.length > 0) {
					groups.push(current);
					current = [];
				}
			} else {
				current.push({ char: t[i], i });
			}
		}
		if (current.length > 0) groups.push(current);
		return groups;
	}

	const wordGroups = $derived(getWordGroups(text));
</script>

<span class="textwave" class:disabled>
	{#each wordGroups as word, wi}
		{#if wi > 0}{' '}{/if}<span class="wave-word">{#each word as { char, i }}<span
					class="wave-char"
					style="--wave-delay: {(i + offset) * delay}s; --wave-duration: {duration}s; --wave-amplitude: {amplitude}px"
				>{char}</span>{/each}</span>
	{/each}
</span>

<style>
	.textwave {
		display: inline;
	}

	.wave-word {
		display: inline-block;
		white-space: nowrap;
	}

	.wave-char {
		display: inline-block;
		animation: wave var(--wave-duration) ease-in-out infinite;
		animation-delay: var(--wave-delay);
	}

	.disabled .wave-char {
		animation: none;
	}

	/* Reduce Animations: per-character bobbing is exactly the kind of
	   perpetual micro-motion the setting exists to remove — off entirely. */
	:global(html.reduce-anim) .wave-char {
		animation: none;
	}

	@keyframes wave {
		0%, 100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(calc(-1 * var(--wave-amplitude)));
		}
	}
</style>
