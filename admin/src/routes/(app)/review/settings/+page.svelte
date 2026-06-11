<script lang="ts">
	import { base } from '$app/paths';
	import { afterVerdict, type AfterVerdict } from '$lib/reviewSettingsStore';

	const OPTIONS: { value: AfterVerdict; label: string; description: string }[] = [
		{
			value: 'gallery',
			label: 'Return to the gallery',
			description:
				'After approving or rejecting, go straight back to the project gallery to pick the next one.',
		},
		{
			value: 'stay',
			label: 'Stay on this submission',
			description:
				'After approving or rejecting, stay on the project and show its card so you can see what you just decided on.',
		},
	];
</script>

<svelte:head>
	<title>Horizons — Review Settings</title>
</svelte:head>

<div class="font-[Inter,sans-serif] bg-rv-bg text-rv-text h-screen flex flex-col overflow-hidden">
	<div class="flex items-center gap-3 px-6 py-4 bg-rv-surface border-b border-rv-border shrink-0">
		<a
			href="{base}/review"
			class="text-rv-dim hover:text-rv-text text-[13px] no-underline"
		>
			← Back to review
		</a>
		<div class="font-bold text-[18px] text-rv-accent">
			HORIZONS <span class="text-rv-text font-normal text-[13px] ml-2">Review Settings</span>
		</div>
	</div>

	<div class="flex-1 overflow-y-auto px-6 py-8">
		<div class="mx-auto max-w-[560px]">
			<h2 class="m-0 mb-1 text-[15px] font-semibold text-rv-text">After approval / rejection</h2>
			<p class="m-0 mb-4 text-[13px] text-rv-dim">
				Choose what the review view does once you submit a verdict. Saved on this
				device.
			</p>

			<div class="flex flex-col gap-3">
				{#each OPTIONS as option}
					<label
						class="flex cursor-pointer items-start gap-3 rounded-[10px] border p-4 transition-all duration-150 {$afterVerdict ===
						option.value
							? 'border-rv-accent bg-rv-tag-bg'
							: 'border-rv-border bg-rv-surface hover:border-rv-accent'}"
					>
						<input
							type="radio"
							name="after-verdict"
							value={option.value}
							bind:group={$afterVerdict}
							class="mt-0.5 accent-rv-accent"
						/>
						<div class="flex flex-col gap-1">
							<span class="text-[14px] font-semibold text-rv-text">{option.label}</span>
							<span class="text-[12px] text-rv-dim">{option.description}</span>
						</div>
					</label>
				{/each}
			</div>
		</div>
	</div>
</div>
