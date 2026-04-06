<script lang="ts">
	interface Props {
		projectTitle: string | null;
		projectDescription: string | null;
		screenshotUrl: string | null;
		projectType: string;
		demoUrl: string | null;
		codeUrl: string | null;
		readmeUrl: string | null;
	}

	let {
		projectTitle,
		projectDescription,
		screenshotUrl,
		projectType,
		demoUrl,
		codeUrl,
		readmeUrl,
	}: Props = $props();

	const typeLabels: Record<string, string> = {
		game: 'Game',
		website: 'Website',
		mobile_app: 'Mobile App',
		desktop_app: 'Desktop App',
		cli_tool: 'CLI Tool',
		hardware: 'Hardware',
		other: 'Other',
	};

	function displayType(type: string): string {
		return typeLabels[type] ?? type;
	}
</script>

<div class="h-full flex flex-col overflow-y-auto bg-rv-bg p-6 gap-5">
	<!-- Screenshot fills available space -->
	{#if screenshotUrl}
		<div class="flex-1 min-h-40 border border-rv-border rounded-lg overflow-hidden bg-rv-surface">
			<img
				class="w-full h-full object-contain bg-rv-surface2 block"
				src={screenshotUrl}
				alt="{projectTitle ?? 'Project'} screenshot"
			/>
		</div>
	{:else}
		<div class="flex-1 min-h-24 border border-rv-border rounded-lg overflow-hidden bg-rv-surface2 flex items-center justify-center text-rv-dim text-sm">
			No screenshot
		</div>
	{/if}

	<!-- Title + type badge -->
	<div class="shrink-0">
		<div class="flex items-center gap-3 mb-2">
			<h2 class="text-2xl font-bold m-0 font-[Space_Mono,monospace] leading-tight">
				{projectTitle ?? 'Untitled Project'}
			</h2>
			<span class="shrink-0 text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded bg-rv-surface2 border border-rv-border text-rv-dim">
				{displayType(projectType)}
			</span>
		</div>

		{#if projectDescription}
			<p class="text-base text-rv-dim m-0 leading-relaxed whitespace-pre-wrap">
				{projectDescription}
			</p>
		{:else}
			<p class="text-base text-rv-dim italic m-0">No description provided.</p>
		{/if}
	</div>

	<!-- Links -->
	{#if demoUrl || codeUrl || readmeUrl}
		<div class="shrink-0 flex flex-col gap-2.5">
			{#if demoUrl}
				{@render LinkRow({ label: 'Demo', url: demoUrl })}
			{/if}
			{#if codeUrl}
				{@render LinkRow({ label: 'Code', url: codeUrl })}
			{/if}
			{#if readmeUrl}
				{@render LinkRow({ label: 'README', url: readmeUrl })}
			{/if}
		</div>
	{/if}
</div>

{#snippet LinkRow({ label, url }: { label: string; url: string })}
	<div class="flex items-center gap-2.5 text-sm font-[Space_Mono,monospace]">
		<span class="text-rv-dim font-semibold w-16 shrink-0">{label}</span>
		<a
			href={url}
			target="_blank"
			rel="noopener noreferrer"
			class="text-rv-blue truncate hover:underline"
		>
			{url}
		</a>
	</div>
{/snippet}
