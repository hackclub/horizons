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
	import CircleIn from '$lib/components/anim/CircleIn.svelte';

	// Assets - Divider
	import divider from '$lib/assets/landing/divider.png';

	// Assets - Previous Events
	import prevEventBg1 from '$lib/assets/landing/prev-event-bg-1.webp';
	import prevEventBg2 from '$lib/assets/landing/prev-event-bg-2.webp';
	import prevEventBg3 from '$lib/assets/landing/prev-event-bg-3.webp';
	import prevEventLogo1 from '$lib/assets/landing/prev-event-logo-1.png';
	import prevEventLogo2 from '$lib/assets/landing/prev-event-logo-2.png';
	import campfireLogo from '$lib/assets/landing/campfire-logo.png';
	import campfirePhoto from '$lib/assets/landing/campfire-photo.webp';
	import scrapyardLogo from '$lib/assets/landing/scrapyard-logo.svg';

	// Assets - This Summer
	import createGlobe from 'cobe';
	import yaml from 'js-yaml';
	import eventsRaw from '$lib/events/events.yaml?raw';
	import type { EventConfig } from '$lib/events/types';
	import faqRaw from '$lib/data/faq.yaml?raw';

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
	import blurbPhoto from '$lib/assets/landing/blurb-photo.webp';
	import blurbPhoto2 from '$lib/assets/landing/blurb-photo-2.webp';
	import blurbPhoto3 from '$lib/assets/landing/blurb-photo-3.webp';
	import blurbPhoto4 from '$lib/assets/landing/blurb-photo-4.webp';

	let referralCode = $derived(page.url.searchParams.get('ref') ?? undefined);
	let utmSource = $derived(page.url.searchParams.get('utm_source') ?? undefined);

	let signupEmail = $state('');
	let showInvalidHint = $state(false);
	let cardSelected = $state(false);
	let emailFocused = $state(false);
	let ctaEmail = $state('');
	let ctaInvalidHint = $state(false);
	let ctaCardSelected = $state(false);
	let ctaEmailFocused = $state(false);
	let isReturningUser = $state(false);
	let activeVideo = $state<string | null>(null);
	let globeCanvas = $state<HTMLCanvasElement | null>(null);
	const isValidEmail = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupEmail));
	const isValidCtaEmail = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ctaEmail));

	const eventsMap = yaml.load(eventsRaw) as Record<string, EventConfig>;
	const eventEntries = Object.entries(eventsMap);
	const faqItems = yaml.load(faqRaw) as { question: string; answer: string }[];
	let openFaqIndex = $state<number | null>(null);

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

	let autoRotateTimer: ReturnType<typeof setInterval>;
	let inactivityTimer: ReturnType<typeof setTimeout>;
	let autoRotateActive = $state(false);
	let summerSectionEl: HTMLElement;
	let timerProgress = $state(0);
	let timerAnimFrame: number;
	let timerStart = 0;
	const AUTO_ROTATE_MS = 10000;
	const INACTIVITY_MS = 45000;

	function startTimerAnimation() {
		timerStart = Date.now();
		cancelAnimationFrame(timerAnimFrame);
		function tick() {
			if (!autoRotateActive) { timerProgress = 0; return; }
			timerProgress = (Date.now() - timerStart) / AUTO_ROTATE_MS;
			if (timerProgress >= 1) { timerProgress = 0; return; }
			timerAnimFrame = requestAnimationFrame(tick);
		}
		tick();
	}

	function startAutoRotate() {
		autoRotateActive = true;
		clearInterval(autoRotateTimer);
		startTimerAnimation();
		autoRotateTimer = setInterval(() => {
			selectEvent((selectedEventIndex + 1) % eventEntries.length, false);
		}, AUTO_ROTATE_MS);
	}

	function stopAutoRotate() {
		autoRotateActive = false;
		clearInterval(autoRotateTimer);
		cancelAnimationFrame(timerAnimFrame);
		timerProgress = 0;
	}

	function resetInactivityTimer() {
		clearTimeout(inactivityTimer);
		inactivityTimer = setTimeout(() => {
			startAutoRotate();
		}, INACTIVITY_MS);
	}

	function selectEvent(index: number, manual = true) {
		selectedEventIndex = index;
		updateEventScroll();
		const event = eventEntries[index][1];
		if (event.location) {
			const { phi, theta } = locationToGlobe(event.location);
			targetPhi = phi;
			targetTheta = theta;
		}
		if (manual) {
			stopAutoRotate();
			resetInactivityTimer();
		} else {
			startTimerAnimation();
		}
	}


	function hexToRgb(hex: string): [number, number, number] {
		const h = hex.replace('#', '');
		return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
	}

	async function goToApp() {
		if (env.PUBLIC_ENABLE_ONBOARDING === 'true') {
			const { data } = await api.GET('/api/user/auth/onboarding-status');
			if (data && !data.onboardComplete) {
				window.location.href = '/app/onboarding';
				return;
			}
		}
		window.location.href = '/app';
	}

	onMount(() => {
		api.GET('/api/user/auth/me').then(response => {
			if (response.data && response.data.hcaId) {
				isReturningUser = true;
			}
		});

		// Patch WebGL to override cobe's fragment shader for a flat cell-shaded look
		const origGetContext = globeCanvas!.getContext.bind(globeCanvas!);
		(globeCanvas as any).getContext = (type: string, attrs?: any) => {
			const gl = origGetContext(type, attrs);
			if (!gl || !('shaderSource' in gl)) return gl;

			const origShaderSource = gl.shaderSource.bind(gl);
			gl.shaderSource = (shader: WebGLShader, source: string) => {
				// Replace the globe fragment shader (contains the glow/diffuse logic)
				if (source.includes('gl_FragColor') && source.includes('uniform vec3 F,w') && source.includes('uniform vec4 n')) {
					source = `precision highp float;
uniform vec2 t,v,s;
uniform vec3 F,w;
uniform vec4 n;
uniform float k,x,y;
uniform sampler2D z;
float u;
mat3 A(float a,float b){float c=cos(a),d=cos(b),e=sin(a),f=sin(b);return mat3(d,f*e,-f*c,0,c,e,f,d*-e,d*c);}
vec3 B(vec3 c,out float G){c=c.xzy;float q=max(2.,floor(log2(2.236068*k*3.141593*(1.-c.z*c.z))*.72021));vec2 g=floor(pow(1.618034,q)/2.236068*vec2(1,1.618034)+.5),d=fract((g+1.)*.618034)*6.283185-3.883222,e=-2.*g,f=vec2(atan(c.y,c.x),c.z-1.),r=floor(vec2(e.y*f.x-d.y*(f.y*k+1.),-e.x*f.x+d.x*(f.y*k+1.))/(d.x*e.y-e.x*d.y));float o=3.141593;vec3 C;for(float h=0.;h<4.;h+=1.){vec2 D=vec2(mod(h,2.),floor(h*.5));float j=dot(g,r+D);if(j>k)continue;float a=j,b=0.;a>=16384.?(a-=16384.,b+=.868872):0.,a>=8192.?(a-=8192.,b+=.934436):0.,a>=4096.?(a-=4096.,b+=.467218):0.,a>=2048.?(a-=2048.,b+=.733609):0.,a>=1024.?(a-=1024.,b+=.866804):0.,a>=512.?(a-=512.,b+=.433402):0.,a>=256.?(a-=256.,b+=.216701):0.,a>=128.?(a-=128.,b+=.108351):0.,a>=64.?(a-=64.,b+=.554175):0.,a>=32.?(a-=32.,b+=.777088):0.,a>=16.?(a-=16.,b+=.888544):0.,a>=8.?(a-=8.,b+=.944272):0.,a>=4.?(a-=4.,b+=.472136):0.,a>=2.?(a-=2.,b+=.236068):0.,a>=1.?(a-=1.,b+=.618034):0.;float l=fract(b)*6.283185,i=1.-2.*j*u,m=sqrt(1.-i*i);vec3 p=vec3(cos(l)*m,sin(l)*m,i);float E=length(c-p);if(E<o)o=E,C=p;}G=o;return C.xzy;}
void main(){
  u=1./k;
  vec2 c=1./t,b=(gl_FragCoord.xy*c*2.-1.)/x-v*vec2(1,-1)*c;
  b.x*=t.x*c.y;
  float a=dot(b,b);
  float edge=smoothstep(.635,.64,a);
  if(a>.65){discard;}
  float g;
  vec3 h=normalize(vec3(b,sqrt(max(.64-a,0.001))));
  mat3 o=A(s.y,s.x);
  vec3 d=B(h*o,g);
  float j=asin(d.y),e=acos(-d.x/cos(j));
  e=d.z<0.?-e:e;
  float p=max(texture2D(z,vec2(e*.5/3.141593,-(j/3.141593+.5))).x,y);
  float q=p*smoothstep(8e-3,0.,g)*n.x;
  // Flat beige base, map dots as slightly darker beige
  vec3 col=F*(1.0 - q*0.15);
  // Black outline at globe edge — flush with the edge
  float outline=smoothstep(.618,.619,a);
  col=mix(col,vec3(0.0),outline);
  gl_FragColor=vec4(col,(1.0-edge));
}`;
				}
				// Tighten marker culling — less peeking around globe edge
				if (source.includes('attribute vec3 p,w') && source.includes('m=n,g=w,h=x')) {
					source = source.replace('length(l.xy)<.8', 'length(l.xy)<.85');
				}
				// Replace marker fragment shader to add black outline per-marker
				if (source.includes('gl_FragColor') && source.includes('varying vec2 m') && source.includes('varying vec3 g') && source.includes('uniform vec3 v') && !source.includes('uniform vec2 t')) {
					source = `precision highp float;
varying vec2 m;
varying vec3 g;
varying float h;
uniform vec3 v;
void main(){
  float dist=length(m);
  if(dist>.25)discard;
  vec3 a=h>.5?g:v;
  float outlineStart=h>.5?.19:.22;
  if(dist>outlineStart)a=vec3(0.0);
  gl_FragColor=vec4(a,1.0);
}`;
				}
				return origShaderSource(shader, source);
			};
			return gl;
		};

		// Initialize globe markers
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
			dark: 0,
			diffuse: 0,
			scale: 1,
			offset: [0, 0],
			mapSamples: 40000,
			mapBrightness: 6,
			mapBaseBrightness: 0,
			baseColor: [0.95, 0.91, 0.85],
			markerColor: [1, 0.5, 0],
			glowColor: [0, 0, 0],
			opacity: 1,
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

		// Start auto-rotate when section comes into view
		const sectionObserver = new IntersectionObserver((entries) => {
			if (entries[0].isIntersecting) {
				startAutoRotate();
				sectionObserver.disconnect();
			}
		}, { threshold: 0.3 });
		if (summerSectionEl) sectionObserver.observe(summerSectionEl);

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
			cancelAnimationFrame(timerAnimFrame);
			clearInterval(autoRotateTimer);
			clearTimeout(inactivityTimer);
			sectionObserver.disconnect();
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
	let ctaCardInView = $state(false);

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

	function handleCtaEmailKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (isValidCtaEmail) {
				ctaInvalidHint = false;
				handleSignup(ctaEmail);
			} else {
				ctaInvalidHint = true;
			}
		}
	}

	function selectCtaCard() {
		ctaCardSelected = true;
		document.getElementById('cta-email')?.focus({ preventScroll: true });
	}

	function handleGlobalKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !emailFocused && !ctaEmailFocused) {
			if (ctaCardInView) {
				e.preventDefault();
				if (isReturningUser) goToApp();
				else selectCtaCard();
			} else if (cardInView) {
				e.preventDefault();
				if (isReturningUser) goToApp();
				else selectCard();
			}
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

	function observeCtaCard(node: HTMLElement) {
		const observer = new IntersectionObserver(
			([entry]) => { ctaCardInView = entry.isIntersecting; },
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

<BG class="landing-page overflow-x-hidden overflow-y-auto overscroll-none font-['Bricolage_Grotesque',sans-serif]">
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
		<img src={flagOrpheus} alt="Hack Club" class="absolute -top-1 left-[59px] w-[135px] h-auto z-5 sm:left-[59px] max-sm:left-[24px] max-sm:w-[200px] max-sm:h-auto" />
	</div>

	<!-- ===== HERO SECTION ===== -->
	<section class="relative flex flex-col gap-6 pt-[70px] px-[59px] max-w-[1020px] max-lg:px-6 max-lg:pt-[80px] sm:h-[70vh] sm:min-h-[600px] sm:z-1 max-sm:items-center max-sm:pt-24 max-sm:pb-10 max-sm:px-4">
		<img src={heroLogo} alt="Horizons" class="w-[560px] h-auto max-lg:w-full max-lg:max-w-[560px] max-sm:mt-6" />

		<div class="font-cook max-sm:text-center">
			<p class="hero-subtitle text-[32px] text-black m-0 leading-[1.2] max-sm:text-base max-sm:whitespace-normal whitespace-nowrap">We're running 7 hackathons across the world.</p>
			<p class="hero-title text-[48px] text-black m-0 leading-[1.2] max-sm:text-2xl">And you're invited.</p>
		</div>

		<!-- Signup Card (desktop) -->
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			use:observeCard
			class="max-sm:hidden signup-card border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] w-[904px] max-w-full relative overflow-hidden cursor-pointer bg-[#f3e8d8] max-lg:w-full origin-left transition-all duration-(--juice-duration) ease-(--juice-easing) {cardSelected ? 'scale-[1.05]' : 'scale-100'}"
			onmousedown={(e) => { e.preventDefault(); if (isReturningUser) goToApp(); else selectCard(); }}
		>
			<!-- Orange fill -->
			<div class="absolute inset-0 bg-[#ffa936] transition-opacity duration-(--selected-duration) {cardSelected || isReturningUser ? 'opacity-100' : 'opacity-0'}"></div>
			<!-- Chevron arrows -->
			<div class="absolute right-[10%] top-[45%] -translate-y-1/2 scale-[2.1] pointer-events-none transition-opacity duration-(--selected-duration) delay-100 {cardSelected || isReturningUser ? 'opacity-100' : 'opacity-0'}">
				<img src={ChevronSvg} alt="" class="h-[180px] w-auto" />
			</div>
			{#if isReturningUser}
				<div class="relative flex flex-col items-center justify-center gap-6 py-5 px-[30px] z-1">
					<p class="font-cook text-[48px] text-black m-0 leading-none">LOG BACK IN</p>
					<div class="flex gap-2 items-center [&_div]:h-8! [&_div]:shrink!">
						<InputPrompt type="Enter" />
						<p class="font-bold text-sm text-black leading-6">OR</p>
						<InputPrompt type="click" />
						<p class="font-bold text-sm text-black leading-6">TO LOG BACK IN</p>
					</div>
				</div>
			{:else}
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
			{/if}
		</div>

		<!-- Signup (mobile) -->
		<div class="hidden max-sm:flex flex-col gap-3 w-full">
			{#if isReturningUser}
				<button
					class="signup-btn valid border-2 border-black rounded-lg py-2 px-4 font-bricolage text-2xl font-semibold text-black cursor-pointer w-full"
					onclick={goToApp}
				>LOG BACK IN</button>
			{:else}
				<input
					type="email"
					class="email-input bg-[#f3e8d8] border-2 border-black rounded-lg py-2 px-4 font-bricolage text-2xl font-semibold text-black/50 outline-none w-full"
					placeholder="orpheus@hackclub.com"
					bind:value={signupEmail}
					onkeydown={(e) => handleEmailKeydown(e)}
					oninput={() => { if (showInvalidHint) showInvalidHint = false; }}
					onfocus={() => { emailFocused = true; }}
					onblur={() => { emailFocused = false; }}
				/>
				<button
					class="signup-btn border-2 border-black rounded-lg py-2 px-4 font-bricolage text-2xl font-semibold text-black cursor-pointer w-full"
					class:valid={isValidEmail}
					onclick={() => {
						if (isValidEmail) handleSignup(signupEmail);
						else showInvalidHint = true;
					}}
				>SIGN UP</button>
				{#if showInvalidHint}
					<p class="font-bricolage text-sm m-0 text-[#c00] text-center">Please enter a valid email</p>
				{/if}
			{/if}
		</div>

		<p class="font-['Bricolage_Grotesque',sans-serif] text-2xl font-medium text-[#666] max-sm:hidden">Scroll to read more...</p>
	</section>

	<!-- ===== BLURB SECTION ===== -->
	<section class="relative flex flex-col items-center sm:-mt-5 sm:z-0">
		<div class="divider-top w-full aspect-[1444/120] overflow-hidden relative">
			<img src={divider} alt="" />
		</div>

		<div class="bg-black w-full relative py-[51px] px-[81px] pb-[60px] min-h-[620px] max-sm:min-h-0 overflow-hidden max-sm:overflow-visible max-sm:py-[30px] max-sm:px-4">
			<div class="text-white text-2xl leading-relaxed max-w-[700px] max-sm:text-lg [&_p]:m-0 [&_.bold]:font-bold">
				<p>This summer, we're running something we've never done before.</p>
				<p class="bold">&ZeroWidthSpace;</p>
				<p class="bold">7 hackathons. Ran by teenagers across the globe. For teenagers everywhere.</p>
				<p class="bold">&ZeroWidthSpace;</p>
				<p>Fly out to San Francisco, Sydney, Toronto, Berlin, Cairo, or Sao Paulo. For Free.</p>
				<p>Go on an adventure of a lifetime.</p>
			</div>

			<!-- How steps -->
			<div class="relative w-[832px] max-w-full h-[356px] max-sm:h-auto mt-10 -ml-[81px] max-sm:-ml-4 max-sm:-mr-20 max-sm:w-[calc(100%+6rem)]">
				<div class="absolute inset-0 max-sm:-left-4 max-sm:-right-8 max-sm:-top-8 max-sm:-bottom-8 overflow-hidden pointer-events-none">
					<img src={blurbPhoto} alt="" class="absolute max-w-none" style="width: 218.8%; height: 467.01%; left: -70.3%; top: -70.94%;" />
				</div>
				<div class="relative z-1 flex flex-col gap-4 justify-center h-full pl-[81px] pr-[80px] max-sm:pl-10 max-sm:pr-4 max-sm:py-8">
					<p class="text-2xl font-semibold text-black m-0 max-sm:text-lg">How?</p>
					<div class="flex gap-2 items-center">
						<div class="border-2 border-black rounded-full w-[30px] h-[30px] flex items-center justify-center text-xl text-black shrink-0">1</div>
						<p class="text-2xl text-black m-0 leading-[1.4] whitespace-nowrap max-sm:whitespace-normal max-sm:text-lg">Sign up for Horizons</p>
					</div>
					<div class="flex gap-2 items-start">
						<div class="border-2 border-black rounded-full w-[30px] h-[30px] flex items-center justify-center text-xl text-black shrink-0">2</div>
						<p class="text-2xl text-black m-0 leading-[1.4] whitespace-nowrap max-sm:whitespace-normal max-sm:text-lg">Spend 30-35 hours hacking & shipping projects<br /><span class="text-black/60">(that's about a week!)</span></p>
					</div>
					<div class="flex gap-2 items-start">
						<div class="border-2 border-black rounded-full w-[30px] h-[30px] flex items-center justify-center text-xl text-black shrink-0">3</div>
						<p class="text-2xl text-black m-0 leading-[1.4] whitespace-nowrap max-sm:whitespace-normal max-sm:text-lg">Earn your ticket to a hackathon of your choosing</p>
					</div>
				</div>
			</div>

			<!-- Side photos (desktop: absolute positioned, mobile: stacked) -->
			<div class="absolute right-[40px] top-[30px] w-[400px] h-full max-sm:hidden">
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
			<!-- Mobile blurb photos -->
			<div class="hidden max-sm:flex flex-col gap-4 mt-8 -mx-4">
				<div class="rotate-[6.55deg] w-[90%]"><img src={blurbPhoto2} alt="" class="w-full h-auto block" /></div>
				<div class="rotate-[-5.23deg] w-[90%] self-end"><img src={blurbPhoto3} alt="" class="w-full h-auto block" /></div>
				<div class="rotate-[4.2deg] w-[85%]"><img src={blurbPhoto4} alt="" class="w-full h-auto block" /></div>
			</div>
		</div>

		<div class="divider-bottom w-full aspect-[1444/120] overflow-hidden relative rotate-180">
			<img src={divider} alt="" />
		</div>
	</section>

	<!-- ===== PHOTO COLLAGE ===== -->
	<!-- Desktop: original 8 photos -->
	<section class="relative z-1 h-[798px] overflow-hidden max-lg:h-[500px] max-sm:!hidden">
		<div class="absolute w-[14%]" style="left: 16%; top: 0; transform: rotate(-3.38deg);"><img src={photo1} alt="" class="w-full h-auto block" /></div>
		<div class="absolute" style="left: -10%; top: -8%; transform: rotate(7.38deg); width: 27%;"><img src={photo2} alt="" class="w-full h-auto block" /></div>
		<div class="absolute" style="left: -5%; top: 60%; transform: rotate(-6.94deg); width: 30%;"><img src={photo3} alt="" class="w-full h-auto block" /></div>
		<div class="absolute" style="left: 59%; top: -10%; transform: rotate(-4.55deg); width: 22%;"><img src={photo4} alt="" class="w-full h-auto block" /></div>
		<div class="absolute" style="left: 79%; top: -6%; transform: rotate(5.71deg); width: 24%;"><img src={photo5} alt="" class="w-full h-auto block" /></div>
		<div class="absolute" style="left: 81%; top: 71%; transform: rotate(-5.71deg); width: 20%;"><img src={photo6} alt="" class="w-full h-auto block" /></div>
		<div class="absolute" style="left: 88%; top: 55%; transform: rotate(3.05deg); width: 15%;"><img src={photo7} alt="" class="w-full h-auto block" /></div>
		<div class="absolute" style="left: 24%; top: 77%; transform: rotate(6.17deg); width: 16%;"><img src={photo8} alt="" class="w-full h-auto block" /></div>
	</section>
	<!-- Mobile: blurb photos as collage -->
	<section class="!hidden relative z-1 h-[350px] overflow-hidden max-sm:!block">
		<div class="absolute" style="left: -15%; top: -5%; transform: rotate(6.55deg); width: 75%;"><img src={blurbPhoto2} alt="" class="w-full h-auto block" /></div>
		<div class="absolute" style="left: 40%; top: 40%; transform: rotate(-5.23deg); width: 75%;"><img src={blurbPhoto3} alt="" class="w-full h-auto block" /></div>
		<div class="absolute" style="left: -10%; top: 55%; transform: rotate(4.2deg); width: 65%;"><img src={blurbPhoto4} alt="" class="w-full h-auto block" /></div>
	</section>

	<!-- ===== PREVIOUS EVENTS SECTION ===== -->
	<section class="relative z-1 p-[60px] max-sm:p-6 max-sm:pt-10">
		<h2 class="font-cook text-[32px] text-black m-0 mb-8 max-sm:text-base">Hackathons we've ran before...</h2>
		<div class="flex gap-8 items-center justify-center flex-wrap max-sm:flex-col max-sm:gap-8">
			<!-- Shipwrecked -->
			<a href="https://shipwrecked.hackclub.com" target="_blank" rel="noopener noreferrer" class="border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] flex flex-col items-center justify-between overflow-hidden relative shrink-0 w-70 h-95 p-6 no-underline transition-transform duration-200 hover:scale-105 bg-[#f3e8d8] bg-cover bg-center max-sm:w-full max-sm:h-auto max-sm:p-4 max-sm:gap-2.5" style="background-image: url({prevEventBg1})">
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
			<a href="https://apocalypse.hackclub.com" target="_blank" rel="noopener noreferrer" class="border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] flex flex-col items-center justify-between overflow-hidden relative shrink-0 w-70 h-95 p-6 no-underline transition-transform duration-200 hover:scale-105 bg-[#f3e8d8] bg-cover bg-center max-sm:w-full max-sm:h-auto max-sm:p-4 max-sm:gap-2.5" style="background-image: linear-gradient(to bottom, transparent, rgba(0,0,0,0.6)), url({prevEventBg2})">
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
			<a href="https://scrapyard.hackclub.com" target="_blank" rel="noopener noreferrer" class="border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] flex flex-col items-center justify-between overflow-hidden relative shrink-0 w-70 h-95 p-6 no-underline transition-transform duration-200 hover:scale-105 bg-[#f3e8d8] bg-cover bg-center max-sm:w-full max-sm:h-auto max-sm:p-4 max-sm:gap-2.5" style="background-image: url({prevEventBg3})">
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
			<a href="https://flagship.campfire.hackclub.com" target="_blank" rel="noopener noreferrer" class="max-sm:hidden bg-[#160124] border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] flex flex-col items-center justify-between overflow-hidden relative shrink-0 w-70 h-95 p-6 no-underline transition-transform duration-200 hover:scale-105">
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
	<section bind:this={summerSectionEl} class="relative z-0" style="--divider-url: url('{divider}')">
		<!-- Event Carousel -->
		<div class="w-full relative overflow-hidden h-[750px] max-sm:h-auto transition-colors duration-(--selected-duration) ease-out" style="background-color: {eventEntries[selectedEventIndex][1].eventCard.bgColor}">
			<!-- Background image -->
			{#if eventEntries[selectedEventIndex][1].eventCard.bgImage}
				<img src={eventEntries[selectedEventIndex][1].eventCard.bgImage} alt="" class="absolute inset-0 w-full h-full object-cover transition-opacity duration-(--selected-duration) ease-out" />
			{/if}
			{#if eventEntries[selectedEventIndex][1].eventCard.gradient}
				<div class="absolute inset-0 transition-opacity duration-(--selected-duration) ease-out" style="background: {eventEntries[selectedEventIndex][1].eventCard.gradient}"></div>
			{/if}

			<!-- Divider masks -->
			<div class="summer-divider-mask absolute top-0 left-0 w-full aspect-[1444/120] z-20" style="background-color: #f3e8d8;"></div>
			<div class="summer-divider-mask absolute bottom-0 left-0 w-full aspect-[1444/120] z-20 rotate-180" style="background-color: #f3e8d8;"></div>

			<div class="relative z-1 flex flex-col gap-8 h-full pt-[100px] pb-[100px] max-sm:pt-20 max-sm:pb-10 px-[60px] max-sm:px-4">
				<h2 class="font-cook text-[32px] max-sm:text-base text-black m-0 whitespace-nowrap" style="-webkit-text-stroke: 8px #f3e8d8; paint-order: stroke fill;">This summer, we're running...</h2>

				<div class="flex-1 min-h-0 overflow-visible relative max-sm:overflow-hidden">
					<div
						class="flex gap-6 items-center h-full max-sm:flex-col max-sm:gap-8 max-sm:h-auto max-sm:items-stretch"
						bind:this={eventListEl}
						style="transform: translateX({eventScrollOffset}px); transition: transform 0.4s ease;"
					>
						{#each eventEntries as [key, event], i}
							{@const selected = i === selectedEventIndex}
							<button
								class="event-card border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] overflow-hidden relative shrink-0 cursor-pointer bg-cover bg-center max-sm:w-full max-sm:opacity-100 {selected ? 'opacity-100' : 'opacity-80 hover:opacity-100 hover:scale-(--juice-scale)'}"
								style="width: {selected ? '325px' : '262px'}; height: {selected ? '435px' : '351px'}; transition: all var(--juice-duration) var(--juice-easing); background-color: {event.eventCard.bgColor};{event.eventCard.bgImage ? ` background-image: ${event.eventCard.gradient ? event.eventCard.gradient + ', ' : ''}url(${event.eventCard.bgImage});` : ''}"
								onclick={() => selectEvent(i)}
							>
								<!-- Gradient overlay -->
								<div class="card-gradient absolute inset-0 rounded-[16px] bg-gradient-to-t from-black/70 to-transparent transition-opacity duration-(--selected-duration) ease-out {selected ? 'opacity-100' : 'opacity-0'}"></div>

								<!-- Logo + name + dates + location — absolutely positioned group, animates between center and top -->
								<div
									class="card-logo absolute z-1 left-9 right-9 flex flex-col items-center gap-2 transition-all duration-(--selected-duration) ease-out"
									style="top: {selected ? '36px' : '50%'}; transform: translateY({selected ? '0' : '-50%'}) scale({selected ? '1' : '0.9'});"
								>
									<img
										src={event.logo}
										alt={event.name}
										class="max-w-[80%] h-auto object-contain transition-all duration-(--selected-duration) ease-out mb-1"
										style="max-height: {selected ? '120px' : '96px'}; filter: {selected ? 'drop-shadow(0px 0px 40px rgba(0,0,0,0.6))' : 'none'};"
									/>
									<p
										class="font-cook text-white text-center m-0 whitespace-nowrap transition-all duration-(--selected-duration) ease-out"
										style="font-size: {selected ? '20px' : '16px'};"
									>{event.name}</p>
									{#if event.dates}
										<p class="font-cook text-gray-100 text-center text-sm m-0 whitespace-nowrap">{event.dates}</p>
									{/if}
									{#if event.locationText}
										<p class="text-gray-100 font-bold text-center text-sm m-0 whitespace-nowrap">{event.locationText}</p>
									{/if}
								</div>

								<!-- Tagline — fades in when selected -->
								<div
									class="card-tagline absolute left-9 right-9 z-1 flex flex-col items-center gap-1 transition-all duration-(--selected-duration) ease-out"
									style="bottom: {selected ? '24px' : '16px'}; opacity: {selected ? 1 : 0}; transform: translateY({selected ? '0' : '16px'});"
								>
									<p class="text-lg text-center text-white m-0 leading-snug">{event.landingBlurb}</p>
								</div>

								<!-- Auto-rotate timer indicator -->
								{#if selected && autoRotateActive}
									<div class="absolute bottom-0 left-0 right-0 h-0.5 bg-white/5 rounded-b-2xl overflow-hidden z-10">
										<div class="h-full bg-white/15" style="width: {timerProgress * 100}%;"></div>
									</div>
								{/if}
							</button>
						{/each}
					</div>
				</div>

			</div>
		</div>

		<!-- 3D Globe (outside carousel/masks) -->
		<div class="max-lg:hidden absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-30 pointer-events-none">
			<canvas bind:this={globeCanvas} width="1000" height="1000" style="width: 900px; height: 900px;"></canvas>
		</div>
	</section>

	<!-- ===== FAQ SECTION ===== -->
	<section class="relative z-1 p-[60px] max-sm:p-6 max-sm:pt-10">
		<h2 class="font-cook text-[32px] text-black m-0 mb-8 max-sm:text-2xl">FAQ</h2>
		<div class="flex flex-col gap-5 w-full">
			{#each faqItems as item, i}
				{@const isOpen = openFaqIndex === i}
				<button
					class="relative bg-[#f3e8d8] border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] p-6 text-left cursor-pointer overflow-hidden transition-all duration-(--juice-duration) ease-(--juice-easing) hover:scale-(--juice-scale) w-full"
					onclick={() => openFaqIndex = openFaqIndex === i ? null : i}
				>
					<div class="flex items-center justify-between gap-4">
						<p class="font-cook text-xl text-black m-0">{item.question}</p>
						<span
							class="faq-chevron text-black text-xl shrink-0 inline-block"
							class:faq-chevron-open={isOpen}
						>&#9660;</span>
					</div>
					<div
						class="faq-answer grid"
						class:faq-answer-open={isOpen}
						style="--faq-delay: {i * 0.03}s"
					>
						<div class="overflow-hidden">
							<p class="text-base text-black/80 m-0 pt-4">{item.answer}</p>
						</div>
					</div>
				</button>
			{/each}
		</div>
		<a href="/faq" class="inline-block mt-6 text-sm text-black/50 hover:text-black underline transition-colors">See all &rarr;</a>
	</section>

	<!-- ===== LOWER CTA SECTION ===== -->
	<section class="relative z-1">
		<!-- Colored stripes -->
		<div class="flex flex-col gap-2.5 w-full h-20">
			<div class="flex-1 bg-[#ffa936]"></div>
			<div class="flex-1 bg-[#f86d95]"></div>
			<div class="flex-1 bg-[#46467c]"></div>
		</div>

		<!-- CTA content — fixed height to prevent scale from shifting doc flow -->
		<div class="h-100 max-sm:h-auto overflow-hidden">
		<div class="flex flex-col items-center gap-8 py-16 px-[60px] max-sm:px-4 max-sm:py-8">
			<h2 class="font-cook text-[32px] max-sm:text-2xl text-black m-0 text-center">Join us this summer!</h2>

			<!-- CTA signup card (desktop) -->
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div
				use:observeCtaCard
				class="max-sm:hidden signup-card border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] w-[904px] max-w-full relative overflow-hidden cursor-pointer bg-[#f3e8d8] transition-all duration-(--juice-duration) ease-(--juice-easing) {ctaCardSelected ? 'scale-[1.05]' : 'scale-100'}"
				onmousedown={(e) => { e.preventDefault(); if (isReturningUser) goToApp(); else selectCtaCard(); }}
			>
				<!-- Orange fill -->
				<div class="absolute inset-0 bg-[#ffa936] transition-opacity duration-(--selected-duration) {ctaCardSelected || isReturningUser ? 'opacity-100' : 'opacity-0'}"></div>
				<!-- Chevron arrows -->
				<div class="absolute right-[10%] top-[45%] -translate-y-1/2 scale-[2.1] pointer-events-none transition-opacity duration-(--selected-duration) delay-100 {ctaCardSelected || isReturningUser ? 'opacity-100' : 'opacity-0'}">
					<img src={ChevronSvg} alt="" class="h-45 w-auto" />
				</div>
				{#if isReturningUser}
					<div class="relative flex flex-col items-center justify-center gap-6 py-5 px-7.5 z-1">
						<p class="font-cook text-[48px] text-black m-0 leading-none">LOG BACK IN</p>
						<div class="flex gap-2 items-center [&_div]:h-8! [&_div]:shrink!">
							<InputPrompt type="Enter" />
							<p class="font-bold text-sm text-black leading-6">OR</p>
							<InputPrompt type="click" />
							<p class="font-bold text-sm text-black leading-6">TO LOG BACK IN</p>
						</div>
					</div>
				{:else}
				<div class="relative flex flex-col gap-4 justify-center py-5 px-7.5 z-1">
					<p class="font-cook text-[32px] text-black m-0 leading-none">SIGN UP NOW</p>
					<div class="flex gap-3 items-center">
						<input
							id="cta-email"
							type="email"
							class="email-input bg-[#f3e8d8] border-2 border-black rounded-lg py-2 px-4 font-bricolage text-base font-semibold text-black/50 outline-none w-70"
							placeholder="orpheus@hackclub.com"
							bind:value={ctaEmail}
							onkeydown={(e) => handleCtaEmailKeydown(e)}
							oninput={() => { if (ctaInvalidHint) ctaInvalidHint = false; }}
							onclick={(e) => { e.stopPropagation(); ctaCardSelected = true; }}
							onfocus={() => { ctaCardSelected = true; ctaEmailFocused = true; }}
							onblur={() => { ctaEmailFocused = false; if (!ctaEmail) ctaCardSelected = false; }}
						/>
						<button
							class="signup-btn border-2 border-black rounded-lg py-2 px-4 font-bricolage text-base font-semibold text-black cursor-pointer transition-colors duration-150 hover:bg-[#e89a45]"
							class:valid={isValidCtaEmail}
							onclick={(e) => {
								e.stopPropagation();
								if (isValidCtaEmail) handleSignup(ctaEmail);
								else ctaInvalidHint = true;
							}}
						>SIGN UP</button>
					</div>
					{#if ctaInvalidHint}
						<p class="font-bricolage text-sm m-0 text-[#c00]">Please enter a valid email</p>
					{/if}
					<div class="flex gap-2 items-center [&_div]:h-8! [&_div]:shrink! transition-all duration-(--selected-duration) ease-out {ctaEmailFocused ? 'opacity-0 pointer-events-none max-h-0 -mt-4 overflow-hidden' : 'opacity-100 max-h-10'}">
						<InputPrompt type="Enter" />
						<p class="font-bold text-sm text-black leading-6">OR</p>
						<InputPrompt type="click" />
						<p class="font-bold text-sm text-black leading-6">TO FOCUS</p>
					</div>
					<div class="flex gap-2 items-center [&_div]:h-8! [&_div]:shrink! transition-all duration-(--selected-duration) ease-out {ctaEmailFocused && isValidCtaEmail ? 'opacity-100 max-h-10' : 'opacity-0 pointer-events-none max-h-0 -mt-4 overflow-hidden'}">
						<InputPrompt type="Enter" />
						<p class="font-bold text-sm text-black leading-6">TO SIGN UP</p>
					</div>
				</div>
				{/if}
			</div>

			<!-- CTA signup (mobile) -->
			<div class="hidden max-sm:flex flex-col gap-3 w-full">
				{#if isReturningUser}
					<button
						class="signup-btn valid border-2 border-black rounded-lg py-2 px-4 font-bricolage text-2xl font-semibold text-black cursor-pointer w-full"
						onclick={goToApp}
					>LOG BACK IN</button>
				{:else}
					<input
						type="email"
						class="email-input bg-[#f3e8d8] border-2 border-black rounded-lg py-2 px-4 font-bricolage text-2xl font-semibold text-black/50 outline-none w-full"
						placeholder="orpheus@hackclub.com"
						bind:value={ctaEmail}
						onkeydown={(e) => handleCtaEmailKeydown(e)}
						oninput={() => { if (ctaInvalidHint) ctaInvalidHint = false; }}
					/>
					<button
						class="signup-btn border-2 border-black rounded-lg py-2 px-4 font-bricolage text-2xl font-semibold text-black cursor-pointer w-full"
						class:valid={isValidCtaEmail}
						onclick={() => {
							if (isValidCtaEmail) handleSignup(ctaEmail);
							else ctaInvalidHint = true;
						}}
					>SIGN UP</button>
					{#if ctaInvalidHint}
						<p class="font-bricolage text-sm m-0 text-[#c00] text-center">Please enter a valid email</p>
					{/if}
				{/if}
			</div>
		</div>
		</div>
	</section>

	<!-- ===== FOOTER ===== -->
	<footer class="relative z-1 flex flex-col items-center">
		<div class="divider-top w-full aspect-[1444/120] overflow-hidden relative">
			<img src={divider} alt="" />
		</div>

		<div class="bg-black w-full relative py-[51px] px-[81px] pb-[60px] max-sm:py-8 max-sm:px-6">
			<!-- Top text -->
			<div class="text-white max-w-[755px]">
				<p class="text-2xl m-0">
					<span class="font-semibold">A project by Hack Club</span><br />
					With love from the Horizons team.
				</p>
				<p class="text-base text-white mt-4 m-0 leading-relaxed">
					Hack Club is a 501(c)(3) nonprofit and network of 60k+ technical high schoolers. We believe you learn best by building so we're creating community and providing grants so you can make awesome projects. In the past few years, we've partnered with GitHub to run <a href="https://summer.hackclub.com/" target="_blank" rel="noopener" class="text-white underline">Summer of Making</a>, hosted the <a href="https://github.com/hackclub/the-hacker-zephyr" target="_blank" rel="noopener" class="text-white underline">world's longest hackathon on land</a>, and ran <a href="https://www.youtube.com/watch?v=QvCoISXfcE8" target="_blank" rel="noopener" class="text-white underline">Canada's largest high school hackathon</a>.
				</p>
			</div>

			<!-- Link columns -->
			<div class="flex gap-8 mt-10 flex-wrap max-sm:gap-4">
				<div class="flex flex-col gap-4 w-48">
					<p class="font-cook text-2xl max-sm:text-xl text-white m-0">HACK CLUB</p>
					<div class="flex flex-col gap-2.5 text-2xl max-sm:text-xl text-white">
						<a href="https://hackclub.com/philosophy" target="_blank" rel="noopener" class="text-white no-underline hover:underline">Our Philosophy</a>
						<a href="https://hackclub.com/team" target="_blank" rel="noopener" class="text-white no-underline hover:underline">Team &amp; Board</a>
						<a href="https://hackclub.com/donate" target="_blank" rel="noopener" class="text-white no-underline hover:underline">Donate</a>
						<a href="https://hackclub.com/print" target="_blank" rel="noopener" class="text-white no-underline hover:underline">Print</a>
						<a href="mailto:press@hackclub.com" class="text-white no-underline hover:underline">Press Inquiries</a>
					</div>
				</div>
				<div class="flex flex-col gap-4 w-48">
					<p class="font-cook text-2xl max-sm:text-xl text-white m-0">HORIZONS</p>
					<div class="flex flex-col gap-2.5 text-2xl max-sm:text-xl text-white">
						<a href="/" class="text-white no-underline hover:underline font-semibold">Sign up now</a>
						<a href="/faq" class="text-white no-underline hover:underline">FAQ</a>
						<a href="https://guides.horizons.hackclub.com" target="_blank" rel="noopener" class="text-white no-underline hover:underline">Guides</a>
					</div>
				</div>
				<div class="flex flex-col gap-4 w-57 max-sm:w-48">
					<p class="font-cook text-2xl max-sm:text-xl text-white m-0">COMMUNITY</p>
					<div class="flex flex-col gap-2.5 text-2xl max-sm:text-xl text-white">
						<a href="https://hackclub.com/slack" target="_blank" rel="noopener" class="text-white no-underline hover:underline">Slack</a>
						<a href="https://jams.hackclub.com" target="_blank" rel="noopener" class="text-white no-underline hover:underline">Jams</a>
						<a href="https://workshops.hackclub.com" target="_blank" rel="noopener" class="text-white no-underline hover:underline">Workshops</a>
						<a href="https://hackclub.com/conduct" target="_blank" rel="noopener" class="text-white no-underline hover:underline">Code of Conduct</a>
					</div>
				</div>
			</div>
		</div>
	</footer>

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

	<CircleIn />
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

	/* FAQ accordion animation */
	.faq-answer {
		grid-template-rows: 0fr;
		opacity: 0;
		transition:
			grid-template-rows var(--juice-duration) var(--juice-easing) var(--faq-delay),
			opacity var(--juice-duration) ease var(--faq-delay);
	}

	.faq-answer-open {
		grid-template-rows: 1fr;
		opacity: 1;
	}

	.faq-chevron {
		transition: transform var(--juice-duration) var(--juice-easing);
		transform: rotate(-90deg);
		font-size: 0.75rem;
	}

	.faq-chevron-open {
		transform: rotate(0deg);
	}

	/* Mobile: override inline width/height on event cards */
	@media (max-width: 640px) {
		.event-card {
			width: 100% !important;
			height: 300px !important;
		}

		.event-card .card-gradient {
			opacity: 1 !important;
		}

		.event-card .card-logo {
			left: 50% !important;
			top: 36px !important;
			transform: translate(-50%, 0) !important;
			max-height: 96px !important;
			filter: drop-shadow(0px 0px 40px rgba(0,0,0,0.6)) !important;
		}

		.event-card .card-tagline {
			opacity: 1 !important;
			transform: none !important;
			bottom: 24px !important;
		}
	}

</style>
