<script lang="ts">
	import BG from '$lib/components/BG.svelte';
	import BobaText from '$lib/components/BobaText.svelte';
	import Stripes from '$lib/components/Stripes.svelte';
	import Logo from '$lib/assets/Logo.svg';
    import playIcon from '$lib/assets/icons/yaya.svg';
    import faqIcon from '$lib/assets/icons/huh.svg';
    import horizonIcon from '$lib/assets/icons/h.svg';
    import { onMount } from 'svelte';
    import BobaButton from '$lib/components/BobaButton.svelte';
    import CircleIn from '$lib/components/anim/CircleIn.svelte';
    import SlideOut from '$lib/components/anim/SlideOut.svelte';
    import MenuItem from '$lib/components/MenuItem.svelte';
    import { fade, fly } from 'svelte/transition';
    import { quintOut } from 'svelte/easing';
    import CircleOut from '$lib/components/anim/CircleOut.svelte';

    let activated = $state(false);
    let pressed = $state(false);
    let transitioning = $state(false);
    let stripesOutro = $state(false);
    let selectedCard = $state(0);
    let selectedElement = $state(-1); // -1 = card itself, 0+ = index within focusable elements
    let cardRefs: HTMLElement[] = [];
    let isTyping = $state(false);
    let btnPressed = $state(false);
    let usingKeyboard = $state(true); // Track if user is using keyboard navigation
    let showSlideOut = $state(false);
    let disableAnimations = $state(false);
    let animationsReady = $state(false);

    // Sync disableAnimations with localStorage
    onMount(() => {
        const stored = localStorage.getItem('disableAnimations');
        if (stored !== null) {
            disableAnimations = stored === 'true';
        }
        animationsReady = true;
    });

    $effect(() => {
        localStorage.setItem('disableAnimations', String(disableAnimations));
    });
    let signupEmail = $state('');

    function activateJoinNow() {
        showSlideOut = true;
    }

    let logoRect: DOMRect | null = $state(null);
    let stripesRect: DOMRect | null = $state(null);

    function captureLogoRect(node: HTMLElement) {
        logoRect = node.getBoundingClientRect();
        return { duration: 0 };
    }

    function captureStripesRect(node: HTMLElement) {
        stripesRect = node.getBoundingClientRect();
        return { duration: 0 };
    }

    function animateLogoIn(node: HTMLElement) {
        if (!logoRect || disableAnimations) return { duration: 0 };
        const to = node.getBoundingClientRect();
        const dx = logoRect.left - to.left;
        const dy = logoRect.top - to.top;
        const sx = logoRect.width / to.width;
        const sy = logoRect.height / to.height;
        return {
            duration: 600,
            easing: quintOut,
            css: (t: number) => {
                const u = 1 - t;
                return `transform: translate(${u * dx}px, ${u * dy}px) scale(${1 + u * (sx - 1)}, ${1 + u * (sy - 1)}); transform-origin: top left;`;
            }
        };
    }

    function animateStripesIn(node: HTMLElement) {
        if (!stripesRect || disableAnimations) return { duration: 0 };
        const to = node.getBoundingClientRect();
        const dx = stripesRect.left - to.left;
        const dy = stripesRect.top - to.top;
        const sx = stripesRect.width / to.width;
        const sy = stripesRect.height / to.height;
        return {
            duration: 600,
            easing: quintOut,
            css: (t: number) => {
                const u = 1 - t;
                return `transform: translate(${u * dx}px, ${u * dy}px) scale(${1 + u * (sx - 1)}, ${1 + u * (sy - 1)}); transform-origin: top left;`;
            }
        };
    }

    const transitionDuration = $derived(disableAnimations ? 0 : undefined);

    function showDetail() {
        transitioning = true;
        activated = true;
        pressed = false;

        setTimeout(() => {
            transitioning = false;
        }, 600);
    }

    function getFocusableElements(cardIndex: number): HTMLElement[] {
        const card = cardRefs[cardIndex];
        if (!card) return [];
        return Array.from(card.querySelectorAll('input, button, [tabindex]:not([tabindex="-1"])'));
    }

    function focusSelectedElement() {
        const elements = getFocusableElements(selectedCard);
        if (selectedElement >= 0 && selectedElement < elements.length) {
            elements[selectedElement]?.focus();
        } else {
            (document.activeElement as HTMLElement)?.blur();
        }
    }

    function handleElementFocus(ev: FocusEvent) {
        const target = ev.target as HTMLElement;
        const elements = getFocusableElements(selectedCard);
        const index = elements.indexOf(target);
        if (index >= 0) {
            selectedElement = index;
        }
        if (target.tagName === 'INPUT') {
            isTyping = true;
        }
    }

    function handleElementBlur(ev: FocusEvent) {
        isTyping = false;
        const container = cardRefs[selectedCard];
        const relatedTarget = ev.relatedTarget as HTMLElement;
        if (!container?.contains(relatedTarget)) {
            selectedElement = -1;
        }
    }

    function handleElementKeydown(ev: KeyboardEvent) {
        const elements = getFocusableElements(selectedCard);
        const isInput = (ev.target as HTMLElement).tagName === 'INPUT';
        
        if (isInput && ev.key !== 'Enter' && ev.key !== 'Tab' && ev.key !== 'Escape') {
            return; // Allow typing in inputs
        }

        if (ev.key === 'Enter') {
            if (isInput && selectedElement < elements.length - 1) {
                ev.preventDefault();
                selectedElement++;
                focusSelectedElement();
            } else if (!isInput) {
                btnPressed = true;
                setTimeout(() => { btnPressed = false; }, 150);
            }
        } else if (ev.key === 'Tab') {
            if (selectedElement < elements.length - 1) {
                ev.preventDefault();
                selectedElement++;
                focusSelectedElement();
            } else if (!ev.shiftKey) {
                ev.preventDefault();
                selectedElement = -1;
                selectedCard = Math.min(2, selectedCard + 1);
                (document.activeElement as HTMLElement)?.blur();
            }
        } else if ((ev.key === 'Tab' && ev.shiftKey) || ev.key === 'Escape') {
            ev.preventDefault();
            if (selectedElement > 0) {
                selectedElement--;
                focusSelectedElement();
            } else {
                selectedElement = -1;
                (document.activeElement as HTMLElement)?.blur();
            }
        } else if (ev.key === 'w' || ev.key === 'W' || ev.key === 'ArrowUp') {
            ev.preventDefault();
            if (selectedElement > 0) {
                selectedElement--;
                focusSelectedElement();
            } else {
                selectedElement = -1;
                (document.activeElement as HTMLElement)?.blur();
            }
        } else if (ev.key === 's' || ev.key === 'S' || ev.key === 'ArrowDown') {
            ev.preventDefault();
            if (selectedElement < elements.length - 1) {
                selectedElement++;
                focusSelectedElement();
            }
        } else if (ev.key === 'a' || ev.key === 'A' || ev.key === 'ArrowLeft') {
            ev.preventDefault();
            selectedElement = -1;
            selectedCard = Math.max(0, selectedCard - 1);
            (document.activeElement as HTMLElement)?.blur();
        } else if (ev.key === 'd' || ev.key === 'D' || ev.key === 'ArrowRight') {
            ev.preventDefault();
            selectedElement = -1;
            selectedCard = Math.min(2, selectedCard + 1);
            (document.activeElement as HTMLElement)?.blur();
        }
    }

    onMount(() => {
        window.onkeydown = (ev) => {
            // Switch to keyboard mode on navigation keys
            if (['w', 'W', 's', 'S', 'a', 'A', 'd', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Tab', 'Escape'].includes(ev.key)) {
                usingKeyboard = true;
            }

            if (!activated) {
                if (ev.key === 'Enter' && !stripesOutro) {
                    pressed = true;
                    setTimeout(() => {
                        stripesOutro = true;
                        setTimeout(showDetail, 400);
                    }, 150);
                }
            } else {
                if (isTyping) return;
                if (selectedElement >= 0) return; // Let element handlers deal with it

                const elements = getFocusableElements(selectedCard);
                
                if (ev.key === 'w' || ev.key === 'W' || ev.key === 'ArrowUp') {
                    selectedCard = Math.max(0, selectedCard - 1);
                    selectedElement = -1;
                } else if (ev.key === 's' || ev.key === 'S' || ev.key === 'ArrowDown') {
                    selectedCard = Math.min(2, selectedCard + 1);
                    selectedElement = -1;
                } else if (ev.key === 'Enter') {
                    if (elements.length > 0) {
                        ev.preventDefault();
                        selectedElement = 0;
                        focusSelectedElement();
                    }
                }
            }
        };
    });
</script>

{#if !animationsReady}
    <div class="fixed inset-0 bg-black z-[9999]"></div>
{:else if !disableAnimations}
    <CircleIn />
    {#if showSlideOut}
        <CircleOut />
    {/if}
{/if}

<BG class="flex flex-col overflow-hidden" {disableAnimations}>
    {#if !activated}
        <div class="flex-1 flex flex-col justify-center absolute inset-0">
            <div class="flex flex-col items-center justify-center px-16 pb-4">
                <div out:captureLogoRect>
                    <img src={Logo} alt="Hack Club Horizon" class="w-full max-w-7xl" />
                </div>
            </div>

            <div out:captureStripesRect>
                <Stripes outro={stripesOutro} {disableAnimations} />
            </div>

            {#if !stripesOutro}
                <div class="flex flex-col items-center justify-center px-16 mt-8" out:fade={{ duration: disableAnimations ? 0 : 300, delay: disableAnimations ? 0 : 100 }}>
                    <BobaButton text="> CLICK  OR  PRESS  ENTER" fallbackWidth={360} {pressed} className="select-none cursor-pointer" wave {disableAnimations} onclick={() => {
                        if (!stripesOutro) {
                            usingKeyboard = false;
                            pressed = true;
                            setTimeout(() => {
                                stripesOutro = true;
                                setTimeout(() => {
                                    showDetail();
                                    selectedCard = -1;
                                }, 400);
                            }, 150);
                        }
                    }} />
                </div>
            {/if}
        </div>

        <label class="disable-anim-checkbox">
            <input type="checkbox" bind:checked={disableAnimations} />
            Disable animations
        </label>
    {/if}
    {#if activated}
        <div class="flex flex-col h-full items-center gap-8 pb-8">
            <div class="flex flex-col w-full">
                <div class="flex gap-4 items-end px-10 pt-10 pb-3">
                    <div in:animateLogoIn>
                        <img src={Logo} alt="Hack Club Horizon" class="h-24" />
                    </div>
                    <p in:fade={{ duration: disableAnimations ? 0 : 300, delay: disableAnimations ? 0 : 200 }} class="tagline">HACK CLUB'S <span class="underline">BIGGEST</span> EVENT</p>
                </div>
                <div in:animateStripesIn>
                    <Stripes small {disableAnimations} />
                </div>
            </div>

            <div class="flex flex-col items-center gap-7 w-full px-10">
                <div in:fly={{ x: disableAnimations ? 0 : 50, duration: disableAnimations ? 0 : 400, delay: disableAnimations ? 0 : 500 }} bind:this={cardRefs[0]} onmouseenter={() => { usingKeyboard = false; selectedCard = 0; }}>
                    <MenuItem 
                        title="JOIN NOW" 
                        subtitle="START WORKING ON YOUR PROJECTS!"
                        chevron
                        selected={selectedCard === 0}
                        preserveIcon
                        {disableAnimations}
                        showSignup
                        bind:email={signupEmail}
                        onSignup={activateJoinNow}
                        signupHint={usingKeyboard ? "Press enter to enter your email" : "Click to enter your email"}
                    >
                        {#snippet icon()}
                            <img src={horizonIcon} alt="Watch" />
                        {/snippet}
                    </MenuItem>
                </div>
                <div in:fly={{ x: disableAnimations ? 0 : 50, duration: disableAnimations ? 0 : 400, delay: disableAnimations ? 0 : 600 }} bind:this={cardRefs[1]} onmouseenter={() => { usingKeyboard = false; selectedCard = 1; }}>
                    <MenuItem 
                        title="WHAT'S HORIZON?" 
                        selected={selectedCard === 1}
                        preserveIcon
                        {disableAnimations}
                    >
                        {#snippet icon()}
                            <img src={faqIcon} alt="Watch" />
                        {/snippet}
                    </MenuItem>
                </div>
                <div in:fly={{ x: disableAnimations ? 0 : 50, duration: disableAnimations ? 0 : 400, delay: disableAnimations ? 0 : 700 }} bind:this={cardRefs[2]} onmouseenter={() => { usingKeyboard = false; selectedCard = 2; }}>
                    <MenuItem 
                        title="WATCH THE VIDEO" 
                        selected={selectedCard === 2}
                        preserveIcon
                        {disableAnimations}
                    >
                        {#snippet icon()}
                            <img src={playIcon} alt="Watch" />
                        {/snippet}
                    </MenuItem>
                </div>
            </div>

            <div in:fly={{ y: disableAnimations ? 0 : 20, duration: disableAnimations ? 0 : 300, delay: disableAnimations ? 0 : 800 }} class="flex justify-center absolute bottom-24 left-0 right-0">
                <BobaText text="USE  WASD  OR  YOUR  MOUSE" fontSize={36} wave {disableAnimations} />
            </div>
        </div>
    {/if}
</BG>

<style>
    .disable-anim-checkbox {
        position: fixed;
        bottom: 16px;
        right: 16px;
        font-family: 'Bricolage Grotesque', sans-serif;
        font-size: 14px;
        color: black;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        opacity: 0.6;
        transition: opacity 0.2s ease;
    }

    .disable-anim-checkbox:hover {
        opacity: 1;
    }

    .tagline {
        font-family: 'Cook Widetype', sans-serif;
        font-size: 32px;
        font-weight: 600;
        color: black;
        margin: 0;
    }
</style>


