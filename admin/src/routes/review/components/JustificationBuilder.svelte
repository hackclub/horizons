<script lang="ts">
	interface Props {
		justification: string;
	}

	let { justification = $bindable('') }: Props = $props();

</script>

<div>
	<div class="mb-2 rounded-md border border-rv-border px-3 py-2.5 text-[13px] text-white leading-relaxed">
		<p class="mb-1.5">
			Your approval message should cover the following points. Keep in mind this is
			qualitative — the numbers and facts are logged automatically when submitted to the
			unified database.
		</p>
		<ul class="list-disc pl-4 space-y-0.5">
			<li>What was built and which platforms it was tested and confirmed working on</li>
			<li>Notable deliverables (e.g. binaries, demo video, documentation quality) and why they support the approved scope</li>
			<li>Commit count as evidence that the scope is consistent with the approved hours</li>
			<li>What evidence you examined as the reviewer</li>
			<li>Any hour adjustments: the original claimed time, what was deducted and why, and the final approved amount</li>
		</ul>
	</div>

	<textarea
		bind:value={justification}
		placeholder="Describe what you reviewed: what was built, platforms tested, deliverables, commit evidence, and any hour adjustments..."
		class="w-full bg-rv-surface border border-rv-border rounded-md p-2.5 text-rv-text font-inherit text-[13px] resize-vertical min-h-[120px] focus:outline-none focus:border-rv-accent"
	></textarea>
</div>
