<script lang="ts">
    import type { Snippet } from 'svelte';
    import ChevronSvg from '$lib/assets/shapes/chevron.svg';
    import { m } from '$lib/paraglide/messages.js';

    interface Props {
        title: string;
        subtitle?: string;
        selected?: boolean;
        chevron?: boolean;
        class?: string;
        icon?: Snippet;
        preserveIcon?: boolean;
        disableAnimations?: boolean;
        showSignup?: boolean;
        email?: string;
        onSignup?: (email: string) => void;
        signupHint?: string;
        emailFocused?: boolean;
        onclick?: () => void;
    }

    let { title, subtitle, selected = false, chevron = false, class: className = '', icon, preserveIcon = false, disableAnimations = false, showSignup = false, email = $bindable(''), onSignup, signupHint, emailFocused = $bindable(false), onclick }: Props = $props();

    let emailInput: HTMLInputElement;

    const isValidEmail = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    let showInvalidHint = $state(false);

    function handleClick() {
        if (onclick) {
            onclick();
        } else if (showSignup && selected && emailInput) {
            emailInput.focus();
        }
    }

    function handleEmailKeydown(e: KeyboardEvent) {
        e.stopPropagation();
        if (e.key === 'Enter') {
            e.preventDefault();
            if (isValidEmail) {
                showInvalidHint = false;
                onSignup?.(email);
            } else {
                showInvalidHint = true;
            }
        }
    }

    function handleEmailInput() {
        if (showInvalidHint) {
            showInvalidHint = false;
        }
    }
</script>

