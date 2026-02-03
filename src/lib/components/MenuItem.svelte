<script lang="ts">
    import type { Snippet } from 'svelte';
    import ChevronSvg from '$lib/assets/shapes/chevron.svg';

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
        onSignup?: () => void;
        signupHint?: string;
    }

    let { title, subtitle, selected = false, chevron = false, class: className = '', icon, preserveIcon = false, disableAnimations = false, showSignup = false, email = $bindable(''), onSignup, signupHint }: Props = $props();

    let emailInput: HTMLInputElement;
    let emailFocused = $state(false);

    const isValidEmail = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    let showInvalidHint = $state(false);

    function handleClick() {
        if (showSignup && selected && emailInput) {
            emailInput.focus();
        }
    }

    function handleEmailKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (isValidEmail) {
                showInvalidHint = false;
                onSignup?.();
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

<div class="menu-item {className} cursor-pointer" class:selected class:no-anim={disableAnimations} onclick={handleClick}>
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
                <button class="signup-btn" onclick={(e) => { e.stopPropagation(); onSignup?.(); }}>SIGN UP</button>
            </div>
            {#if signupHint}
                <p class="signup-hint" class:visible={selected && ((!email && !emailFocused) || (emailFocused && isValidEmail) || showInvalidHint)} class:error={showInvalidHint}>{showInvalidHint ? 'Please enter a valid email' : (emailFocused && isValidEmail ? 'Press enter to sign up' : signupHint)}</p>
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
        width: 944px;
        transition: 
            height 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
            width 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
            background-color 0.25s ease,
            box-shadow 0.2s ease,
            transform 0.2s ease;
    }

    .menu-item.selected {
        background-color: #ffa936;
        height: 220px;
        width: 1049px;
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
        font-family: 'Cook Widetype', sans-serif;
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
        width: 280px;
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
</style>
