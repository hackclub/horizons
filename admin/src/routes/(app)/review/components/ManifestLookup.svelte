<script lang="ts">
	import type { components } from '$lib/api';

	type Lookup = components['schemas']['ManifestLookupResponse'];

	interface Props {
		lookup: Lookup | null;
		loading: boolean;
	}

	let { lookup, loading }: Props = $props();

	const submissions = $derived(lookup?.manifest?.submissions ?? []);

	// Hide our own YSWS so reviewers only see *other* programs this codeUrl was
	// submitted to. The Horizons YSWS rec ID is configured backend-side; here
	// we just collapse exact-name matches as a defensive UI filter.
	const otherSubmissions = $derived(
		submissions.filter((s) => (s.yswsName ?? '').toLowerCase() !== 'horizons'),
	);

	function fmtDate(iso: string | null): string {
		if (!iso) return '';
		try {
			return new Date(iso).toLocaleDateString(undefined, {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
			});
		} catch {
			return '';
		}
	}
</script>

<div class="p-4">
	<div class="text-[11px] uppercase tracking-wider text-rv-dim font-semibold mb-2">
		Other YSWS Submissions
	</div>

	{#if loading}
		<div class="text-[12px] text-rv-dim">Looking up…</div>
	{:else if !lookup?.codeUrl}
		<div class="text-[12px] text-rv-dim">No code URL set.</div>
	{:else if !lookup.manifest}
		<div class="text-[12px] text-rv-dim">Not registered with Manifest yet.</div>
	{:else if otherSubmissions.length === 0}
		<div class="text-[12px] text-rv-dim">Only submitted to Horizons.</div>
	{:else}
		<div class="text-[12px] text-rv-text mb-2">
			Submitted to {otherSubmissions.length} other YSWS:
		</div>
		<ul class="flex flex-col gap-1.5 list-none p-0 m-0">
			{#each otherSubmissions as sub (sub.submissionId)}
				<li class="border border-rv-border rounded-md px-2 py-1.5 bg-rv-surface2">
					<div class="flex items-center justify-between gap-2">
						<span class="text-[12px] font-medium text-rv-text truncate">
							{sub.yswsName ?? sub.ysws ?? 'Unknown YSWS'}
						</span>
						<span
							class={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-sm border ${
								sub.shipStatus === 'shipped'
									? 'border-green-500 text-green-600 bg-green-500/10'
									: 'border-amber-500 text-amber-600 bg-amber-500/10'
							}`}
						>
							{sub.shipStatus}
						</span>
					</div>
					<div class="text-[10px] text-rv-dim mt-0.5 font-[Space_Mono,monospace]">
						{#if sub.shippedAt}
							shipped {fmtDate(sub.shippedAt)}{#if sub.hoursShipped != null} · {sub.hoursShipped}h{/if}
						{:else if sub.approvedAt}
							approved {fmtDate(sub.approvedAt)}
						{:else}
							drafted {fmtDate(sub.createdAt)}
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
