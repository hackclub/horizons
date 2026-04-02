<script lang="ts">
	import BG from '$lib/components/BG.svelte';
	import BobaText from '$lib/components/BobaText.svelte';
	import TextWave from '$lib/components/TextWave.svelte';
	import Stripes from '$lib/components/Stripes.svelte';
	import Logo from '$lib/assets/Logo.svg';
    import playIcon from '$lib/assets/icons/yaya.svg';
    import faqIcon from '$lib/assets/icons/huh.svg';
    import horizonIcon from '$lib/assets/icons/h.svg';
    import { onMount } from 'svelte';
    import BobaButton from '$lib/components/BobaButton.svelte';
    import CircleIn from '$lib/components/anim/CircleIn.svelte';
    import MenuItem from '$lib/components/MenuItem.svelte';
    import { fade, fly } from 'svelte/transition';
    import { quintOut } from 'svelte/easing';
    import CircleOut from '$lib/components/anim/CircleOut.svelte';
    import { api } from '$lib/api';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { env } from '$env/dynamic/public';
    import { createListNav, parseNavKey, isNavKey, clampIndex, navState } from '$lib/nav/wasd.svelte';

    let activated = $state(false);
    let pressed = $state(false);
    let transitioning = $state(false);
    let isTransitioning = $state(false);
    let selectedElement = $state(-1); // -1 = card itself, 0+ = index within focusable elements
    let cardRefs: HTMLElement[] = [];
    let isTyping = $state(false);
    let btnPressed = $state(false);
    let showSlideOut = $state(false);
    let disableAnimations = $state(false);
    let animationsReady = $state(false);
    let windowWidth = $state(0);
    let isMobile = $derived(windowWidth > 0 && windowWidth < 640);

    let isAuthed = $state(false);
    let referralCode = $derived($page.url.searchParams.get('ref') ?? undefined);

    // Sync disableAnimations with localStorage
    onMount(() => {
        const stored = localStorage.getItem('disableAnimations');
        if (stored !== null) {
            disableAnimations = stored === 'true';
        }
        animationsReady = true;

        api.GET('/api/user/auth/me').then(async response => {
            if (response.data && response.data.hcaId) {
                if (env.PUBLIC_ENABLE_ONBOARDING === 'true') {
                    const { data } = await api.GET('/api/user/auth/onboarding-status');
                    if (data && !data.onboardComplete) {
                        window.location.href = '/app/onboarding';
                        return;
                    }
                }
                window.location.href = '/app';
            }
        })
    });

    $effect(() => {
        localStorage.setItem('disableAnimations', String(disableAnimations));
    });
    let signupEmail = $state('');
    let signupEmailFocused = $state(false);

    async function activateJoinNow(email: string) {
        showSlideOut = true;

        if (isAuthed) {
            setTimeout(async () => {
                const { data } = await api.GET('/api/user/auth/onboarding-status');
                if (data && !data.onboardComplete) {
                    goto('/app/onboarding');
                } else {
                    goto('/app');
                }
            }, 1200)
            return;
        }

        const response = await api.GET('/api/user/auth/login', {
            params: {
                query: {
                    email,
                    referralCode
                }
            }
         });
        const authURL = response.data?.url;

        if (!authURL) {
            showSlideOut = false;
            return;
        }

        setTimeout(() => {
            window.location = authURL as string & Location;
        }, 1200)
    }

    function navigateToFaq() {
        showSlideOut = true;
        setTimeout(() => {
            goto('/faq');
        }, 500);
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

    const nav = createListNav({
        count: () => 3,
        onSelect: (index) => {
            const elements = getFocusableElements(index);
            if (isAuthed && index === 0) {
                activateJoinNow('');
            } else if (index === 1) {
                navigateToFaq();
            } else if (elements.length > 0) {
                selectedElement = 0;
                focusSelectedElement();
            }
        },
    });

    function handlePageKeydown(ev: KeyboardEvent) {
        // Pre-activation: set keyboard mode on nav keys, only handle Enter
        if (!activated) {
            if (isNavKey(ev.key)) {
                navState.usingKeyboard = true;
            }
            if (ev.key === 'Enter' && !isTransitioning) {
                pressed = true;
                setTimeout(() => {
                    isTransitioning = true;
                    setTimeout(showDetail, 400);
                }, 150);
            }
            return;
        }

        // Guards for typing and element-level focus
        if (isTyping) return;
        if (selectedElement >= 0) return;

        nav.handleKeydown(ev);
    }

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
        const elements = getFocusableElements(nav.selectedIndex);
        if (selectedElement >= 0 && selectedElement < elements.length) {
            elements[selectedElement]?.focus();
        } else {
            (document.activeElement as HTMLElement)?.blur();
        }
    }

    function handleElementFocus(ev: FocusEvent) {
        const target = ev.target as HTMLElement;
        const elements = getFocusableElements(nav.selectedIndex);
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
        const container = cardRefs[nav.selectedIndex];
        const relatedTarget = ev.relatedTarget as HTMLElement;
        if (!container?.contains(relatedTarget)) {
            selectedElement = -1;
        }
    }

    function handleElementKeydown(ev: KeyboardEvent) {
        const elements = getFocusableElements(nav.selectedIndex);
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
            return;
        }

        if (ev.key === 'Tab') {
            if (selectedElement < elements.length - 1) {
                ev.preventDefault();
                selectedElement++;
                focusSelectedElement();
            } else if (!ev.shiftKey) {
                ev.preventDefault();
                selectedElement = -1;
                nav.selectedIndex = clampIndex(nav.selectedIndex + 1, 2);
                (document.activeElement as HTMLElement)?.blur();
            }
            return;
        }

        if ((ev.key === 'Tab' && ev.shiftKey) || ev.key === 'Escape') {
            ev.preventDefault();
            if (selectedElement > 0) {
                selectedElement--;
                focusSelectedElement();
            } else {
                selectedElement = -1;
                (document.activeElement as HTMLElement)?.blur();
            }
            return;
        }

        const dir = parseNavKey(ev.key);
        if (!dir) return;
        ev.preventDefault();

        if (dir === 'up') {
            if (selectedElement > 0) {
                selectedElement--;
                focusSelectedElement();
            } else {
                selectedElement = -1;
                (document.activeElement as HTMLElement)?.blur();
            }
        } else if (dir === 'down') {
            if (selectedElement < elements.length - 1) {
                selectedElement++;
                focusSelectedElement();
            }
        } else if (dir === 'left') {
            selectedElement = -1;
            nav.selectedIndex = clampIndex(nav.selectedIndex - 1, 2);
            (document.activeElement as HTMLElement)?.blur();
        } else if (dir === 'right') {
            selectedElement = -1;
            nav.selectedIndex = clampIndex(nav.selectedIndex + 1, 2);
            (document.activeElement as HTMLElement)?.blur();
        }
    }