<div class="menu-item {className} cursor-pointer" class:selected class:no-anim={disableAnimations} onclick={handleClick} tabindex={onclick ? 0 : -1} onkeydown={(e) => { if (onclick && e.key === 'Enter') { e.preventDefault(); handleClick(); } }}>
    <div class="content">
        <p class="title">{title}</p>
        <p class="subtitle" class:visible={subtitle && selected}>{subtitle ?? ''}</p>
        {#if showSignup}
            <div class="signup" class:visible={selected}>
                <input 
                    type="email" 
                    class="email-input" 
                    placeholder="orpheus@hackclub.com"
                    bind:value={email}
                    bind:this={emailInput}
                    onclick={(e) => e.stopPropagation()}
                    onfocus={() => emailFocused = true}
                    onblur={() => emailFocused = false}
                    onkeydown={handleEmailKeydown}
                    oninput={handleEmailInput}
                />
                <button class="signup-btn" class:valid={isValidEmail} onclick={(e) => { e.stopPropagation(); onSignup?.(email); }}>{m.comp_menu_signup()}</button>
            </div>
            {#if signupHint}
                <p class="signup-hint" class:visible={selected && ((!email && !emailFocused) || (emailFocused && isValidEmail) || showInvalidHint)} class:error={showInvalidHint}>{showInvalidHint ? m.comp_menu_invalid_email() : (emailFocused && isValidEmail ? m.comp_menu_press_enter_signup() : signupHint)}</p>
            {/if}
        {/if}
    </div>
    <div class="icon" class:hidden={!icon || (selected && !preserveIcon)}>
        {#if icon}
            {@render icon()}
        {/if}
    </div>
    <div class="chevrons" class:visible={selected && chevron}>
        <img src={ChevronSvg} alt="" class="chevron" />
    </div>
</div>

<style>
    .menu-item {
        background-color: #f3e8d8;
        border: 4px solid black;
        border-radius: 20px;
        padding: 20px 40px;
        box-shadow: 4px 4px 0px 0px black;
        display: flex;
        align-items: center;
        justify-content: space-between;
        overflow: hidden;
        position: relative;
        height: 100px;
        width: 100%;
        max-width: 944px;
        box-sizing: border-box;
        transition:
            height var(--juice-duration) var(--juice-easing),
            max-width var(--juice-duration) var(--juice-easing),
            background-color var(--selected-duration) ease;
     }

    .menu-item.selected {
        background-color: var(--selected-color);
        height: 220px;
        max-width: 1049px;
    }

    .content {
        display: flex;
        flex-direction: column;
        justify-content: center;
        z-index: 1;
    }

    .menu-item.selected .content {
        justify-content: flex-start;
    }

    .title {
        font-family: var(--font-cook);
        font-size: 48px;
        font-weight: 600;
        color: black;
        margin: 0;
        line-height: 1;
    }

    .subtitle {
        font-family: 'Bricolage Grotesque', sans-serif;
        font-size: 24px;
        font-weight: 600;
        color: black;
        margin: 0;
        margin-top: 12px;
        letter-spacing: 0.01em;
        opacity: 0;
        max-height: 0;
        overflow: hidden;
        transition: 
            opacity 0.15s ease,
            max-height 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .subtitle.visible {
        opacity: 1;
        max-height: 40px;
    }

    .icon {
        width: 64px;
        height: 64px;
        z-index: 1;
        transition: 
            opacity 0.2s ease,
            transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .icon.hidden {
        opacity: 0;
        transform: scale(0.8);
        pointer-events: none;
    }

    .icon :global(svg), .icon :global(img) {
        width: 100%;
        height: 100%;
    }

    .chevrons {
        position: absolute;
        right: 10%;
        top: 45%;
        transform: translateY(-50%) scale(210%);
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.3s ease 0.1s;
    }

    .chevrons.visible {
        opacity: 1;
    }

    .chevron {
        height: 180px;
        width: auto;
    }

    .menu-item.no-anim,
    .menu-item.no-anim .subtitle,
    .menu-item.no-anim .icon,
    .menu-item.no-anim .chevrons,
    .menu-item.no-anim .signup {
        transition: none;
    }

    .signup {
        display: flex;
        gap: 12px;
        align-items: center;
        margin-top: 0;
        opacity: 0;
        max-height: 0;
        overflow: hidden;
        transition: 
            opacity 0.15s ease,
            max-height 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
            margin-top 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .signup.visible {
        opacity: 1;
        max-height: 50px;
        margin-top: 12px;
    }

    .email-input {
        background-color: #f3e8d8;
        border: 2px solid black;
        border-radius: 8px;
        padding: 8px 16px;
        font-family: 'Bricolage Grotesque', sans-serif;
        font-size: 16px;
        font-weight: 600;
        color: rgba(0, 0, 0, 0.5);
        outline: none;
        width: min(280px, 100%);
    }

    .email-input::placeholder {
        color: rgba(0, 0, 0, 0.5);
    }

    .email-input:focus {
        color: black;
    }

    .signup-btn {
        background-color: #fba74d;
        border: 2px solid black;
        border-radius: 8px;
        padding: 8px 16px;
        font-family: 'Bricolage Grotesque', sans-serif;
        font-size: 16px;
        font-weight: 600;
        color: black;
        cursor: pointer;
        transition: background-color 0.15s ease, color 0.15s ease;
    }

    .signup-btn:hover {
        background-color: #e89a45;
    }

    .signup-btn.valid {
        animation: white-blink 1s ease-in-out infinite;
    }

    @keyframes white-blink {
        0%, 100% { background-color: #fdd9a8; }
        50% { background-color: #fba74d; }
    }

    .signup-hint {
        font-family: 'Bricolage Grotesque', sans-serif;
        font-size: 14px;
        font-weight: 500;
        color: rgba(0, 0, 0, 0.6);
        margin: 0;
        margin-top: 0;
        opacity: 0;
        max-height: 0;
        overflow: hidden;
        transition: 
            opacity 0.15s ease,
            max-height 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
            margin-top 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .signup-hint.visible {
        opacity: 1;
        max-height: 24px;
        margin-top: 8px;
        animation: blink 1s ease-in-out infinite;
    }

    .signup-hint.error {
        color: #c00;
        animation: none;
    }

    @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
    }

    @media (max-width: 640px) {
        .menu-item {
            height: 72px;
            padding: 14px 20px;
            border-radius: 14px;
        }

        .menu-item.selected {
            height: 190px;
        }

        .title {
            font-size: 28px;
        }

        .subtitle {
            font-size: 16px;
            margin-top: 8px;
        }

        .subtitle.visible {
            max-height: 28px;
        }

        .signup.visible {
            max-height: 44px;
        }

        .icon {
            width: 44px;
            height: 44px;
        }
    }
</style>
