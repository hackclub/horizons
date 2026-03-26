<script lang="ts">
	import CircleIn from '$lib/components/anim/CircleIn.svelte';
	import TextWave from '$lib/components/TextWave.svelte';
	import logoSvg from '$lib/assets/Logo.svg';
	import toolsImg from '$lib/assets/home/tools.png';
	import exploreImg from '$lib/assets/home/explore.png';

	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import NavigationHint from '$lib/components/NavigationHint.svelte';
	import { createGridNav } from '$lib/nav/wasd.svelte';
    import { EXIT_DURATION } from '$lib';

	const phrases = [
		"OH YEAH. IT'S ALL COMING TOGETHER.",
		"IT'S! TIME! TO! COOK!",
		"HACKCLUB HORIZONS 4EVER",
		"IN EVERY CONTINENT (DON'T TELL ANTARCTICA)",
	];
	const headerText = phrases[Math.floor(Math.random() * phrases.length)];

	let disableAnimations = false;
	let hideCirc = $state(page.url.searchParams.has('noanimate') || disableAnimations);

	const hrefs = [
		['/app/projects?back', '/app/shop?back'],
		['/app/explore', '/app/settings', '/faq?from=app'],
	];

	// Projects (0,0) and Shop (0,1) and FAQ (1,2) are enabled
	function isDisabled(col: number, row: number) {
		return !(col === 0 && row === 0) && !(col === 0 && row === 1) && !(col === 1 && row === 2);
	}

	let shakingKey = $state<string | null>(null);

	function triggerShake(col: number, row: number) {
		const key = `${col}-${row}`;
		if (shakingKey === key) {
			shakingKey = null;
			requestAnimationFrame(() => { shakingKey = key; });
		} else {
			shakingKey = key;
		}
	}

	function isShaking(col: number, row: number) {
		return shakingKey === `${col}-${row}`;
	}

	let navigating = $state(false);

	async function navigateTo(href: string) {
		navigating = true;
		await new Promise(resolve => setTimeout(resolve, EXIT_DURATION + 350));
		goto(href);
	}

	const nav = createGridNav({
		columns: () => [2, 3],
		onSelect: (col, row) => {
			if (isDisabled(col, row)) {
				triggerShake(col, row);
			} else {
				navigateTo(hrefs[col][row]);
			}
		},
	});
</script>

<svelte:window onkeydown={nav.handleKeydown} />

