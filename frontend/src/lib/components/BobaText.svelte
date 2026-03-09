<script lang="ts">
    import { onMount } from 'svelte';

    interface Props {
        text?: string;
        fontSize?: number;
        wave?: boolean;
        pressed?: boolean;
        disableAnimations?: boolean;
    }

    let { text = ">PRESS ENTER", fontSize = 32, wave = false, pressed = false, disableAnimations = false }: Props = $props();
    
    const shouldWave = $derived(wave && !disableAnimations);

    let textEl: SVGTextElement;
    let measureEl: SVGTextElement;
    let svgWidth = $state(0);
    let charWidths = $state<number[]>([]);
    let measured = false;

    const chars = $derived(text.split(''));
    const spacing = 8;
    const charPositions = $derived(() => {
        let x = 5 - (spacing * chars.length)/2;
        return chars.map((_, i) => {
            const pos = x;
            x += charWidths[i] || fontSize * 0.6;
            x += spacing;
            return pos;
        });
    });

    // Wave animation timing for each character (staggered)
    const waveAmplitude = 3;
    const waveDuration = 2; // seconds for full cycle

    onMount(() => {
        updateWidth();
    });

    function updateWidth() {
        const el = measureEl || textEl;
        if (el && !measured) {
            const bbox = el.getBBox();
            svgWidth = bbox.width + 22;
            
            if (shouldWave) {
                const tempWidths: number[] = [];
                for (let i = 0; i < chars.length; i++) {
                    const extent = el.getExtentOfChar(i);
                    tempWidths.push(extent.width);
                }
                charWidths = tempWidths;
                measured = true;
            }
        }
    }

    $effect(() => {
        text;
        fontSize;
        measured = false;
        requestAnimationFrame(updateWidth);
    });
</script>

<div class="boba-container">
    <svg width={svgWidth || 'auto'} height={fontSize + 22} overflow="visible" fill="none" xmlns="http://www.w3.org/2200/svg">
        <!-- Hidden measurement text -->
        <text bind:this={measureEl} fill="black" stroke="#F9F3EB" style="white-space: pre; paint-order: stroke; opacity: 0; pointer-events: none; font-family: var(--font-cook);" stroke-width="22" stroke-linejoin="round" xml:space="preserve" font-size={fontSize} font-weight="600" letter-spacing="0em"><tspan x="5" y={fontSize}>{text}</tspan></text>
        
        {#if shouldWave && charWidths.length > 0}
            {#each chars as char, i}
                <g class="boba-shadow wave-char" class:pressed={pressed} style="animation-delay: {-i * 0.08}s">
                    <text stroke="black" style="white-space: pre; paint-order: stroke; font-family: var(--font-cook);" stroke-width="22" stroke-linejoin="round" xml:space="preserve" font-size={fontSize} font-weight="600" letter-spacing="0em">
                        <tspan x={charPositions()[i]} y={fontSize}>{char}</tspan>
                    </text>
                </g>
            {/each}
            {#each chars as char, i}
                <g class="front wave-char" class:pressed={pressed} style="animation-delay: {-i * 0.08}s">
                    <text fill="black" stroke={pressed ? '#FFA936' : '#F9F3EB'} style="white-space: pre; paint-order: stroke; transition: stroke 0.15s ease; font-family: var(--font-cook);" stroke-width="15" stroke-linejoin="round" xml:space="preserve" font-size={fontSize} font-weight="600" letter-spacing="0em">
                        <tspan x={charPositions()[i]} y={fontSize}>{char}</tspan>
                    </text>
                </g>
            {/each}
        {:else}
            <text class="boba-shadow" class:pressed={pressed} stroke="black" style="white-space: pre; paint-order: stroke; font-family: var(--font-cook);" stroke-width="22" stroke-linejoin="round" xml:space="preserve" font-size={fontSize} font-weight="600" letter-spacing="0em"><tspan x="5" y={fontSize}>{text}</tspan></text>
            <text class="front" class:pressed={pressed} bind:this={textEl} fill="black" stroke={pressed ? '#FFA936' : '#F9F3EB'} style="white-space: pre; paint-order: stroke; transition: stroke 0.15s ease; font-family: var(--font-cook);" stroke-width="15" stroke-linejoin="round" xml:space="preserve" font-size={fontSize} font-weight="600" letter-spacing="0em"><tspan x="5" y={fontSize}>{text}</tspan></text>
        {/if}
    </svg>
</div>

<style>
    .boba-container {
        display: inline-block;
    }
    
    .boba-container svg {
        display: block;
    }

    .boba-shadow {
        -webkit-filter: drop-shadow( 3px 3px 0px rgba(0, 0, 0, 1));
        
        filter: drop-shadow( 3px 3px 0px rgba(0, 0, 0, 1));
        transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.15s ease;
    }

    .boba-shadow.pressed {
        -webkit-filter: drop-shadow( 0px 0px 0px rgba(0, 0, 0, 1));
        filter: drop-shadow( 0px 0px 0px rgba(0, 0, 0, 1));

        transform: translate(3px, 3px);
    }

    .front {
    	transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .front.pressed {
        transform: translate(3px, 3px);
    }

    @keyframes wave {
        0%, 100% { transform: translateY(0); }
        12.5% { transform: translateY(-2.1px); }
        25% { transform: translateY(-3px); }
        37.5% { transform: translateY(-2.1px); }
        50% { transform: translateY(0); }
        62.5% { transform: translateY(2.1px); }
        75% { transform: translateY(3px); }
        87.5% { transform: translateY(2.1px); }
    }

    .wave-char {
        animation: wave 2s linear infinite;
    }

    .wave-char.pressed {
        animation: none;
    }
</style>
