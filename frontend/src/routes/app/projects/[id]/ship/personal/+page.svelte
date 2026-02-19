<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import heroPlaceholder from '$lib/assets/projects/hero-placeholder.png';
	import { api } from '$lib/api';
	import TurbulentImage from '$lib/components/TurbulentImage.svelte';
	import { FormField, FormCard, BackButton, FormButtons, FormError } from '$lib/components/form';

	const projectId = $derived(page.params.id);

	let loading = $state(true);
	let errorMsg = $state<string | null>(null);
	let heroUrl = $state<string | null>(null);
	let projectTitle = $state('');

	let fullName = $state('');
	let email = $state('');
	let birthday = $state('');
	let addressLine1 = $state('');
	let addressLine2 = $state('');
	let city = $state('');
	let stateField = $state('');
	let country = $state('');
	let zipCode = $state('');

	async function fetchData(id: string) {
		loading = true;
		errorMsg = null;

		const [projectRes, userRes] = await Promise.all([
			api.GET('/api/projects/auth/{id}', {
				params: { path: { id: parseInt(id) } }
			}),
			api.GET('/api/user/auth/me')
		]);

		if (projectRes.data) {
			const p = projectRes.data as any;
			heroUrl = p.screenshotUrl ?? null;
			projectTitle = p.projectTitle ?? '';
		}

		if (userRes.data) {
			const u = userRes.data as any;
			fullName = [u.firstName, u.lastName].filter(Boolean).join(' ');
			email = u.email ?? '';
			birthday = u.birthday ?? '';
			addressLine1 = u.addressLine1 ?? '';
			addressLine2 = u.addressLine2 ?? '';
			city = u.city ?? '';
			stateField = u.state ?? '';
			country = u.country ?? '';
			zipCode = u.zipCode ?? '';
		} else {
			errorMsg = 'Failed to load user info';
		}

		loading = false;
	}

	$effect(() => {
		if (projectId) fetchData(projectId);
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			goto(`/app/projects/${projectId}`);
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="relative size-full">
	{#if loading}
		<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
			<p class="font-cook text-[36px] font-semibold text-black m-0">LOADING...</p>
		</div>
	{:else}
		<div class="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-[calc(50%+73px)] w-214 h-120.5 z-0 pointer-events-none">
			<TurbulentImage src={heroUrl || heroPlaceholder} alt={projectTitle} inset="0 0 0 0" filterId="hero-turbulence" />
		</div>

		<FormCard title="READY TO SUBMIT?" subtitle="Verify this information is correct before submitting." step={2}>
			<!-- Personal info -->
			<div class="flex gap-4 w-full">
				<div class="flex-1 flex flex-col gap-2 min-w-0">
					<FormField label="Full Name" id="full-name" placeholder="Heidi Hacksworth" prefilled bind:value={fullName} />
					<FormField label="Email" id="email" type="email" placeholder="heidi@hackclub.com" prefilled bind:value={email} />
				</div>
				<div class="flex-1 flex flex-col gap-2 min-w-0">
					<FormField label="Birthday" id="birthday" placeholder="10/10/2010" prefilled bind:value={birthday} />
				</div>
			</div>

			<hr class="border-t-2 border-black/20 w-full m-0" />

			<!-- Address -->
			<div class="flex gap-4 w-full">
				<div class="flex-1 flex flex-col gap-2 min-w-0">
					<FormField label="Address Line 1" id="address1" placeholder="15 Falls Rd" prefilled bind:value={addressLine1} />
					<FormField label="Address Line 2" id="address2" prefilled bind:value={addressLine2} />
					<FormField label="City" id="city" placeholder="Shelburnetown" prefilled bind:value={city} />
				</div>
				<div class="flex-1 flex flex-col gap-2 min-w-0">
					<FormField label="State" id="state" placeholder="Vermontland" prefilled bind:value={stateField} />
					<FormField label="Country" id="country" placeholder="Hacksmerica" prefilled bind:value={country} />
					<FormField label="Zip Code" id="zip-code" placeholder="05482" prefilled bind:value={zipCode} />
				</div>
			</div>

			<FormError message={errorMsg} />
			<FormButtons
				onback={() => goto(`/app/projects/${projectId}/ship/project`)}
				onnext={() => goto(`/app/projects/${projectId}/ship/finish`)}
				nextLabel="THIS IS CORRECT →"
				blink={true}
			/>
		</FormCard>
	{/if}

	<BackButton onclick={() => goto(`/app/projects/${projectId}`)} />
</div>