</script>

<svelte:window onkeydown={handlePageKeydown} bind:innerWidth={windowWidth} />

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
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div class="flex-1 flex flex-col justify-center absolute inset-0 cursor-pointer" onclick={() => {
            if (!isTransitioning) {
                navState.usingKeyboard = false;
                pressed = true;
                setTimeout(() => {
                    isTransitioning = true;
                    setTimeout(() => {
                        showDetail();
                    }, 400);
                }, 150);
            }
        }}>
            <div class="flex flex-col items-center justify-center px-4 sm:px-16 pb-4">
                <div out:captureLogoRect>
                    <img src={Logo} alt="Hack Club Horizon" class="w-full max-w-7xl" />
                </div>
            </div>
            {#if !isTransitioning}
                <!-- <p class="text-black font-cook text-center text-4xl tracking-widest mt-2 mb-4" out:fade={{ duration: disableAnimations ? 0 : 300, delay: disableAnimations ? 0 : 100 }}>300+ PERSON HACKATHON IN SF • DATE 6/19-6/21</p> -->
                <p class="text-black font-cook text-center text-lg sm:text-3xl tracking-wide sm:tracking-widest mt-2 mb-6" out:fade={{ duration: disableAnimations ? 0 : 300, delay: disableAnimations ? 0 : 100 }}><TextWave text="HIGH SCHOOL FLAGSHIP HACKATHONS ACROSS THE WORLD" duration={2} disabled={disableAnimations} /></p>
            {/if}

            <div out:captureStripesRect>
                <Stripes outro={isTransitioning} {disableAnimations} />
            </div>

            {#if !isTransitioning}
                <div class="flex flex-col items-center justify-center px-4 sm:px-16 mt-8" out:fade={{ duration: disableAnimations ? 0 : 300, delay: disableAnimations ? 0 : 100 }}>
                    <BobaButton text={isMobile ? "> TAP  TO  START" : "> CLICK  OR  PRESS  ENTER"} fontSize={isMobile ? 22 : 32} fallbackWidth={isMobile ? 186 : 360} {pressed} className="select-none" wave {disableAnimations} />
                </div>
            {/if}
        </div>

        <label class="disable-anim-checkbox">
            <input type="checkbox" bind:checked={disableAnimations} />
            Disable animations
        </label>
    {/if}
    {#if activated}
        <div class="flex flex-col h-full items-center gap-4 sm:gap-8 pb-8">
            <div class="flex flex-col w-full">
                <div class="flex gap-2 sm:gap-4 items-center sm:items-end px-4 sm:px-10 pt-6 sm:pt-10 pb-3">
                    <div in:animateLogoIn>
                        <img src={Logo} alt="Hack Club Horizon" class="h-14 sm:h-24" />
                    </div>
                    <!-- <p in:fade={{ duration: disableAnimations ? 0 : 300, delay: disableAnimations ? 0 : 200 }} class="tagline"><TextWave text="HACK CLUB'S " disabled={disableAnimations} /><span class="underline"><TextWave text="BIGGEST" disabled={disableAnimations} offset={12} /></span><TextWave text=" EVENT" disabled={disableAnimations} offset={19} /></p> -->
                    <p in:fade={{ duration: disableAnimations ? 0 : 300, delay: disableAnimations ? 0 : 200 }} class="tagline hidden sm:block"><TextWave text="300+ PERSON HACKATHON IN SF • DATE 6/19-6/21" disabled={disableAnimations} /></p>
                </div>
                <div in:animateStripesIn>
                    <Stripes small {disableAnimations} />
                </div>
            </div>

            <div class="flex flex-col items-center gap-4 sm:gap-7 w-full px-4 sm:px-10">                
                <div class="w-full flex justify-center" in:fly={{ x: disableAnimations ? 0 : 50, duration: disableAnimations ? 0 : 400, delay: disableAnimations ? 0 : 500 }} bind:this={cardRefs[0]} onmouseenter={() => { if (!signupEmailFocused) nav.select(0); }}>
                    {#if isAuthed}
                        <MenuItem
                            title="SIGN BACK IN"
                            subtitle="GET BACK TO WORKING ON YOUR PROJECTS!"
                            chevron
                            selected={nav.selectedIndex === 0}
                            preserveIcon
                            {disableAnimations}
                            onclick={() => activateJoinNow('')}
                        >
                            {#snippet icon()}
                                <img src={horizonIcon} alt="Watch" />
                            {/snippet}
                        </MenuItem>
                    {:else}
                        <MenuItem
                            title="JOIN NOW"
                            subtitle="START WORKING ON YOUR PROJECTS!"
                            chevron
                            selected={nav.selectedIndex === 0}
                            preserveIcon
                            {disableAnimations}
                            showSignup={!isMobile}
                            bind:email={signupEmail}
                            bind:emailFocused={signupEmailFocused}
                            onSignup={activateJoinNow}
                            signupHint={navState.usingKeyboard ? "Press enter to enter your email" : "Click to enter your email"}
                            onclick={isMobile ? () => activateJoinNow('') : undefined}
                        >
                            {#snippet icon()}
                                <img src={horizonIcon} alt="Watch" />
                            {/snippet}
                        </MenuItem>
                    {/if}
                </div>
                <div class="w-full flex justify-center" in:fly={{ x: disableAnimations ? 0 : 50, duration: disableAnimations ? 0 : 400, delay: disableAnimations ? 0 : 600 }} bind:this={cardRefs[1]} onmouseenter={() => { if (!signupEmailFocused) nav.select(1); }}>
                    <MenuItem
                        title="WHAT'S HORIZONS?"
                        subtitle="LEARN MORE ABOUT THE EVENT!"
                        selected={nav.selectedIndex === 1}
                        preserveIcon
                        {disableAnimations}
                        onclick={() => navigateToFaq()}
                    >
                        {#snippet icon()}
                            <img src={faqIcon} alt="Watch" />
                        {/snippet}
                    </MenuItem>
                </div>
                <!-- <div class="w-full flex justify-center" in:fly={{ x: disableAnimations ? 0 : 50, duration: disableAnimations ? 0 : 400, delay: disableAnimations ? 0 : 700 }} bind:this={cardRefs[2]} onmouseenter={() => { if (!signupEmailFocused) nav.select(2); }}>
                    <MenuItem
                        title="WATCH THE VIDEO"
                        subtitle="SOMETHING SOMETHING SOMETHING IDK"
                        selected={nav.selectedIndex === 2}
                        preserveIcon
                        {disableAnimations}
                    >
                        {#snippet icon()}
                            <img src={playIcon} alt="Watch" />
                        {/snippet}
                    </MenuItem>
                </div> -->
            </div>

            <div in:fly={{ y: disableAnimations ? 0 : 20, duration: disableAnimations ? 0 : 300, delay: disableAnimations ? 0 : 800 }} class="hidden sm:flex justify-center absolute bottom-4 left-0 right-0">
                <BobaText text="USE  WASD  OR  YOUR  MOUSE" fontSize={30} wave {disableAnimations} />
            </div>

            <button 
                in:fly={{ y: disableAnimations ? 0 : 20, duration: disableAnimations ? 0 : 300, delay: disableAnimations ? 0 : 900 }}
                class="absolute bottom-0 left-4 bg-transparent border-none cursor-pointer opacity-60 hover:opacity-100 transition-opacity duration-200"
                onclick={() => { activated = false; isTransitioning = false; }}
            >
                <BobaText text="< BACK" fontSize={24} {disableAnimations} />
            </button>
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
        font-family: var(--font-cook);
        font-size: clamp(14px, 2vw, 24px);
        font-weight: 600;
        color: black;
        margin: 0;
    }
</style>


