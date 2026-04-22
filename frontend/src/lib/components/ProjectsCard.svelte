<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fade } from 'svelte/transition';
	import { api } from '$lib/api';
	import { projectsStore, fetchProjects } from '$lib/store/projectCache';

	interface Props {
		selected?: boolean;
		postOnboarding?: boolean;
		description?: string;
		onmouseenter?: () => void;
		onclick?: (e: MouseEvent) => void;
	}

	let {
		selected = false,
		postOnboarding = false,
		description = '',
		onmouseenter,
		onclick,
	}: Props = $props();

	const IDLE_MS = 7000;
	const SLIDE_MS = 7000;
	const FLY_OUT_MS = 1400; // fly-out + brief pause before slide appears
	const SLIDE_FADE_OUT_MS = 400;
	const FLY_IN_MS = 1100; // matches CSS transform transition

	let activeCodersToday = $state<number | null>(null);
	let flyOutActive = $state(false);
	let idleSlideshowActive = $state(false);
	let slideshowIndex = $state(0);
	let slideshowProjects = $derived(
		$projectsStore.projects.filter((p: any) => !!p.screenshotUrl)
	);

	let idleTimer: ReturnType<typeof setTimeout> | null = null;
	let slideTimer: ReturnType<typeof setInterval> | null = null;
	let flyOutTimer: ReturnType<typeof setTimeout> | null = null;
	let endTimer: ReturnType<typeof setTimeout> | null = null;

	function clearSlideTimer() {
		if (slideTimer) {
			clearInterval(slideTimer);
			slideTimer = null;
		}
	}

	function startSlideshow() {
		if (slideshowProjects.length === 0) return;
		flyOutActive = true;
		if (flyOutTimer) clearTimeout(flyOutTimer);
		flyOutTimer = setTimeout(() => {
			idleSlideshowActive = true;
			slideshowIndex = 0;
			clearSlideTimer();
			let shown = 1;
			slideTimer = setInterval(() => {
				if (slideshowProjects.length === 0) return;
				if (shown >= slideshowProjects.length) {
					endSlideshow();
					return;
				}
				slideshowIndex = (slideshowIndex + 1) % slideshowProjects.length;
				shown++;
			}, SLIDE_MS);
		}, FLY_OUT_MS);
	}

	function endSlideshow() {
		clearSlideTimer();
		// 1) Fade slide out
		idleSlideshowActive = false;
		if (endTimer) clearTimeout(endTimer);
		endTimer = setTimeout(() => {
			// 2) Fly card-text + hammer back in
			flyOutActive = false;
			endTimer = setTimeout(() => {
				// 3) Wait the idle period, then run the cycle again
				scheduleNextCycle();
			}, FLY_IN_MS);
		}, SLIDE_FADE_OUT_MS);
	}

	function scheduleNextCycle() {
		if (idleTimer) clearTimeout(idleTimer);
		idleTimer = setTimeout(() => startSlideshow(), IDLE_MS);
	}

	onMount(() => {
		api.GET('/api/hackatime/active-coders-today')
			.then((r) => { if (r.data) activeCodersToday = r.data.count; })
			.catch(() => {});

		fetchProjects().catch(() => {});
		scheduleNextCycle();
	});

	onDestroy(() => {
		if (idleTimer) clearTimeout(idleTimer);
		if (flyOutTimer) clearTimeout(flyOutTimer);
		if (endTimer) clearTimeout(endTimer);
		clearSlideTimer();
	});
</script>

