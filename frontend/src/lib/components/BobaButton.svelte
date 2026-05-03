<script lang="ts">
    import type { HTMLButtonAttributes } from 'svelte/elements';
    import BobaText from './BobaText.svelte';
    import { m } from '$lib/paraglide/messages.js';

    interface Props extends HTMLButtonAttributes {
        text?: string;
        fontSize?: number;
        className?: string;
        pressed?: boolean;
        blink?: boolean;
        wave?: boolean;
        fallbackWidth?: number;
        disableAnimations?: boolean;
        textColor?: string;
    }

    let { text, fontSize = 32, fallbackWidth = 0, pressed = false, blink = true, wave = false, className = "", disableAnimations = false, textColor = undefined, ...rest }: Props = $props();
    const resolvedText = $derived(text ?? m.comp_boba_press_enter());

    let buttonEl: HTMLButtonElement;

    export function click() {
        buttonEl?.click();
    }
</script>

<button bind:this={buttonEl} class="boba-container {className}" class:blink={blink && !disableAnimations} {...rest}>
    <BobaText text={resolvedText} {fontSize} {wave} {pressed} {disableAnimations} {textColor} />
</button>

<style>
    .boba-container {
        display: inline-block;
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
    }

    .boba-container.blink {
        animation: blink 1s ease-in-out infinite;
    }

    .boba-container.blink:active,
    .boba-container.blink.pressed {
        animation: none;
    }

    @keyframes blink {
        0%, 100% {
            opacity: 1;
        }
        50% {
            opacity: 0.4;
        }
    }
</style>
