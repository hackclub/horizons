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

	// Assets - Previous Events
	import prevEventBg1 from '$lib/assets/landing/prev-event-bg-1.png';
	import prevEventBg2 from '$lib/assets/landing/prev-event-bg-2.png';
	import prevEventBg3 from '$lib/assets/landing/prev-event-bg-3.png';
	import prevEventLogo1 from '$lib/assets/landing/prev-event-logo-1.png';
	import prevEventPhoto1 from '$lib/assets/landing/prev-event-photo-1.png';
	import prevEventLogo2 from '$lib/assets/landing/prev-event-logo-2.png';
	import prevEventPhoto2 from '$lib/assets/landing/prev-event-photo-2.png';
	import prevEventPhoto3 from '$lib/assets/landing/prev-event-photo-3.png';
	import campfireLogo from '$lib/assets/landing/campfire-logo.png';
	import campfirePhoto from '$lib/assets/landing/campfire-photo.png';
	import scrapyardLogo from '$lib/assets/landing/scrapyard-logo.svg';

	// Assets - This Summer
	import createGlobe from 'cobe';
	import yaml from 'js-yaml';
	import eventsRaw from '$lib/events/events.yaml?raw';
	import type { EventConfig } from '$lib/events/types';

	// Assets - Photo collage
	import photo1 from '$lib/assets/landing/photo-1.png';
	import photo2 from '$lib/assets/landing/photo-2.png';
	import photo3 from '$lib/assets/landing/photo-3.png';
	import photo4 from '$lib/assets/landing/photo-4.png';
	import photo5 from '$lib/assets/landing/photo-5.png';
	import photo6 from '$lib/assets/landing/photo-6.png';
	import photo7 from '$lib/assets/landing/photo-7.png';
	import photo8 from '$lib/assets/landing/photo-8.png';

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
	let activeVideo = $state<string | null>(null);
	let globeCanvas = $state<HTMLCanvasElement | null>(null);
	const isValidEmail = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupEmail));

	const eventsMap = yaml.load(eventsRaw) as Record<string, EventConfig>;
	const eventEntries = Object.entries(eventsMap);

	let selectedEventIndex = $state(0);
	let eventScrollOffset = $state(0);
	let eventListEl: HTMLDivElement;
	let targetPhi = $state(0);
	let targetTheta = $state(0.2);

	// Convert lat/lng to cobe phi/theta
	// To face a marker at [lat, lng], we need phi = -lng in radians
	// (cobe internally offsets by -PI, so we add PI to compensate)
	function locationToGlobe(loc: [number, number]): { phi: number; theta: number } {
		return {
			phi: -loc[1] * (Math.PI / 180) - 2 * Math.PI / 3,
			theta: loc[0] * (Math.PI / 180)
		};
	}

	function updateEventScroll() {
		if (!eventListEl) return;
		const cards = eventListEl.querySelectorAll('.event-card') as NodeListOf<HTMLElement>;
		const card = cards[selectedEventIndex];
		if (!card) return;

		// Anchor selected card at ~20% from left
		const containerWidth = eventListEl.parentElement?.clientWidth ?? 0;
		const anchorX = containerWidth * 0.2;
		const offset = -(card.offsetLeft - anchorX);
		eventScrollOffset = Math.min(offset, 0);
	}

	function selectEvent(index: number) {
		selectedEventIndex = index;
		updateEventScroll();
		const event = eventEntries[index][1];
		if (event.location) {
			const { phi, theta } = locationToGlobe(event.location);
			targetPhi = phi;
			targetTheta = theta;
		}
	}


	function hexToRgb(hex: string): [number, number, number] {
		const h = hex.replace('#', '');
		return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
	}

	onMount(() => {
		// Initialize globe (cobe v2 API)
		function buildMarkers() {
			return eventEntries
				.filter(([, e]) => e.location)
				.map(([, e], i) => ({
					location: e.location!,
					size: i === selectedEventIndex ? 0.1 : 0.04,
					color: i === selectedEventIndex ? hexToRgb(e.colors.primary) : [0.5, 0.5, 0.5] as [number, number, number]
				}));
		}

		// Set initial globe position to first event
		const firstEvent = eventEntries[0][1];
		if (firstEvent.location) {
			const { phi, theta } = locationToGlobe(firstEvent.location);
			targetPhi = phi;
			targetTheta = theta;
		}

		let currentPhi = targetPhi;
		let currentTheta = targetTheta;

		const globeInstance = createGlobe(globeCanvas!, {
			devicePixelRatio: 2,
			width: 1000,
			height: 1000,
			phi: currentPhi,
			theta: currentTheta,
			dark: 2,
			diffuse: -3,
			scale: 1,
			offset: [0, 0],
			mapSamples: 16000,
			mapBrightness: 6,
			baseColor: [1, 1, 1],
			markerColor: [1, 0.5, 0],
			glowColor: [0, 0, 0],
			markers: buildMarkers(),
			markerElevation: 0.01,
		});

		let animFrame: number;
		function animate() {
			// Lerp with shortest angular path for phi
			let dPhi = targetPhi - currentPhi;
			// Normalize to [-PI, PI] to always take the short way around
			dPhi = ((dPhi + Math.PI) % (2 * Math.PI)) - Math.PI;
			if (dPhi < -Math.PI) dPhi += 2 * Math.PI;
			currentPhi += dPhi * 0.05;
			currentTheta += (targetTheta - currentTheta) * 0.05;
			globeInstance.update({ phi: currentPhi, theta: currentTheta, markers: buildMarkers() });
			animFrame = requestAnimationFrame(animate);
		}
		animate();

		// Prevent browser focus restore from auto-selecting the card
		setTimeout(() => {
			if (!signupEmail) {
				(document.activeElement as HTMLElement)?.blur();
				cardSelected = false;
				emailFocused = false;
			}
			updateEventScroll();
		}, 50);

		return () => {
			cancelAnimationFrame(animFrame);
			globeInstance.destroy();
		};

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

	<!-- ===== PHOTO COLLAGE ===== -->
	<section class="relative z-1 h-[798px] overflow-hidden max-lg:h-[500px]">
		<div class="absolute w-[14%]" style="left: 16%; top: 0; transform: rotate(-3.38deg);"><img src={photo1} alt="" class="w-full h-auto block" /></div>
		<div class="absolute" style="left: -10%; top: -8%; transform: rotate(7.38deg); width: 27%;"><img src={photo2} alt="" class="w-full h-auto block" /></div>
		<div class="absolute" style="left: -5%; top: 60%; transform: rotate(-6.94deg); width: 30%;"><img src={photo3} alt="" class="w-full h-auto block" /></div>
		<div class="absolute" style="left: 59%; top: -10%; transform: rotate(-4.55deg); width: 22%;"><img src={photo4} alt="" class="w-full h-auto block" /></div>
		<div class="absolute" style="left: 79%; top: -6%; transform: rotate(5.71deg); width: 24%;"><img src={photo5} alt="" class="w-full h-auto block" /></div>
		<div class="absolute" style="left: 81%; top: 71%; transform: rotate(-5.71deg); width: 20%;"><img src={photo6} alt="" class="w-full h-auto block" /></div>
		<div class="absolute" style="left: 88%; top: 55%; transform: rotate(3.05deg); width: 15%;"><img src={photo7} alt="" class="w-full h-auto block" /></div>
		<div class="absolute" style="left: 24%; top: 77%; transform: rotate(6.17deg); width: 16%;"><img src={photo8} alt="" class="w-full h-auto block" /></div>
	</section>

	<!-- ===== PREVIOUS EVENTS SECTION ===== -->
	<section class="relative z-1 p-[60px] max-sm:p-6 max-sm:pt-10">
		<h2 class="font-cook text-[32px] text-black m-0 mb-8 max-sm:text-2xl">Hackathons we've ran before...</h2>
		<div class="flex gap-8 items-center justify-center flex-wrap">
			<!-- Shipwrecked -->
			<a href="https://shipwrecked.hackclub.com" target="_blank" rel="noopener noreferrer" class="border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] flex flex-col items-center justify-between overflow-hidden relative shrink-0 w-70 h-95 p-6 no-underline transition-transform duration-200 hover:scale-105 bg-[#f3e8d8] bg-cover bg-center" style="background-image: url({prevEventBg1})">
				<img src={prevEventLogo1} alt="Shipwrecked" class="relative z-1 object-cover w-[139px] h-[88px]" />
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="group/vid relative z-1 w-full aspect-video overflow-hidden rounded-lg cursor-pointer" onclick={(e) => { e.preventDefault(); e.stopPropagation(); activeVideo = 'uXWMr0gdLJA'; }} onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); activeVideo = 'uXWMr0gdLJA'; } }}>
					<img src="https://img.youtube.com/vi/uXWMr0gdLJA/maxresdefault.jpg" alt="" class="absolute inset-0 w-full h-full object-cover transition-transform duration-200 group-hover/vid:scale-110" />
					<div class="absolute inset-0 flex items-center justify-center bg-black/20 transition-opacity duration-200 opacity-70 group-hover/vid:opacity-100">
						<svg class="w-12 h-12 text-white drop-shadow-lg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
					</div>
				</div>
				<p class="relative z-1 text-base font-semibold text-black text-center m-0">A hackathon on an island in the Boston Harbor!</p>
			</a>

			<!-- Apocalypse -->
			<a href="https://apocalypse.hackclub.com" target="_blank" rel="noopener noreferrer" class="border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] flex flex-col items-center justify-between overflow-hidden relative shrink-0 w-70 h-95 p-6 no-underline transition-transform duration-200 hover:scale-105 bg-[#f3e8d8] bg-cover bg-center" style="background-image: linear-gradient(to bottom, transparent, rgba(0,0,0,0.6)), url({prevEventBg2})">
				<img src={prevEventLogo2} alt="Apocalypse" class="relative z-1 w-full object-cover" style="aspect-ratio: 3240/1080;" />
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="group/vid relative z-1 w-full aspect-video overflow-hidden rounded-lg cursor-pointer" onclick={(e) => { e.preventDefault(); e.stopPropagation(); activeVideo = 'QvCoISXfcE8'; }} onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); activeVideo = 'QvCoISXfcE8'; } }}>
					<img src="https://img.youtube.com/vi/QvCoISXfcE8/maxresdefault.jpg" alt="" class="absolute inset-0 w-full h-full object-cover transition-transform duration-200 group-hover/vid:scale-110" />
					<div class="absolute inset-0 flex items-center justify-center bg-black/20 transition-opacity duration-200 opacity-70 group-hover/vid:opacity-100">
						<svg class="w-12 h-12 text-white drop-shadow-lg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
					</div>
				</div>
				<p class="relative z-1 text-base font-semibold text-white text-center m-0 w-full">Canada's largest high school hackathon!</p>
			</a>

			<!-- Scrapyard -->
			<a href="https://scrapyard.hackclub.com" target="_blank" rel="noopener noreferrer" class="border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] flex flex-col items-center justify-between overflow-hidden relative shrink-0 w-70 h-95 p-6 no-underline transition-transform duration-200 hover:scale-105 bg-[#f3e8d8] bg-cover bg-center" style="background-image: url({prevEventBg3})">
				<img src={scrapyardLogo} alt="Scrapyard" class="relative z-1 w-[119px] h-[57px]" />
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="group/vid relative z-1 w-full aspect-video overflow-hidden rounded-lg cursor-pointer" onclick={(e) => { e.preventDefault(); e.stopPropagation(); activeVideo = '8iM1W8kXrQA'; }} onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); activeVideo = '8iM1W8kXrQA'; } }}>
					<img src="https://img.youtube.com/vi/8iM1W8kXrQA/maxresdefault.jpg" alt="" class="absolute inset-0 w-full h-full object-cover transition-transform duration-200 group-hover/vid:scale-110" />
					<div class="absolute inset-0 flex items-center justify-center bg-black/20 transition-opacity duration-200 opacity-70 group-hover/vid:opacity-100">
						<svg class="w-12 h-12 text-white drop-shadow-lg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
					</div>
				</div>
				<p class="relative z-1 text-base font-semibold text-white text-center m-0 w-full">A hackathon about building the stupidest projects ever</p>
			</a>

			<!-- Campfire -->
			<a href="https://flagship.campfire.hackclub.com" target="_blank" rel="noopener noreferrer" class="bg-[#160124] border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] flex flex-col items-center justify-between overflow-hidden relative shrink-0 w-70 h-95 p-6 no-underline transition-transform duration-200 hover:scale-105">
				<div class="relative z-1 w-[176px] h-[39px] overflow-hidden px-[5px]">
					<div class="w-full aspect-[1233/180] relative overflow-hidden">
						<img src={campfireLogo} alt="Campfire Flagship" class="absolute max-w-none" style="height: 181.11%; left: -4.46%; top: -11.11%; width: 109.81%;" />
					</div>
				</div>
				<div class="relative z-1 w-full aspect-video overflow-hidden rounded-lg">
					<img src={campfirePhoto} alt="" class="absolute inset-0 w-full h-full object-cover" />
				</div>
				<p class="relative z-1 text-base font-semibold text-white text-center m-0 w-full">A hackathon with a bunch of youtubers, including Michael Reeves and William Osman</p>
			</a>
		</div>
	</section>

	<!-- ===== THIS SUMMER SECTION ===== -->
	<section class="relative z-0" style="--divider-url: url('{divider}')">
		<!-- Event Carousel -->
		<div class="w-full relative overflow-hidden h-[750px]" style="background-color: {eventEntries[0][1].eventCard.bgColor}">
			<!-- Background image -->
			{#if eventEntries[0][1].eventCard.bgImage}
				<img src={eventEntries[0][1].eventCard.bgImage} alt="" class="absolute inset-0 w-full h-full object-cover" />
			{/if}
			{#if eventEntries[0][1].eventCard.gradient}
				<div class="absolute inset-0" style="background: {eventEntries[0][1].eventCard.gradient}"></div>
			{/if}

			<!-- Divider masks -->
			<div class="summer-divider-mask absolute top-0 left-0 w-full aspect-[1444/120] z-20" style="background-color: #f3e8d8;"></div>
			<div class="summer-divider-mask absolute bottom-0 left-0 w-full aspect-[1444/120] z-20 rotate-180" style="background-color: #f3e8d8;"></div>

			<div class="relative z-1 flex flex-col gap-8 h-full pt-[100px] pb-[100px] max-sm:pt-20 max-sm:pb-20 px-[60px] max-sm:px-8">
				<h2 class="font-cook text-[32px] text-black m-0 whitespace-nowrap" style="-webkit-text-stroke: 8px #f3e8d8; paint-order: stroke fill;">This summer, we're running...</h2>

				<div class="flex-1 min-h-0 overflow-visible relative">
					<div
						class="flex gap-6 items-center h-full"
						bind:this={eventListEl}
						style="transform: translateX({eventScrollOffset}px); transition: transform 0.4s ease;"
					>
						{#each eventEntries as [key, event], i}
							{@const selected = i === selectedEventIndex}
							<button
								class="event-card border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] flex flex-col items-center overflow-hidden relative shrink-0 p-9 cursor-pointer bg-cover bg-center transition-all duration-(--juice-duration) ease-(--juice-easing) {selected ? 'w-[325px] h-[435px] scale-(--juice-scale) justify-between' : 'w-[262px] h-[351px] opacity-80 hover:opacity-100 hover:scale-(--juice-scale) justify-center'}"
								style="background-color: {event.eventCard.bgColor};{event.eventCard.bgImage ? ` background-image: ${event.eventCard.gradient ? event.eventCard.gradient + ', ' : ''}url(${event.eventCard.bgImage});` : ''}"
								onclick={() => selectEvent(i)}
							>
								<!-- Gradient overlay for selected card -->
								<div class="absolute inset-0 rounded-[16px] bg-gradient-to-t from-black/70 to-transparent transition-opacity duration-(--juice-duration) {selected ? 'opacity-100' : 'opacity-0'}"></div>

								<img src={event.logo} alt={event.name} class="relative z-1 max-w-full h-auto object-contain transition-all duration-(--juice-duration) ease-(--juice-easing) {selected ? 'max-h-30 drop-shadow-[0px_0px_40px_rgba(0,0,0,0.6)]' : 'max-h-24'}" />

								<!-- Tagline (selected only) -->
								<p class="relative z-1 text-2xl text-center text-white m-0 transition-opacity duration-(--juice-duration) {selected ? 'opacity-100' : 'opacity-0 absolute bottom-9'}">
									{event.headline}
								</p>
							</button>
						{/each}
					</div>
				</div>

				<!-- 3D Globe -->
				<div class="shrink-0 max-lg:hidden absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-0 pointer-events-none">
					<canvas bind:this={globeCanvas} width="1000" height="1000" style="width: 900px; height: 900px;"></canvas>
				</div>
			</div>
		</div>
	</section>

	<!-- Video Modal -->
	{#if activeVideo}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 cursor-pointer" onclick={() => activeVideo = null} onkeydown={(e) => { if (e.key === 'Escape') activeVideo = null; }}>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="relative w-full max-w-4xl aspect-video mx-4" onclick={(e) => e.stopPropagation()}>
				<iframe
					src="https://www.youtube.com/embed/{activeVideo}?autoplay=1"
					title="Event video"
					class="w-full h-full rounded-xl"
					frameborder="0"
					allow="autoplay; encrypted-media"
					allowfullscreen
				></iframe>
				<button class="absolute -top-10 right-0 text-white text-3xl font-bold cursor-pointer bg-transparent border-none" onclick={() => activeVideo = null}>&times;</button>
			</div>
		</div>
	{/if}

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

	/* Summer section divider mask — inverted: brush stroke = hidden (carousel shows through),
	   transparent areas = visible (page bg). Two layers + exclude to invert. */
	.summer-divider-mask {
		-webkit-mask-image: var(--divider-url), linear-gradient(#fff, #fff);
		mask-image: var(--divider-url), linear-gradient(#fff, #fff);
		-webkit-mask-size: 100% 901.27%, 100% 100%;
		mask-size: 100% 901.27%, 100% 100%;
		-webkit-mask-position: 0 49.13%, 0 0;
		mask-position: 0 49.13%, 0 0;
		-webkit-mask-repeat: no-repeat, no-repeat;
		mask-repeat: no-repeat, no-repeat;
		-webkit-mask-composite: xor;
		mask-composite: exclude;
	}

	/* Hide scrollbar */
	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
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
