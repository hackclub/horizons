<script lang="ts">
	import { page } from "$app/stores";
	import { goto } from "$app/navigation";
	import heroPlaceholder from "$lib/assets/projects/hero-placeholder.png";
	import { api } from "$lib/api";
	import TurbulentImage from "$lib/components/TurbulentImage.svelte";
	import { FormSubmitButton } from "$lib/components/form";
	import BackButton from "$lib/components/BackButton.svelte";

	const projectId = $derived($page.params.id);

	let loading = $state(true);
	let screenshotUrl = $state<string | null>(null);
	let title = $state("");

	const checklistItems = [
		"You have an experienceable link (a URL where anyone can try your project now)",
		"Your project has a screenshot uploaded (if it's difficult to experience, add a video to your README)",
		"Your project description clearly explains what it does",
		"AI use is declared in your project's README",
	];

	let checked = $state<boolean[]>(checklistItems.map(() => false));
	let allChecked = $derived(checked.every(Boolean));

	async function fetchProject(id: string) {
		loading = true;
		const { data } = await api.GET("/api/projects/auth/{id}", {
			params: { path: { id: parseInt(id) } },
		});
		if (data) {
			const p = data as any;
			screenshotUrl = p.screenshotUrl ?? null;
			title = p.projectTitle ?? "";
		}
		loading = false;
	}

	$effect(() => {
		if (projectId) fetchProject(projectId);
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === "Escape") {
			goto(`/app/projects/${projectId}`);
		}
	}

	function handleNext() {
		if (!allChecked) return;
		goto(`/app/projects/${projectId}/ship/project`);
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="relative size-full">
	{#if loading}
		<div
			class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
		>
			<p class="font-cook text-[36px] font-semibold text-black m-0">
				LOADING...
			</p>
		</div>
	{:else}
		<div
			class="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-[calc(50%+73px)] w-214 h-120.5 z-0 pointer-events-none"
		>
			<TurbulentImage
				src={screenshotUrl || heroPlaceholder}
				alt={title}
				inset="0 0 0 0"
				filterId="hero-turbulence"
			/>
		</div>

		<!-- Presubmit card -->
		<div
			class="absolute left-1/2 top-9/16 -translate-x-[calc(50%+0.5px)] -translate-y-[calc(50%+0.5px)] bg-[#f3e8d8] border-4 border-black rounded-[20px] p-4 md:p-[30px] shadow-[4px_4px_0px_0px_black] flex flex-col gap-4 overflow-clip z-1"
		>
			<!-- Header -->
			<div class="flex flex-col text-black">
				<h1
					class="font-cook text-[28px] md:text-[36px] font-semibold m-0 leading-normal"
				>
					READY TO SUBMIT?
				</h1>
				<div class="font-bricolage">
					<p class="md:text-[20px] text-[14px] leading-normal m-0">
						Shipped Project Requirements
					</p>
					<p
						class="md:text-[14px] text-[12px] leading-normal tracking-[-0.22px] m-0"
					>
						Every project submitted must be fully "shipped." Use the
						checklists below to confirm your project qualifies.
					</p>
				</div>
			</div>

			<!-- Checklist -->
			<div class="flex items-start justify-center w-full">
				<div
					class="flex flex-col gap-4 w-[337px] sm:w-[387px] md:w-[487px]"
				>
					{#each checklistItems as item, i}
						<label
							class="checklist-item border-2 border-black rounded-lg p-2 w-full flex gap-2.5 items-center justify-center cursor-pointer overflow-clip {checked[
								i
							]
								? 'bg-[#ffa936]'
								: 'bg-[#f3e8d8]'}"
						>
							<p
								class="font-bricolage md:text-[14px] text-[12px] font-normal leading-normal tracking-[-0.154px] text-black flex-1"
							>
								{item}
							</p>
							<input
								type="checkbox"
								class="hidden"
								bind:checked={checked[i]}
							/>
							<div
								class="size-4 border border-black rounded-[4px] shrink-0 flex items-center justify-center {checked[
									i
								]
									? 'bg-[#ffa936]'
									: ''}"
							>
								{#if checked[i]}
									<svg
										width="10"
										height="8"
										viewBox="0 0 10 8"
										fill="none"
									>
										<path
											d="M1 4L3.5 6.5L9 1"
											stroke="black"
											stroke-width="1.5"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
								{/if}
							</div>
						</label>
					{/each}
				</div>
			</div>

			<FormSubmitButton
				onclick={handleNext}
				disabled={!allChecked}
				blink={allChecked}
			/>
		</div>
	{/if}

	<BackButton onclick={() => goto(`/app/projects/${projectId}`)} />
</div>

<style>
	.checklist-item {
		transition:
			background-color var(--selected-duration) ease,
			transform var(--juice-duration) var(--juice-easing);
	}
	.checklist-item:hover {
		transform: scale(var(--juice-scale));
	}
</style>
