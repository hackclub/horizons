<script lang="ts">
	import { api } from '$lib/api';
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		label?: string;
		mediaUrl?: string | null;
		mediaPreview?: string | null;
		onupload?: (url: string, preview: string) => void;
		onerror?: (msg: string) => void;
		hideHint?: boolean;
	}

	let {
		label,
		mediaUrl = $bindable(null),
		mediaPreview = $bindable(null),
		onupload,
		onerror,
		hideHint = false,
	}: Props = $props();
	const resolvedLabel = $derived(label ?? m.comp_fileupload_default_label());

	let fileInput: HTMLInputElement;
	let uploading = $state(false);

	async function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const preview = URL.createObjectURL(file);
		mediaPreview = preview;
		uploading = true;

		const formData = new FormData();
		formData.append('file', file);

		const { data, error } = await api.POST('/api/uploads', {
			body: formData as any,
			bodySerializer: (body: any) => body,
		});

		if (data) {
			const uploadData = data as unknown as { url: string };
			mediaUrl = uploadData.url;
			onupload?.(uploadData.url, preview);
		} else {
			mediaPreview = null;
			mediaUrl = null;
			onerror?.(m.comp_fileupload_failed());
		}

		uploading = false;
		input.value = '';
	}
</script>

<div class="flex flex-col gap-1 w-full">
	<!-- svelte-ignore a11y_label_has_associated_control -->
	<label class="font-bricolage text-base font-semibold text-black leading-normal">{resolvedLabel}</label>
	<input
		bind:this={fileInput}
		type="file"
		accept="image/*"
		class="hidden"
		onchange={handleFileSelect}
	/>
	{#if mediaPreview}
		<button
			class="hover-juice-bg bg-[#f3e8d8] border-2 border-black rounded-lg overflow-hidden shadow-[2px_2px_0px_0px_black] w-full cursor-pointer relative"
			type="button"
			onclick={() => fileInput.click()}
			disabled={uploading}
		>
			<img src={mediaPreview} alt={m.comp_fileupload_preview_alt()} class="w-full h-32 object-cover" />
			{#if uploading}
				<div class="absolute inset-0 bg-black/40 flex items-center justify-center">
					<span class="font-bricolage text-base font-semibold text-white">{m.comp_fileupload_uploading()}</span>
				</div>
			{/if}
		</button>
	{:else}
		<button
			class="hover-juice-bg bg-[#f3e8d8] border-2 border-black rounded-lg p-4 shadow-[2px_2px_0px_0px_black] w-full cursor-pointer"
			type="button"
			onclick={() => fileInput.click()}
		>
			<span class="font-bricolage text-base font-semibold text-black/50 text-center block">{m.comp_fileupload_upload_label({ label: resolvedLabel })}</span>
		</button>
	{/if}
	{#if !hideHint}
		<p class="font-bricolage text-xs font-semibold text-black/60 m-0 leading-normal">
			{m.comp_fileupload_video_hint()}
		</p>
	{/if}
</div>

<style>
	.hover-juice-bg {
		transition:
			background-color var(--selected-duration) ease,
			transform var(--juice-duration) var(--juice-easing);
	}
	.hover-juice-bg:hover {
		background-color: #ffa936;
		transform: scale(var(--juice-scale));
	}
</style>
