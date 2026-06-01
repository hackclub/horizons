<script lang="ts">
	interface Props {
		justification: string;
	}

	let { justification = $bindable('') }: Props = $props();

	let showDetails = $state(true);
</script>

<div>
	<div class="mb-2 rounded-md border border-rv-border px-3 py-2.5 text-[13px] text-rv-text leading-relaxed">
		<div class="mb-1.5 flex items-start justify-between gap-3">
			<p>
				Your approval message should cover the following points. Keep in mind this is
				qualitative — the numbers and facts are logged automatically when submitted to the
				unified database.
			</p>
			<button
				type="button"
				onclick={() => (showDetails = !showDetails)}
				class="shrink-0 rounded border border-rv-border px-2 py-0.5 text-[11px] text-rv-dim hover:text-rv-text hover:border-rv-accent transition-colors"
			>
				{showDetails ? 'Hide details' : 'Show details'}
			</button>
		</div>
		<ul class="list-disc pl-4 space-y-1.5">
			<li>
				What was built and which platforms it was tested and confirmed working on
				{#if showDetails}
					<blockquote class="mt-0.5 border-l-2 border-rv-border pl-2 text-rv-dim italic">
						"This is a project that does X, Y. I tested Z and it works and feels polished."
					</blockquote>
				{/if}
			</li>
			<li>Notable deliverables (e.g. binaries, demo video, documentation quality) and why they support the approved scope</li>
			<li>
				What evidence you examined as the reviewer
				{#if showDetails}
					<blockquote class="mt-0.5 border-l-2 border-rv-border pl-2 text-rv-dim italic">
						"They included a video that showed X working in Y context."
					</blockquote>
				{/if}
			</li>
			<li>
				Commit count as evidence that the scope is consistent with the approved hours
				{#if showDetails}
					<blockquote class="mt-0.5 border-l-2 border-rv-border pl-2 text-rv-dim italic">
						i.e. "They had X commits over a Y period of time, which looks appropriate."
					</blockquote>
				{/if}
			</li>
			<li>
				Any hour adjustments: the original claimed time, what was deducted and why, and the final approved amount
				{#if showDetails}
					<blockquote class="mt-0.5 border-l-2 border-rv-border pl-2 text-rv-dim italic">
						"Adjusting hours by X due to Y."
					</blockquote>
				{/if}
			</li>
			<li>
				Make sure to check the readme for additional context!
				{#if showDetails}
					<blockquote class="mt-0.5 border-l-2 border-rv-border pl-2 text-rv-dim italic">
						You might classify some hours as inflated when this is not the case (ex. time spent doing art).
					</blockquote>
					<blockquote class="mt-0.5 border-l-2 border-rv-border pl-2 text-rv-dim italic">
						Check the rest of their GitHub if you think they're a beginner. Beginners take longer time on projects.
					</blockquote>
					<blockquote class="mt-0.5 border-l-2 border-rv-border pl-2 text-rv-dim italic">
						Sometimes some projects go viral, so worth checking if they have a high star count and/or if they link to a viral post. Don't dig too much into it though.
					</blockquote>
				{/if}
			</li>
			<li>
				If the project is high quality (cool project) <strong>explain why</strong> it's high quality.
				{#if showDetails}
					<blockquote class="mt-0.5 border-l-2 border-rv-border pl-2 text-rv-dim italic">
						"This project is cool/high quality because it has/does X, Y, and Z."
					</blockquote>
				{/if}
			</li>
		</ul>
		<p class="mt-2">
			<strong>TL;DR</strong>: Your goal is to explain why you think this project deserves the
			stated hours. Make sure to address hour adjustments, updates from reships, commit quality,
			and project context.
		</p>
		<p class="mt-1.5 italic text-rv-dim">
			Justifications are expected to be thorough for high hour projects (&gt;8hr) — you don't
			need to go into heavy detail for smaller/simpler projects.
		</p>
	</div>

	<textarea
		bind:value={justification}
		placeholder="Describe what you reviewed: what was built, platforms tested, deliverables, commit evidence, and any hour adjustments..."
		class="w-full bg-rv-surface border border-rv-border rounded-md p-2.5 text-rv-text font-inherit text-[13px] resize-vertical min-h-[120px] focus:outline-none focus:border-rv-accent"
	></textarea>
</div>
