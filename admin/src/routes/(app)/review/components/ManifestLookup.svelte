<script lang="ts">
	import type { components } from '$lib/api';

	type Lookup = components['schemas']['ManifestLookupResponse'];

	interface Props {
		lookup: Lookup | null;
		loading: boolean;
	}

	let { lookup, loading }: Props = $props();

	const submissions = $derived(lookup?.manifest?.submissions ?? []);

	// Drop submissions whose record creation predates Horizons — manifest
	// `shippedAt`/`approvedAt` leak between submissions on the same project,
	// so we only trust `createdAt` (the per-row timestamp) for cutoff checks.
	const HORIZONS_START_MS = Date.parse('2026-02-21T00:00:00Z');

	// Hide our own YSWS so reviewers only see *other* programs this codeUrl was
	// submitted to. The Horizons YSWS rec ID is configured backend-side; here
	// we just collapse exact-name matches as a defensive UI filter.
	const otherSubmissions = $derived(
		submissions.filter((s) => {
			if ((s.yswsName ?? '').toLowerCase() === 'horizons') return false;
			const created = Date.parse(s.createdAt);
			if (Number.isFinite(created) && created < HORIZONS_START_MS) return false;
			return true;
		}),
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
					<div class="text-[10px] text-rv-dim mt-0.5">
						<!-- Manifest leaks shippedAt/approvedAt between submissions on the
						     same project, so always anchor on createdAt (the row's own
						     creation timestamp, which is per-submission and reliable). -->
						{sub.shipStatus === 'shipped' ? 'shipped' : 'drafted'}
						{fmtDate(sub.createdAt)}{#if sub.shipStatus === 'shipped' && sub.hoursShipped != null} · {sub.hoursShipped}h{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