{#if !hideCirc}
	<CircleIn />
{/if}

<div class="flex flex-col items-center justify-center">
	<div class="flex flex-col items-center gap-[25px] w-[1008px] max-w-full mx-auto mt-12">
		<!-- Header -->
		<div class="flex items-end gap-4 w-full exit-up enter-up" class:exiting={navigating}>
			<div class="w-[347.58px] h-[75.13px] shrink-0">
				<img src={logoSvg} alt="Horizon" class="w-full h-full block" />
			</div>
			<p class="font-cook text-[32px] font-semibold text-black m-0 whitespace-nowrap">
				<TextWave text={headerText} disabled={disableAnimations} />
			</p>
		</div>

		<!-- Nav -->
		<div class="flex gap-6 items-start w-full">
			<!-- Col 1 -->
			<div class="flex flex-col gap-6 w-[635px] shrink-0">
				<!-- Projects -->
				<div class="exit-left enter-left" class:exiting={navigating} style:--exit-delay="50ms" style:--enter-delay="50ms">
				<a href="/app/projects" class="card relative block h-[276px] w-full bg-[#F3E8D8]" class:selected={nav.isSelected(0, 0)} style:background-color={nav.isSelected(0, 0) ? '#ffa936' : ''} onmouseenter={() => nav.select(0, 0)} onclick={(e) => { e.preventDefault(); navigateTo('/app/projects?back'); }}>
					<div class="absolute left-[103px] top-[-48px] w-[383px] h-[363px] flex items-center justify-center text-black opacity-8 transition-all icon">
						<svg xmlns="http://www.w3.org/2000/svg" height="180mm" width="190mm" version="1.1" viewBox="0 0 673.22835 637.79528">
							<path d="m360.5 393.53 186.65 187.57c0.836 0.84026 1.8439 1.5065 3.0236 1.9977 2.3584 0.98136 4.72 0.98772 7.0838 0.017 1.1819-0.48484 2.1929-1.1458 3.0332-1.9818l54.327-54.058c0.853-0.84874 1.5256-1.8757 2.0178-3.0799 0.9835-2.4083 0.9591-4.806-0.076-7.1931-0.5167-1.1935-1.2106-2.2057-2.0816-3.0364l-191.24-182.44c28.999-28.711 58.006-57.413 86.932-86.196 1.5617-1.5542 3.4299-2.8358 5.4446-3.7482 2.6895-1.2179 5.641-1.7781 8.5914-1.9733 3.691-0.24401 7.3787 0.0817 11.035 0.50394 12.463 1.4418 25.426 0.0658 37.42-4.022 11.994-4.0877 23.017-10.888 32.057-19.718 9.039-8.8301 16.097-19.69 20.465-31.584 4.3689-11.894 6.0483-24.822 4.9004-37.315-0.1581-1.7219-0.8254-3.4342-1.8959-4.8261s-2.543-2.4613-4.1864-3.0586c-1.6444-0.59624-3.4607-0.71931-5.1741-0.33844-1.7134 0.38193-3.325 1.2678-4.5503 2.4868l-53.092 52.83c-0.8403 0.836-1.8513 1.497-3.0332 1.9818-2.3637 0.97075-4.7253 0.96438-7.0838-0.017-1.1797-0.49121-2.1876-1.1575-3.0236-1.9967l-42.366-42.577c-0.836-0.84025-1.4969-1.8513-1.9818-3.0332-0.9707-2.3637-0.9644-4.7243 0.017-7.0838 0.4912-1.1798 1.1575-2.1876 1.9977-3.0236l52.977-52.716c1.2265-1.2201 2.1219-2.8306 2.5112-4.545 0.3883-1.7145 0.2716-3.534-0.3204-5.1826-0.592-1.6476-1.6592-3.1255-3.0512-4.2013-1.3908-1.0747-3.1053-1.7473-4.8282-1.9086-12.468-1.1659-25.374 0.4838-37.256 4.8155-11.882 4.3307-22.741 11.343-31.585 20.338-8.8428 8.9935-15.671 19.97-19.8 31.924-4.1292 11.953-5.5614 24.886-4.1843 37.332 0.3989 3.6071 0.7023 7.2461 0.4434 10.884-0.2068 2.908-0.7734 5.816-1.9881 8.463-0.9092 1.9818-2.1824 3.8183-3.7228 5.3502-29.478 29.333-58.957 58.666-88.434 87.999l-131.48-125.43-57.813 57.568 128.11 128.74c-28.635 28.494-57.271 56.989-85.907 85.483-1.5404 1.533-3.3822 2.7966-5.3693 3.6962-2.6523 1.201-5.5624 1.7537-8.4715 1.9457-3.639 0.24083-7.2769-0.0806-10.882-0.49652-12.439-1.4386-25.378-0.0711-37.353 3.9986-11.974 4.0708-22.984 10.844-32.022 19.642-9.037 8.7993-16.104 19.623-20.494 31.484-4.389 11.861-6.1035 24.759-4.9991 37.232 0.1528 1.724 0.817 3.4416 1.8853 4.8378 1.0673 1.3972 2.5409 2.472 4.1864 3.0724 1.6455 0.59943 3.4639 0.72568 5.1805 0.3448 1.7166-0.37981 3.3302-1.2667 4.5577-2.4879l52.977-52.716c0.8403-0.83601 1.8513-1.497 3.0332-1.9818 2.3638-0.97074 4.7254-0.96438 7.0838 0.017 1.1797 0.4912 2.1876 1.1575 3.0236 1.9977l42.366 42.576c0.836 0.84025 1.4969 1.8513 1.9818 3.0332 0.9707 2.3637 0.9644 4.7254-0.017 7.0838-0.4912 1.1797-1.1575 2.1876-1.9966 3.0236l-53.093 52.83c-1.2254 1.219-2.1187 2.8263-2.5091 4.5376-0.3893 1.7113-0.2748 3.5286 0.313 5.1752 0.5888 1.6476 1.6519 3.1255 3.0385 4.2023 1.3855 1.0768 3.0958 1.7526 4.8155 1.9192 12.487 1.2094 25.424-0.40527 37.339-4.7147 11.915-4.3105 22.81-11.314 31.684-20.31 8.8746-8.9956 15.73-19.985 19.877-31.958 4.1461-11.973 5.5858-24.93 4.2066-37.399-0.4021-3.6379-0.7076-7.3087-0.453-10.977 0.2037-2.9334 0.7649-5.8658 1.9744-8.5426 0.906-2.0041 2.1759-3.8649 3.7174-5.4224 28.382-28.676 56.923-57.194 85.536-85.64zm-338.2-177.64c-0.8753 0.82221-1.5766 1.8248-2.1039 3.0098-1.0535 2.3701-1.1033 4.7604-0.1506 7.1718 0.4763 1.2063 1.1352 2.2386 1.9754 3.0958l64.518 65.863c0.8073 0.82328 1.7781 1.4842 2.9122 1.9818 2.2693 0.99514 4.5673 1.0694 6.8949 0.22279 1.1639-0.42225 2.176-1.0196 3.0343-1.7898l30.92-27.729c0.4806-0.43074 0.9145-0.9124 1.3028-1.446 0.7777-1.0662 1.3039-2.2449 1.5787-3.535 0.1379-0.64504 0.2058-1.2901 0.2058-1.9362v-24.235c0-0.60578 0.061-1.2116 0.1814-1.8174 0.2419-1.2116 0.7066-2.3298 1.3941-3.3557 0.3448-0.51349 0.731-0.98348 1.1606-1.411l146.72-146.11c0.4276-0.4244 0.8965-0.8074 1.4079-1.1479 1.0227-0.6811 2.1367-1.1405 3.3408-1.3803 0.6026-0.1188 1.2052-0.1793 1.8078-0.1793h47.596c1.8312 0 3.709-0.5739 5.2484-1.6242 1.5394-1.0493 2.7414-2.5749 3.413-4.3053 0.6726-1.7303 0.8137-3.6665 0.3851-5.4807-0.4286-1.8131-1.4269-3.5042-2.7785-4.7402l-25.795-23.575c-0.4202-0.3851-0.8774-0.7299-1.3697-1.0355-0.9856-0.6121-2.0486-1.0237-3.1881-1.2381-0.5707-0.106-1.1404-0.1591-1.7102-0.1591h-69.706c-0.5984 0-1.1967 0.058-1.7962 0.1761-1.1967 0.2366-2.3043 0.6907-3.3228 1.3633-0.5092 0.3363-0.9771 0.714-1.4036 1.1341l-145.58 143.5c-0.4265 0.42118-0.8943 0.79887-1.4036 1.1352-1.0185 0.67263-2.1261 1.1267-3.3239 1.3622-0.5983 0.11882-1.1967 0.17717-1.795 0.17717h-27.029c-0.5803 0-1.1606 0.0552-1.741 0.16657-1.1595 0.22067-2.2385 0.64716-3.2358 1.2805-0.4986 0.31616-0.9591 0.67263-1.3824 1.0694l-27.194 25.522zm81.7-80.15c-0.836-0.84026-1.4969-1.8513-1.9818-3.0332-0.9707-2.3637-0.9644-4.7243 0.018-7.0838 0.4901-1.1798 1.1564-2.1866 1.9966-3.0236l42.745-42.534c0.8275-0.8232 1.8195-1.4768 2.977-1.9606 2.3149-0.9686 4.6394-0.993 6.9745-0.073 1.167 0.4594 2.1728 1.0917 3.0173 1.897l8.1309 7.7574-56.386 55.582-7.4912-7.5283z" fill="currentColor"/>
						</svg>
					</div>
					<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center text-center w-[450px] z-10">
						<p class="font-cook text-[64px] font-semibold text-black m-0">PROJECTS</p>
						<p class="font-['Bricolage_Grotesque',sans-serif] text-[24px] font-semibold text-black m-0 tracking-[0.24px]">
							CREATE AND SHIP YOUR PROJECTS
						</p>
					</div>
				</a>
				</div>

				<!-- Shop -->
				<div class="exit-left enter-left" class:exiting={navigating} style:--exit-delay="175ms" style:--enter-delay="175ms">
				<a href="/app/shop" class="card relative block h-[276px] w-[634px] bg-[#F3E8D8]" class:selected={nav.isSelected(0, 1)} style:background-color={nav.isSelected(0, 1) ? '#ffa936' : ''} onmouseenter={() => nav.select(0, 1)} onclick={(e) => { e.preventDefault(); navigateTo('/app/shop?back'); }}>
					<div class="absolute inset-[-29.35%_9.03%_-36.08%_6.31%] flex items-center justify-center text-black opacity-8 transition-all icon">
						<svg class="flex-none w-[462.19px] h-[348.83px] -rotate-15" viewBox="0 0 462.191 348.83" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path d="M462.191 174.415L368.982 196.212L415.83 279.962L329.164 236.143L327.669 333.165L265.904 257.94L231.095 348.83L196.287 257.94L134.522 333.165L133.027 236.143L46.3612 279.962L93.2084 196.212L0 174.415L93.2084 152.618L46.3612 68.8687L133.027 112.688L134.522 15.6656L196.287 90.8903L231.095 0L265.904 90.8903L327.669 15.6656L329.164 112.688L415.83 68.8687L368.982 152.618L462.191 174.415Z" fill="currentColor"/>
						</svg>
					</div>
					<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center text-center w-[450px] z-10">
						<p class="font-cook text-[64px] font-semibold text-black m-0">SHOP</p>
						<p class="font-['Bricolage_Grotesque',sans-serif] text-[24px] font-semibold text-black m-0 tracking-[0.24px]">
							SPEND YOUR HOURS ON PRIZES
						</p>
					</div>
				</a>
				</div>
			</div>

			<!-- Col 2 -->
			<div class="flex flex-col gap-6 w-[349px] shrink-0">
				<!-- Explore (disabled; was: selected #ff6fbe) -->
				<div class="exit-right enter-right" class:exiting={navigating} style:--exit-delay="100ms" style:--enter-delay="100ms">
				<a href="/app/explore" class="card relative block h-[174px] w-full bg-[#F3E8D8]" class:selected={nav.isSelected(1, 0)} class:disabled={true} class:shaking={isShaking(1, 0)} style:background-color={nav.isSelected(1, 0) ? '#C4C4C4' : ''} onmouseenter={() => nav.select(1, 0)} onclick={(e) => { e.preventDefault(); triggerShake(1, 0); }} onanimationend={() => { shakingKey = null; }}>
					<div class="absolute left-[179px] top-[5px] w-[145px] h-[145px] text-black opacity-8 transition-all icon">
						<svg width="154" height="154" viewBox="0 0 154 154" fill="none" xmlns="http://www.w3.org/2000/svg">dd
							<path d="M139.97 120.14C148.79 107.34 153.43 92.4 153.43 76.72C153.43 61.04 148.79 46.1 139.97 33.3L140.04 33.27L138.08 30.66C138.08 30.66 138.06 30.64 138.06 30.63C127.22 16.22 112.11 6.34 95.09 2.19C89.42 0.810002 83.53 0.06 77.53 0H77.24C77.24 0 77.22 0 77.21 0C76.89 0 76.55 0 76.24 0C76.23 0 76.21 0 76.2 0H75.89C51.89 0.25 29.84 11.41 15.38 30.62L13.4 33.25L13.47 33.28C4.65 46.08 0 61.03 0 76.71C0 92.39 4.65 107.33 13.47 120.14L13.4 120.17L15.38 122.8C29.84 142.01 51.89 153.17 75.91 153.42H76.19C76.36 153.42 76.54 153.42 76.71 153.42C76.87 153.42 77.03 153.42 77.18 153.42C77.2 153.42 77.21 153.42 77.23 153.42H77.54C82.04 153.37 86.47 152.94 90.8 152.15C92.96 151.75 95.1 151.26 97.2 150.69C97.9 150.5 98.6 150.29 99.29 150.08C114.57 145.41 128.1 136.01 138.04 122.8C138.04 122.8 138.05 122.78 138.06 122.78L140.03 120.17L139.96 120.14H139.97ZM131.13 123.52C130.89 123.8 130.65 124.08 130.4 124.36C130.19 124.59 129.99 124.82 129.78 125.05C129.53 125.32 129.28 125.59 129.03 125.86C128.82 126.08 128.61 126.31 128.4 126.53C128.14 126.8 127.89 127.06 127.63 127.32C127.42 127.54 127.2 127.75 126.98 127.97C126.72 128.23 126.45 128.49 126.18 128.74C125.96 128.95 125.74 129.16 125.52 129.36C125.25 129.61 124.97 129.86 124.7 130.11C124.48 130.31 124.26 130.51 124.04 130.71C123.76 130.96 123.47 131.2 123.18 131.45C122.96 131.64 122.74 131.83 122.52 132.01C122.22 132.26 121.92 132.5 121.62 132.74C121.4 132.92 121.18 133.09 120.96 133.27C120.65 133.52 120.33 133.75 120.02 133.99C119.81 134.15 119.6 134.32 119.38 134.48C119.04 134.73 118.7 134.97 118.36 135.22C118.35 135.22 118.34 135.23 118.33 135.24C122.3 131.23 125.88 126.63 128.98 121.5C130 121.82 131.01 122.15 132 122.49C131.91 122.6 131.82 122.71 131.73 122.82C131.53 123.06 131.33 123.3 131.13 123.53V123.52ZM34.08 134.48C33.84 134.3 33.6 134.11 33.35 133.93C33.06 133.71 32.78 133.49 32.49 133.27C32.25 133.08 32.01 132.89 31.77 132.69C31.49 132.46 31.21 132.24 30.94 132.01C30.7 131.81 30.47 131.61 30.23 131.41C29.96 131.18 29.69 130.94 29.42 130.71C29.19 130.5 28.96 130.3 28.73 130.09C28.46 129.85 28.2 129.61 27.94 129.36C27.71 129.15 27.49 128.93 27.26 128.72C27 128.47 26.74 128.22 26.48 127.97C26.26 127.75 26.04 127.53 25.82 127.31C25.56 127.05 25.31 126.79 25.06 126.53C24.85 126.31 24.63 126.08 24.42 125.86C24.17 125.59 23.92 125.32 23.67 125.05C23.46 124.82 23.26 124.59 23.05 124.36C22.8 124.08 22.56 123.8 22.32 123.52C22.12 123.29 21.92 123.06 21.73 122.82C21.64 122.71 21.55 122.59 21.45 122.48C22.44 122.14 23.45 121.81 24.47 121.49C27.57 126.62 31.15 131.23 35.12 135.23C35.07 135.2 35.03 135.16 34.98 135.13C34.68 134.92 34.38 134.7 34.08 134.48ZM22.31 29.93C22.55 29.65 22.8 29.36 23.05 29.08C23.25 28.85 23.46 28.62 23.67 28.39C23.92 28.12 24.17 27.85 24.42 27.58C24.63 27.35 24.84 27.13 25.06 26.91C25.31 26.65 25.57 26.39 25.83 26.13C26.05 25.91 26.27 25.69 26.49 25.47C26.75 25.22 27.01 24.97 27.27 24.72C27.49 24.51 27.72 24.29 27.95 24.08C28.21 23.83 28.48 23.59 28.75 23.35C28.98 23.14 29.21 22.93 29.44 22.73C29.71 22.49 29.98 22.26 30.25 22.03C30.49 21.83 30.72 21.63 30.96 21.43C31.24 21.2 31.51 20.98 31.79 20.75C32.03 20.56 32.27 20.36 32.51 20.17C32.79 19.95 33.08 19.73 33.37 19.51C33.61 19.33 33.85 19.14 34.1 18.96C34.4 18.74 34.7 18.53 34.99 18.31C35.04 18.28 35.08 18.24 35.13 18.21C31.16 22.22 27.58 26.82 24.48 31.95C23.46 31.63 22.45 31.3 21.46 30.96C21.55 30.85 21.65 30.73 21.74 30.62C21.93 30.39 22.13 30.16 22.33 29.93H22.31ZM119.39 18.97C119.6 19.12 119.8 19.28 120.01 19.44C120.33 19.69 120.66 19.93 120.98 20.18C121.19 20.35 121.4 20.52 121.61 20.69C121.92 20.94 122.22 21.18 122.53 21.44C122.75 21.62 122.96 21.8 123.17 21.99C123.46 22.24 123.76 22.49 124.05 22.75C124.27 22.94 124.48 23.13 124.69 23.33C124.97 23.59 125.26 23.84 125.54 24.1C125.75 24.3 125.96 24.5 126.17 24.7C126.45 24.96 126.72 25.23 126.99 25.49C127.2 25.7 127.41 25.9 127.61 26.11C127.88 26.38 128.14 26.65 128.41 26.93C128.62 27.14 128.82 27.36 129.02 27.58C129.28 27.86 129.54 28.14 129.79 28.42C129.99 28.64 130.19 28.86 130.39 29.09C130.64 29.38 130.89 29.66 131.14 29.95C131.33 30.18 131.53 30.4 131.72 30.63C131.81 30.74 131.91 30.86 132 30.97C131.01 31.31 130 31.64 128.98 31.96C125.88 26.83 122.3 22.22 118.33 18.22C118.68 18.48 119.03 18.72 119.37 18.98L119.39 18.97ZM131.45 117.08C137.38 105.67 140.66 92.68 141.02 79.2H148.44C147.96 93.37 143.41 106.83 135.18 118.35C133.96 117.91 132.71 117.49 131.45 117.08ZM111.89 112.2C114.6 102.04 116.11 90.73 116.3 79.19H136.08C135.71 92.2 132.47 104.7 126.63 115.61C121.94 114.27 117 113.13 111.89 112.2ZM79.2 148.29V114.1C88.22 114.21 97.06 114.9 105.57 116.18C99.6 134.69 89.76 146.65 79.2 148.29ZM47.88 116.18C56.38 114.9 65.23 114.21 74.25 114.1V148.29C63.7 146.66 53.86 134.69 47.88 116.18ZM74.25 5.14999V39.34C65.23 39.23 56.39 38.54 47.88 37.26C53.85 18.75 63.69 6.77999 74.25 5.14999ZM79.2 5.14999C89.75 6.77999 99.59 18.75 105.57 37.26C97.07 38.54 88.22 39.23 79.2 39.34V5.14999ZM79.2 109.15V79.2H111.35C111.16 90.49 109.66 101.53 106.99 111.39C98.04 110.01 88.71 109.26 79.2 109.15ZM79.2 74.25V44.3C88.71 44.19 98.03 43.44 106.99 42.06C109.66 51.93 111.16 62.96 111.35 74.26H79.2V74.25ZM46.46 42.05C55.42 43.43 64.74 44.18 74.25 44.29V74.24H42.1C42.29 62.95 43.79 51.91 46.46 42.04V42.05ZM74.25 79.19V109.14C64.74 109.25 55.41 110 46.46 111.38C43.79 101.51 42.29 90.47 42.1 79.19H74.25ZM116.3 74.25C116.11 62.71 114.6 51.4 111.89 41.24C117 40.31 121.94 39.16 126.63 37.83C132.47 48.74 135.71 61.24 136.08 74.25H116.3ZM110.51 36.46C106.68 24.28 101.32 14.73 95.01 8.45999C106.45 12.95 116.64 21.6 124.06 33.41C119.73 34.6 115.2 35.62 110.51 36.46ZM42.94 36.46C38.25 35.62 33.71 34.59 29.39 33.41C36.81 21.59 47.01 12.94 58.45 8.45001C52.14 14.72 46.77 24.28 42.94 36.46ZM26.82 37.82C31.5 39.15 36.44 40.3 41.56 41.23C38.85 51.39 37.34 62.7 37.15 74.24H17.37C17.74 61.23 20.98 48.72 26.82 37.82ZM37.15 79.19C37.34 90.73 38.85 102.04 41.56 112.2C36.45 113.13 31.51 114.28 26.82 115.61C20.98 104.7 17.74 92.2 17.37 79.19H37.15ZM42.94 116.98C46.77 129.16 52.13 138.71 58.43 144.98C46.99 140.49 36.8 131.84 29.38 120.03C33.7 118.84 38.24 117.82 42.93 116.98H42.94ZM110.51 116.98C115.19 117.82 119.73 118.84 124.06 120.03C116.64 131.85 106.44 140.5 95 144.99C101.31 138.72 106.68 129.16 110.51 116.98ZM141.03 74.25C140.67 60.77 137.39 47.78 131.46 36.36C132.72 35.95 133.97 35.53 135.19 35.09C143.42 46.62 147.98 60.07 148.45 74.24H141.03V74.25ZM12.42 74.25H5C5.47 60.07 10.03 46.62 18.26 35.09C19.48 35.53 20.72 35.95 21.99 36.36C16.06 47.77 12.78 60.76 12.42 74.25ZM12.42 79.19C12.78 92.67 16.06 105.66 21.99 117.07C20.72 117.48 19.48 117.9 18.26 118.34C10.03 106.81 5.48 93.36 5 79.18H12.42V79.19Z" fill="currentColor"/>
						</svg>
					</div>	

					<p class="absolute left-4 bottom-4 w-[218px] font-cook text-[36px] font-semibold text-black m-0">
						EXPLORE
					</p>
				</a>
				</div>

				<!-- Settings (disabled; was: selected #FC5B3C) -->
				<div class="exit-right enter-right" class:exiting={navigating} style:--exit-delay="200ms" style:--enter-delay="200ms">
				<a href="/app/settings" class="card relative block h-[174px] w-full bg-[#F3E8D8]" class:selected={nav.isSelected(1, 1)} class:disabled={true} class:shaking={isShaking(1, 1)} style:background-color={nav.isSelected(1, 1) ? '#C4C4C4' : ''} onmouseenter={() => nav.select(1, 1)} onclick={(e) => { e.preventDefault(); triggerShake(1, 1); }} onanimationend={() => { shakingKey = null; }}>
					<div class="absolute left-[179px] top-[10px] w-[145px] h-[145px] text-black opacity-8 transition-all icon">
						<svg width="224" height="223" viewBox="0 0 224 223" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path d="M81.2125 222.5L76.7625 186.9C74.3521 185.973 72.0807 184.86 69.9484 183.562C67.8161 182.265 65.7302 180.874 63.6906 179.391L30.5938 193.297L0 140.453L28.6469 118.759C28.4615 117.461 28.3687 116.21 28.3687 115.005V107.495C28.3687 106.29 28.4615 105.039 28.6469 103.741L0 82.0469L30.5938 29.2031L63.6906 43.1094C65.7302 41.626 67.8625 40.2354 70.0875 38.9375C72.3125 37.6396 74.5375 36.5271 76.7625 35.6L81.2125 0H142.4L146.85 35.6C149.26 36.5271 151.532 37.6396 153.664 38.9375C155.796 40.2354 157.882 41.626 159.922 43.1094L193.019 29.2031L223.613 82.0469L194.966 103.741C195.151 105.039 195.244 106.29 195.244 107.495V115.005C195.244 116.21 195.058 117.461 194.688 118.759L223.334 140.453L192.741 193.297L159.922 179.391C157.882 180.874 155.75 182.265 153.525 183.562C151.3 184.86 149.075 185.973 146.85 186.9L142.4 222.5H81.2125ZM112.363 150.188C123.117 150.188 132.295 146.386 139.897 138.784C147.499 131.182 151.3 122.004 151.3 111.25C151.3 100.496 147.499 91.3177 139.897 83.7156C132.295 76.1135 123.117 72.3125 112.363 72.3125C101.423 72.3125 92.1984 76.1135 84.6891 83.7156C77.1797 91.3177 73.425 100.496 73.425 111.25C73.425 122.004 77.1797 131.182 84.6891 138.784C92.1984 146.386 101.423 150.188 112.363 150.188Z" fill="currentColor"/>
						</svg>
					</div>
					<p class="absolute left-4 top-13 w-[218px] font-cook text-[36px] font-semibold text-black m-0">
						SETTINGS
					</p>
				</a>
				</div>

				<!-- FAQ -->
				<div class="exit-right enter-right" class:exiting={navigating} style:--exit-delay="200ms" style:--enter-delay="200ms">
				<a href="/faq?from=app" class="card relative block h-[174px] w-full bg-[#F3E8D8]" class:selected={nav.isSelected(1, 2)} class:shaking={isShaking(1, 2)} style:background-color={nav.isSelected(1, 2) ? '#FF6FBE' : ''} onmouseenter={() => nav.select(1, 2)} onanimationend={() => { shakingKey = null; }}>
					<p class="absolute left-4 top-4 w-[218px] font-cook text-[36px] font-semibold text-black m-0">
						FAQ
					</p>
					<div class="absolute left-[179px] top-[10px] w-[145px] h-[145px] text-black opacity-8 transition-all icon">
						<svg class="w-full h-full" viewBox="0 0 145 145" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path fill-rule="evenodd" clip-rule="evenodd" d="M126.875 0C136.885 0 145 8.11484 145 18.125V126.875C145 136.885 136.885 145 126.875 145H18.125C8.11484 145 0 136.885 0 126.875V18.125C0 8.11484 8.11484 0 18.125 0H126.875ZM60.2625 94.1584V111.016H80.9253V94.1584H60.2625ZM73.531 33.8029C63.381 33.8029 55.0794 35.9418 48.6269 40.2193C42.1745 44.4968 39.167 51.4206 39.602 60.9904H58.1982C57.8358 57.6555 59.0679 55.0094 61.8954 53.0519C64.7953 51.0946 68.6738 50.1159 73.531 50.1159C77.736 50.1159 80.9993 50.659 83.3192 51.7465C85.7111 52.7614 86.9076 54.2478 86.908 56.2048C86.908 57.4368 86.6899 58.3799 86.2553 59.0324C85.8203 59.6849 84.9854 60.3739 83.7529 61.0989C82.593 61.7513 80.5274 62.7202 77.5556 64.0349C72.6985 66.1372 69.1095 68.2045 66.7895 70.2344C64.4695 72.1919 62.9815 74.2589 62.329 76.4339C61.6767 78.6088 61.3511 81.4731 61.3511 85.0251H79.9474C79.9474 83.7202 80.6366 82.4879 82.0139 81.328C83.3913 80.0955 86.0736 78.4638 90.0608 76.4339C93.8205 74.4765 96.7664 72.6629 98.8689 70.9955C101.044 69.2555 102.675 67.1885 103.763 64.796C104.85 62.4037 105.396 59.3956 105.396 55.7711C105.396 50.2612 103.728 45.8735 100.393 42.611C97.0586 39.3488 92.9979 37.0661 88.2133 35.761C83.4284 34.456 78.5335 33.803 73.531 33.8029Z" fill="currentColor"/>
						</svg>
					</div>
				</a>
				</div>
			</div>
		</div>

	</div>

	<div class="nav-hint-wrap" class:exiting={navigating}>
		<NavigationHint
			segments={[
				{ type: 'text', value: 'USE' },
				{ type: 'input', value: 'WASD' },
				{ type: 'text', value: 'OR' },
				{ type: 'input', value: 'mouse' },
				{ type: 'text', value: 'TO NAVIGATE' }
			]}
			position="bottom-center"
		/>
	</div>
</div>

<style>
	/* Entry / exit animations */
	@keyframes fly-in-top {
		from { transform: translateY(-120vh); }
		to   { transform: translateY(0); }
	}
	@keyframes fly-out-top {
		from { transform: translateY(0); }
		to   { transform: translateY(-120vh); }
	}
	@keyframes fly-in-left {
		from { transform: translateX(-120vw); }
		to   { transform: translateX(0); }
	}
	@keyframes fly-out-left {
		from { transform: translateX(0); }
		to   { transform: translateX(-120vw); }
	}
	@keyframes fly-in-right {
		from { transform: translateX(120vw); }
		to   { transform: translateX(0); }
	}
	@keyframes fly-out-right {
		from { transform: translateX(0); }
		to   { transform: translateX(120vw); }
	}

	.enter-up {
		animation: fly-in-top var(--enter-duration) var(--enter-easing) var(--enter-delay, 0ms) both;
	}
	.enter-up.exiting {
		animation: fly-out-top var(--exit-duration) var(--exit-easing) var(--exit-delay, 0ms) both;
	}

	.enter-left {
		animation: fly-in-left var(--enter-duration) var(--enter-easing) var(--enter-delay, 0ms) both;
	}
	.enter-left.exiting {
		animation: fly-out-left var(--exit-duration) var(--exit-easing) var(--exit-delay, 0ms) both;
	}

	.enter-right {
		animation: fly-in-right var(--enter-duration) var(--enter-easing) var(--enter-delay, 0ms) both;
	}
	.enter-right.exiting {
		animation: fly-out-right var(--exit-duration) var(--exit-easing) var(--exit-delay, 0ms) both;
	}

	.exit-up {
		transition: transform var(--exit-duration) var(--exit-easing) var(--exit-delay, 0ms);
	}
	.exit-up.exiting {
		transform: translateY(-120vh);
	}

	.exit-left {
		transition: transform var(--exit-duration) var(--exit-easing) var(--exit-delay, 0ms);
	}
	.exit-left.exiting {
		transform: translateX(-120vw);
	}

	.exit-right {
		transition: transform var(--exit-duration) var(--exit-easing) var(--exit-delay, 0ms);
	}
	.exit-right.exiting {
		transform: translateX(120vw);
	}

	.nav-hint-wrap {
		transition: opacity 250ms ease;
	}
	.nav-hint-wrap.exiting {
		opacity: 0;
	}

	.card {
		border: 4px solid black;
		border-radius: 20px;
		box-shadow: 4px 4px 0px 0px black;
		overflow: hidden;
		text-decoration: none;
		color: black;
		transition: 
			transform var(--juice-duration) var(--juice-easing), 
			background-color var(--selected-duration) ease;
	}

	.card.selected {
		transform: scale(var(--juice-scale));
	}

	.card.selected .icon {
		color: white;
		opacity: 0.3;
	}

	.card.disabled {
		cursor: not-allowed;
	}

	@keyframes shake {
		0%, 100% { translate: 0 0; }
		20%       { translate: -8px 0; }
		40%       { translate: 8px 0; }
		60%       { translate: -6px 0; }
		80%       { translate: 6px 0; }
	}

	.card.shaking {
		animation: shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
	}
</style>
