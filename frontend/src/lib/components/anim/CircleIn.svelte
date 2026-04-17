<script lang="ts" module>
    let hasPlayed = false;
</script>

<script lang="ts">
    import { onMount } from 'svelte';

    interface Props {
        class?: string;
    }

    let { class: className = '' }: Props = $props();
    let shouldAnimate = $state(!hasPlayed);

    onMount(() => {
        hasPlayed = true;
    });
</script>

{#if shouldAnimate}
<div class="trans-am {className}">
    <div class="circle"></div>
</div>
{/if}

<style>
    .trans-am {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 100;
        overflow: hidden;
    }

    .circle {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        border-radius: 50%;
        box-shadow: 0 0 0 100vmax black;
        animation: reveal 1s ease-out forwards;
        animation-delay: 100ms;
    }

    @keyframes reveal {
        0% {
            width: 0;
            height: 0;
        }
        100% {
            width: 300vmax;
            height: 300vmax;
        }
    }
</style>
