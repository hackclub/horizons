<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import { page } from '$app/state';
	import { env } from '$env/dynamic/public';

	// Assets - Hero
	import heroLogo from '$lib/assets/Logo.svg';
	import flagOrpheus from '$lib/assets/landing/flag-orpheus.png';
	import ChevronSvg from '$lib/assets/shapes/chevron.svg';
	import InputPrompt from '$lib/components/InputPrompt.svelte';
	import BG from '$lib/components/BG.svelte';

	// Assets - Divider
	import divider from '$lib/assets/landing/divider.png';

	// Assets - Blurb
	import blurbPhoto from '$lib/assets/landing/blurb-photo.png';
	import blurbPhoto2 from '$lib/assets/landing/blurb-photo-2.png';
	import blurbPhoto3 from '$lib/assets/landing/blurb-photo-3.png';
	import blurbPhoto4 from '$lib/assets/landing/blurb-photo-4.png';

	let referralCode = $derived(page.url.searchParams.get('ref') ?? undefined);
	let utmSource = $derived(page.url.searchParams.get('utm_source') ?? undefined);

	let signupEmail = $state('');
	let showInvalidHint = $state(false);
	let cardSelected = $state(false);
	let emailFocused = $state(false);
	const isValidEmail = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupEmail));

	onMount(() => {
		// Prevent browser focus restore from auto-selecting the card
		setTimeout(() => {
			if (!signupEmail) {
				(document.activeElement as HTMLElement)?.blur();
				cardSelected = false;
				emailFocused = false;
			}
		}, 50);

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
		});
	});

	async function handleSignup(email: string) {
		if (!email) return;

		const response = await api.GET('/api/user/auth/login', {
			params: {
				query: {
					email,
					referralCode,
					utm_source: utmSource
				}
			}
		});
		const authURL = response.data?.url;
		if (authURL) {
			window.location = authURL as string & Location;
		}
	}

	function handleEmailKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (isValidEmail) {
				showInvalidHint = false;
				handleSignup(signupEmail);
			} else {
				showInvalidHint = true;
			}
		}
	}

	let cardInView = $state(false);

	function scrollCardIntoView() {
		const container = document.querySelector('.landing-page') as HTMLElement;
		if (!container) return;
		container.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function selectCard() {
		cardSelected = true;
		document.getElementById('signup-email')?.focus();
		scrollCardIntoView();
	}

	function handleGlobalKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !emailFocused && cardInView) {
			e.preventDefault();
			selectCard();
		}
	}

	function observeCard(node: HTMLElement) {
		const observer = new IntersectionObserver(
			([entry]) => { cardInView = entry.isIntersecting; },
			{ threshold: 0.5 }
		);
		observer.observe(node);
		return { destroy: () => observer.disconnect() };
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<svelte:head>
	<title>Horizons | Hack Club</title>
	<meta name="description" content="High school flagship hackathons across the world, brought to you by Hack Club." />
</svelte:head>

<BG class="landing-page overflow-x-hidden overflow-y-auto font-['Bricolage_Grotesque',sans-serif]">
	<!-- ===== BG ===== -->
	<div class="absolute top-0 left-0 w-full h-[400px] overflow-hidden pointer-events-none z-0">
		<!-- Diagonal stripes -->
		<div class="absolute top-0 -left-[160px] w-[calc(100%+400px)] flex items-center justify-center">
			<div class="flex flex-col gap-[10px] w-[1830px] h-[83px] rotate-[-9.8deg]">
				<div class="flex-1 w-full min-h-0 bg-[#ffa936]"></div>
				<div class="flex-1 w-full min-h-0 bg-[#f86d95]"></div>
				<div class="flex-1 w-full min-h-0 bg-[#46467c]"></div>
			</div>
		</div>

		<!-- Orpheus flag -->
		<img src={flagOrpheus} alt="Hack Club" class="absolute -top-1 left-[59px] w-[135px] h-auto z-5 sm:left-[59px] max-sm:left-[24px] max-sm:w-[80px] max-sm:h-auto" />
	</div>

	<!-- ===== HERO SECTION ===== -->
	<section class="relative z-1 flex flex-col gap-[26px] pt-[70px] px-[59px] max-w-[1020px] max-lg:px-6 max-lg:pt-[80px] h-[70vh] min-h-[600px]">
		<img src={heroLogo} alt="Horizons" class="w-[560px] h-auto max-lg:w-full max-lg:max-w-[560px]" />

		<div class="font-cook">
			<p class="hero-subtitle text-[32px] text-black m-0 leading-[1.2] max-sm:text-[20px] whitespace-nowrap">We're running 7 hackathons across the world.</p>
			<p class="hero-title text-[48px] text-black m-0 leading-[1.2] max-sm:text-[32px]">And you're invited.</p>
		</div>

		<!-- Signup Card -->
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			use:observeCard
			class="signup-card border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] w-[904px] max-w-full relative overflow-hidden cursor-pointer bg-[#f3e8d8] max-lg:w-full origin-left transition-all duration-(--juice-duration) ease-(--juice-easing) {cardSelected ? 'scale-[1.05]' : 'scale-100'}"
			onmousedown={(e) => { e.preventDefault(); selectCard(); }}
		>
			<!-- Orange fill -->
			<div class="absolute inset-0 bg-[#ffa936] transition-opacity duration-(--selected-duration) {cardSelected ? 'opacity-100' : 'opacity-0'}"></div>
			<!-- Chevron arrows -->
			<div class="absolute right-[10%] top-[45%] -translate-y-1/2 scale-[2.1] pointer-events-none transition-opacity duration-(--selected-duration) delay-100 {cardSelected ? 'opacity-100' : 'opacity-0'}">
				<img src={ChevronSvg} alt="" class="h-[180px] w-auto" />
			</div>
			<div class="relative flex flex-col gap-4 justify-center py-5 px-[30px] z-1">
				<p class="font-cook text-[32px] text-black m-0 leading-none">SIGN UP NOW</p>
				<div class="flex gap-3 items-center">
					<input
						id="signup-email"
						type="email"
						class="email-input bg-[#f3e8d8] border-2 border-black rounded-lg py-2 px-4 font-['Bricolage_Grotesque',sans-serif] text-base font-semibold text-black/50 outline-none w-[280px]"
						placeholder="orpheus@hackclub.com"
						bind:value={signupEmail}
						onkeydown={(e) => handleEmailKeydown(e)}
						oninput={() => { if (showInvalidHint) showInvalidHint = false; }}
						onclick={(e) => { e.stopPropagation(); cardSelected = true; }}
						onfocus={() => { cardSelected = true; emailFocused = true; }}
						onblur={() => { emailFocused = false; if (!signupEmail) cardSelected = false; }}
					/>
					<button
						class="signup-btn border-2 border-black rounded-lg py-2 px-4 font-['Bricolage_Grotesque',sans-serif] text-base font-semibold text-black cursor-pointer transition-colors duration-150 hover:bg-[#e89a45]"
						class:valid={isValidEmail}
						onclick={(e) => {
							e.stopPropagation();
							if (isValidEmail) handleSignup(signupEmail);
							else showInvalidHint = true;
						}}
					>SIGN UP</button>
				</div>
				{#if showInvalidHint}
					<p class="font-['Bricolage_Grotesque',sans-serif] text-sm m-0 text-[#c00]">Please enter a valid email</p>
				{/if}
				<div class="flex gap-2 items-center [&_div]:h-8! [&_div]:shrink! transition-all duration-(--selected-duration) ease-out {emailFocused ? 'opacity-0 pointer-events-none max-h-0 -mt-4 overflow-hidden' : 'opacity-100 max-h-10'}">
					<InputPrompt type="Enter" />
					<p class="font-bold text-sm text-black leading-6">OR</p>
					<InputPrompt type="click" />
					<p class="font-bold text-sm text-black leading-6">TO FOCUS</p>
				</div>
				<div class="flex gap-2 items-center [&_div]:h-8! [&_div]:shrink! transition-all duration-(--selected-duration) ease-out {emailFocused && isValidEmail ? 'opacity-100 max-h-10' : 'opacity-0 pointer-events-none max-h-0 -mt-4 overflow-hidden'}">
					<InputPrompt type="Enter" />
					<p class="font-bold text-sm text-black leading-6">TO SIGN UP</p>
				</div>
			</div>
		</div>

		<p class="font-['Bricolage_Grotesque',sans-serif] text-2xl font-medium text-[#666]">Scroll to read more...</p>
	</section>

	<!-- ===== BLURB SECTION ===== -->
	<section class="relative z-0 flex flex-col items-center -mt-5">
		<div class="divider-top w-full aspect-[1444/120] overflow-hidden relative">
			<img src={divider} alt="" />
		</div>

		<div class="bg-black w-full relative py-[51px] px-[81px] pb-[60px] min-h-[620px] overflow-hidden max-sm:py-[30px] max-sm:px-6">
			<div class="text-white text-2xl leading-relaxed max-w-[700px] max-sm:text-lg [&_p]:m-0 [&_.bold]:font-bold">
				<p>This summer, we're running something we've never done before.</p>
				<p class="bold">&ZeroWidthSpace;</p>
				<p class="bold">7 hackathons. Ran by teenagers across the globe. For teenagers everywhere.</p>
				<p class="bold">&ZeroWidthSpace;</p>
				<p>Fly out to San Francisco, Sydney, Toronto, Berlin, Cairo, or Sao Paulo. For Free.</p>
				<p>Go on an adventure of a lifetime.</p>
			</div>

			<!-- How steps -->
			<div class="relative w-[832px] max-w-full h-[356px] mt-10 -ml-[81px]">
				<div class="absolute inset-0 overflow-hidden pointer-events-none">
					<img src={blurbPhoto} alt="" class="absolute max-w-none" style="width: 218.8%; height: 467.01%; left: -70.3%; top: -70.94%;" />
				</div>
				<div class="relative z-1 flex flex-col gap-4 justify-center h-full pl-[81px] pr-[80px] max-sm:px-6">
					<p class="text-2xl font-semibold text-black m-0 max-sm:text-lg">How?</p>
					<div class="flex gap-2 items-center">
						<div class="border-2 border-black rounded-full w-[30px] h-[30px] flex items-center justify-center text-xl text-black shrink-0">1</div>
						<p class="text-2xl text-black m-0 leading-[1.4] whitespace-nowrap max-sm:text-lg">Sign up for Horizons</p>
					</div>
					<div class="flex gap-2 items-start">
						<div class="border-2 border-black rounded-full w-[30px] h-[30px] flex items-center justify-center text-xl text-black shrink-0">2</div>
						<p class="text-2xl text-black m-0 leading-[1.4] whitespace-nowrap max-sm:text-lg">Spend 30-35 hours hacking & shipping projects<br /><span class="text-black/60">(that's about a week!)</span></p>
					</div>
					<div class="flex gap-2 items-start">
						<div class="border-2 border-black rounded-full w-[30px] h-[30px] flex items-center justify-center text-xl text-black shrink-0">3</div>
						<p class="text-2xl text-black m-0 leading-[1.4] whitespace-nowrap max-sm:text-lg">Earn your ticket to a hackathon of your choosing</p>
					</div>
				</div>
			</div>

			<!-- Side photos -->
			<div class="absolute right-[40px] top-[30px] w-[400px] h-full max-lg:hidden">
				<div class="absolute top-0 right-0 w-[305px] rotate-[6.55deg]">
					<img src={blurbPhoto2} alt="" class="w-full h-auto block" />
				</div>
				<div class="absolute top-[200px] -right-[30px] w-[305px] rotate-[-5.23deg]">
					<img src={blurbPhoto3} alt="" class="w-full h-auto block" />
				</div>
				<div class="absolute top-[400px] right-[10px] w-[305px] rotate-[4.2deg]">
					<img src={blurbPhoto4} alt="" class="w-full h-auto block" />
				</div>
			</div>
		</div>

		<div class="divider-bottom w-full aspect-[1444/120] overflow-hidden relative rotate-180">
			<img src={divider} alt="" />
		</div>
	</section>

</BG>

<style>
	/* Scrollbar */
	:global(.landing-page) {
		scrollbar-color: #8a7a6a #3d3428;
		scrollbar-width: thin;
	}

	:global(.landing-page)::-webkit-scrollbar {
		width: 10px;
	}

	:global(.landing-page)::-webkit-scrollbar-track {
		background: #3d3428;
	}

	:global(.landing-page)::-webkit-scrollbar-thumb {
		background: #6b5d50;
		border-radius: 5px;
	}

	:global(.landing-page)::-webkit-scrollbar-thumb:hover {
		background: #8a7a6a;
	}

	/* Text stroke */
	.hero-subtitle {
		-webkit-text-stroke: 8px #f3e8d8;
		paint-order: stroke fill;
	}

	.hero-title {
		-webkit-text-stroke: 8px #f3e8d8;
		paint-order: stroke fill;
	}

	/* Divider image positioning */
	.divider-top img,
	.divider-bottom img {
		position: absolute;
		width: 100%;
		height: 901.27%;
		top: -393.65%;
		left: 0;
		max-width: none;
		display: block;
	}

	/* Signup button blink */
	.signup-btn {
		background-color: #fba74d;
	}

	.signup-btn.valid {
		animation: white-blink 1s ease-in-out infinite;
	}

	@keyframes white-blink {
		0%, 100% { background-color: #fdd9a8; }
		50% { background-color: #fba74d; }
	}

	/* Email input states */
	.email-input::placeholder {
		color: rgba(0, 0, 0, 0.5);
	}

	.email-input:focus {
		color: black;
	}

</style>