<a href="/app/projects" class="card nav-card projects-card"
	class:selected
	class:slideshow-active={flyOutActive}
	{onmouseenter}
	{onclick}>
	<!-- Hammer/wrench icon background -->
	<div class="hammer-icon absolute -bottom-16 -right-16 text-white opacity-20" style="width: 120%; height: 120%;">
		<svg class="absolute bottom-0 right-0 w-full h-full" preserveAspectRatio="xMaxYMax meet" viewBox="0 0 565 535" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path d="M450.306 58.616C453.771 58.0034 460.307 58.3883 463.913 58.6369C470.142 59.0663 473.643 66.5579 469.292 71.4413C465.802 75.3602 461.761 79.095 457.992 82.8662L435.298 105.557C432.024 108.822 425.157 114.82 422.707 118.95C422.495 119.311 422.02 122.007 422.111 122.377C423.212 126.895 428.321 131.018 431.596 134.294L445.186 147.888C450.32 153.039 455.752 158.885 461.157 163.726C463.168 165.53 465.938 165 468.456 164.659C472.09 162.044 478.62 155.218 482.162 151.71L505.239 128.796C508.856 125.168 514.994 118.216 519.342 116.251C530.052 116.886 529.304 123.579 529.117 132.104C528.581 150.861 520.713 168.66 507.198 181.674C494.852 193.374 478.658 200.803 461.548 201.549C455.316 201.972 449.194 201.071 442.99 200.734C432.774 200.18 428.829 204.945 422.327 211.476L411.024 222.778L379.091 254.287C371.245 262.101 363.231 270.337 355.26 277.991L466.445 384.009L498.003 414.078C503.661 419.431 509.397 424.811 514.97 430.255C516.032 431.527 517.85 433.177 518.062 434.824C518.553 438.626 517.466 440.596 514.801 443.303C511.764 446.393 508.503 449.533 505.35 452.648L488.662 469.256L476.592 481.272C472.159 485.681 470.716 488.283 464.597 490.231C462.795 489.662 461.143 489.273 459.741 487.985C456.152 484.682 452.748 481.137 449.319 477.668L433.698 462.002C415.998 444.376 398.389 426.66 380.873 408.847L328.216 356.053C319.942 347.778 310.334 338.612 302.468 330.131C298.156 335.235 288.012 344.76 282.914 349.845L245.753 387.071C240.568 392.275 235.126 397.515 230.154 402.84C224.261 409.153 226.543 420.198 226.751 428.175C226.995 437.489 226.096 444.534 223.247 453.429C211.782 484.845 183.873 504.46 149.78 502.357C143.539 501.971 138.776 496.557 142.174 490.639C144.244 487.033 149.366 482.704 152.491 479.589L175.165 456.947C179.459 452.698 183.938 448.449 188.06 444.029C189.029 442.875 190.029 441.689 190.204 440.147C190.821 434.711 184.498 429.905 180.903 426.307L169.011 414.368L158.045 403.345C155.32 400.616 151.359 395.755 147.33 395.299C145.682 395.233 142.98 396.574 141.837 397.678C127.542 411.493 113.684 425.793 99.4912 439.727C95.6673 443.482 90.5014 446.868 85.9814 441.852C82.6976 438.207 83.1575 431.662 83.3931 427.068C84.519 407.818 93.2315 389.8 107.62 376.962C120.643 365.291 137.616 359.298 155.01 359.008C161.342 358.9 175.147 361.789 180.528 357.8C186.243 353.564 192.926 346.126 198.234 340.897L238.244 301.32C244.046 295.589 250.318 288.97 256.237 283.529L183.959 211.042C172.476 199.429 159.842 187.254 148.716 175.479C164.367 159.134 181.662 143.232 197.073 126.951C199.833 129.199 201.977 131.799 204.54 134.163C207.789 137.162 210.936 140.214 214.142 143.248L258.132 185.227L294.057 219.48C296.429 221.766 305.773 230.258 307.489 232.54L358.662 181.383C363.526 176.518 382.344 158.818 384.54 154.441C387.273 148.99 386.222 142.163 386.018 136.294C385.866 131.907 385.662 127.355 386.04 122.977C387.24 109.093 393.139 94.7807 402.201 84.1266C414.219 69.995 431.618 60.0761 450.306 58.616Z" fill="currentColor"/>
			<path d="M202.615 32.3956L241.036 32.4489C247.182 32.4475 253.442 32.1796 259.571 32.4966C261.045 32.5727 262.9 32.7457 264.257 33.3414C268.672 35.2789 273.279 40.7917 276.916 44.0925C280.403 47.2556 284.02 50.3235 287.408 53.5867C289.303 55.4111 290.743 57.6005 290.735 60.316C290.721 63.7104 288.514 66.1919 285.402 67.3091C281.266 68.7952 256.227 67.9801 250.249 67.9702C247.255 67.9652 243.411 67.5988 240.551 68.4953C238.986 68.9856 237.62 70.1596 236.452 71.2779C228.434 78.9527 220.716 87.0216 212.818 94.8289L144.722 162.649L126.846 180.493C122.669 184.64 118.368 188.982 114.281 193.168C109.124 198.451 114.571 217.538 110.857 222.556C107.327 227.325 97.9797 234.672 93.1444 239.195C88.8313 243.14 83.7959 248.594 78.352 250.133C73.7984 249.01 73.6814 248.435 70.3408 245.224C64.0118 239.141 58.1276 232.649 52.0315 226.39L32.3125 206.335C29.1247 203.058 25.9162 199.803 22.6871 196.567C17.1282 190.953 12.3718 186.053 20.2987 179.36C23.6639 176.519 41.7277 157.977 44.7795 157.699C51.9383 157.046 64.2593 157.469 71.6366 157.519C74.7193 155.847 88.8564 141.316 92.5774 137.711L171.205 60.2992C176.674 54.9434 182.107 49.5518 187.504 44.1245C191.325 40.3182 197.361 33.1207 202.615 32.3956Z" fill="currentColor"/>
			<path d="M127.149 64.6041C127.372 64.5862 127.596 64.5729 127.82 64.5647C133.057 64.387 137.36 70.003 140.9 73.3669C136.473 78.2101 130.69 83.7063 125.978 88.3513C115.997 98.0139 106.1 107.763 96.2878 117.597L93.5025 120.281C90.4049 116.827 82.9349 111.17 85.1679 106.032C86.5266 102.906 92.8282 97.1025 95.4678 94.504C104.615 85.4992 113.471 76.3087 122.739 67.4494C124.146 66.104 125.387 65.3728 127.149 64.6041Z" fill="currentColor"/>
		</svg>
	</div>

	{#if activeCodersToday !== null}
		<div class="active-coders-tag">
			<span class="active-coders-dot"></span>
			<span class="font-bricolage text-[12px] text-black">{activeCodersToday} {activeCodersToday === 1 ? 'person' : 'people'} coding today</span>
		</div>
	{/if}

	<div class="card-text z-10">
		<p class="font-cook text-[40px] font-semibold text-black m-0">PROJECTS</p>
		<p class="font-bricolage text-[24px] font-semibold text-black m-0 tracking-[0.24px]">
			CREATE AND SHIP YOUR PROJECTS
		</p>
	</div>

	{#if idleSlideshowActive && slideshowProjects.length > 0}
		{@const project = slideshowProjects[slideshowIndex % slideshowProjects.length]}
		{#key slideshowIndex}
			<div class="project-slide z-20" in:fade|global={{ duration: 700 }} out:fade|global={{ duration: 400 }}>
				<div class="project-slide-bg" style="background-image: url({project.screenshotUrl});"></div>
				<div class="project-slide-overlay"></div>
				<div class="project-slide-info">
					<p class="font-cook text-[40px] font-semibold text-white m-0 leading-none">{project.projectTitle}</p>
					<p class="font-bricolage text-[24px] font-semibold text-white m-0 tracking-[0.24px]">{(project.nowHackatimeHours ?? 0).toFixed(1)} HRS TRACKED</p>
				</div>
			</div>
		{/key}
	{/if}

	{#if postOnboarding && selected}
		<div class="card-popover">
			<p class="font-bricolage text-[16px] font-semibold text-black/70 m-0">{description}</p>
		</div>
	{/if}
</a>

<style>
	.card {
		border: 4px solid black;
		border-radius: 20px;
		box-shadow: 4px 4px 0px 0px black;
		overflow: hidden;
		text-decoration: none;
		color: black;
	}

	.nav-card {
		display: block;
		position: relative;
		transition: transform var(--juice-duration) var(--juice-easing);
	}

	.nav-card.selected {
		transform: scale(var(--juice-scale));
		z-index: 10;
	}

	.projects-card {
		position: relative;
		display: block;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background-color: #ffa936;
	}

	.card-text {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 20px;
		justify-content: center;
		height: 100%;
	}

	/* Slideshow exit animations for the original card content */
	.projects-card .card-text,
	.projects-card .hammer-icon {
		transition:
			transform 1100ms cubic-bezier(0.4, 0, 0.2, 1),
			opacity 700ms ease;
	}

	.projects-card.slideshow-active .card-text {
		transform: translateX(-110%);
		opacity: 0;
	}

	.projects-card.slideshow-active .hammer-icon {
		transform: translateX(110%);
		opacity: 0;
	}

	.project-slide {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}

	.project-slide-bg {
		position: absolute;
		inset: 0;
		background-size: cover;
		background-position: center;
	}

	.project-slide-overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.2) 60%, transparent 100%);
	}

	.project-slide-info {
		position: absolute;
		left: 20px;
		right: 20px;
		bottom: 20px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.active-coders-tag {
		position: absolute;
		top: 16px;
		right: 16px;
		z-index: 22;
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 5px 12px;
		background: white;
		border: 2px solid black;
		border-radius: 8px;
		width: fit-content;
	}

	.active-coders-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background-color: #22c55e;
		flex-shrink: 0;
	}

	.card-popover {
		position: absolute;
		bottom: 12px;
		left: 12px;
		right: 12px;
		z-index: 20;
		background: #f3e8d8;
		border: 3px solid black;
		border-radius: 12px;
		box-shadow: 3px 3px 0px 0px black;
		padding: 12px 16px;
	}
</style>
