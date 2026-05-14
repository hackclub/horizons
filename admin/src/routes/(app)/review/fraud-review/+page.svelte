<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { api } from '$lib/api';
	import { toast } from '$lib/toastStore';

	// Locally-typed to keep this file resilient to schema regen ordering. After
	// `pnpm --filter admin generate:api` you can switch to
	// components['schemas']['FraudReviewQueueItemResponse'].
	type FraudReviewItem = {
		projectId: number;
		projectTitle: string;
		projectType: string;
		description: string | null;
		repoUrl: string | null;
		playableUrl: string | null;
		screenshotUrl: string | null;
		nowHackatimeHours: number | null;
		nowHackatimeProjects: string[];
		createdAt: string;
		updatedAt: string;
		latestSubmissionCreatedAt: string | null;
		submissionCount: number;
		joeFraudReviewedAt: string | null;
		joeTrustScore: number | null;
		joeJustification: string | null;
		joeOutcomeStatus: string | null;
		joeOutcomeReason: string | null;
		permReject: boolean;
		permRejectReason: string | null;
		user: {
			userId: number;
			firstName: string | null;
			lastName: string | null;
			email: string;
			slackUserId: string | null;
			isFraud: boolean;
			isSus: boolean;
		};
	};
	type FraudReviewQueue = {
		pendingPermReject: FraudReviewItem[];
		permRejected: FraudReviewItem[];
	};

	let data = $state<FraudReviewQueue | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let refreshing = $state(false);
	let search = $state('');
	let activeTab = $state<'pending' | 'rejected'>('pending');

	// Modal state
	let modalProject = $state<FraudReviewItem | null>(null);
	let modalReason = $state('');
	let modalInternalNote = $state('');
	let modalSendEmail = $state(true);
	let modalSubmitting = $state(false);

	async function load() {
		const { data: res, error: err } = await (api as any).GET(
			'/api/admin/fraud-review/queue',
		);
		if (err) {
			error = 'Failed to load fraud-review queue. Admin role required.';
			data = null;
			return;
		}
		data = (res ?? null) as FraudReviewQueue | null;
	}

	onMount(async () => {
		const { data: me } = await api.GET('/api/user/auth/me');
		if (me && me.role !== 'admin' && me.role !== 'superadmin') {
			window.location.href = `${base}/review`;
			return;
		}
		try {
			await load();
		} finally {
			loading = false;
		}
	});

	async function refresh() {
		refreshing = true;
		try {
			await load();
		} finally {
			refreshing = false;
		}
	}

	function userLabel(u: FraudReviewItem['user']): string {
		const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
		return name || u.email;
	}

	function formatTypeName(type: string): string {
		return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}

	function formatTrust(score: number | null): string {
		return score === null ? '—' : score.toFixed(2);
	}

	function matchesSearch(p: FraudReviewItem): boolean {
		const q = search.toLowerCase().trim();
		if (!q) return true;
		return (
			p.projectTitle.toLowerCase().includes(q) ||
			userLabel(p.user).toLowerCase().includes(q) ||
			p.user.email.toLowerCase().includes(q)
		);
	}

	let pending = $derived(data?.pendingPermReject.filter(matchesSearch) ?? []);
	let rejected = $derived(data?.permRejected.filter(matchesSearch) ?? []);
	let visible = $derived(activeTab === 'pending' ? pending : rejected);

	function openPermRejectModal(p: FraudReviewItem) {
		modalProject = p;
		modalReason = '';
		modalInternalNote = '';
		modalSendEmail = true;
	}

	function closeModal() {
		if (modalSubmitting) return;
		modalProject = null;
		modalReason = '';
		modalInternalNote = '';
	}

	async function submitPermReject() {
		if (!modalProject) return;
		const reason = modalReason.trim();
		if (!reason) {
			toast.error('Reason is required');
			return;
		}
		modalSubmitting = true;
		try {
			const internalNote = modalInternalNote.trim();
			const { data: res, error: err } = await (api as any).POST(
				'/api/admin/fraud-review/{projectId}/perm-reject',
				{
					params: { path: { projectId: modalProject.projectId } },
					body: {
						reason,
						sendEmail: modalSendEmail,
						...(internalNote ? { internalNote } : {}),
					},
				},
			);
			if (err) {
				toast.error('Failed to perm-reject. Try again.');
				return;
			}
			const r = res as {
				emailSent: boolean;
				slackSent: boolean;
			} | null;
			const notifBits: string[] = [];
			if (modalSendEmail) {
				notifBits.push(r?.emailSent ? 'email sent' : 'email failed');
				notifBits.push(r?.slackSent ? 'Slack sent' : 'Slack failed');
			}
			toast.success(
				`Permanently rejected${notifBits.length ? ` (${notifBits.join(', ')})` : ''}`,
			);
			modalProject = null;
			modalReason = '';
			modalInternalNote = '';
			await load();
		} finally {
			modalSubmitting = false;
		}
	}

</script>

<div class="flex h-screen flex-col overflow-hidden">
	<div
		class="flex shrink-0 items-center justify-between border-b border-rv-border bg-rv-surface px-6 py-4"
	>
		<div class="flex items-center gap-3">
			<a
				href="{base}/review"
				class="text-[13px] text-rv-dim no-underline hover:text-rv-text"
			>
				← Back to review
			</a>
			<div class="text-[18px] font-bold text-rv-accent">
				HORIZONS
				<span class="ml-2 text-[13px] font-normal text-rv-text">Fraud Review</span>
			</div>
		</div>
		<button
			class="cursor-pointer rounded-md border border-rv-border bg-rv-surface2 px-3.5 py-1.5 font-inherit text-[12px] text-rv-dim transition-all duration-150 hover:border-rv-accent hover:text-rv-text disabled:cursor-not-allowed disabled:opacity-40"
			onclick={refresh}
			disabled={refreshing}
		>
			{refreshing ? 'Refreshing…' : 'Refresh'}
		</button>
	</div>

	<div class="flex-1 overflow-y-auto">
		{#if loading}
			<p class="p-6 text-sm text-rv-dim">Loading fraud-review queue…</p>
		{:else if error}
			<p class="p-6 text-sm text-red-500">{error}</p>
		{:else if data}
			<section class="px-6 pt-6">
				<div
					class="mb-4 rounded-md border border-rv-border bg-rv-surface2 px-3 py-2 text-[12px] text-rv-dim"
				>
					Projects below were silently rejected by Joe (auto-fraud). Permanently
					rejecting one surfaces the rejection reason to the user and blocks all
					further submissions and edits.
				</div>

				<div class="mb-4 flex items-center gap-2">
					<button
						class="rounded-md border px-3 py-1.5 text-[12px] {activeTab ===
						'pending'
							? 'border-rv-accent bg-rv-surface text-rv-text'
							: 'border-rv-border bg-rv-surface2 text-rv-dim hover:text-rv-text'}"
						onclick={() => (activeTab = 'pending')}
					>
						Pending perm-reject
						<span class="ml-1 text-rv-dim">({pending.length})</span>
					</button>
					<button
						class="rounded-md border px-3 py-1.5 text-[12px] {activeTab ===
						'rejected'
							? 'border-rv-accent bg-rv-surface text-rv-text'
							: 'border-rv-border bg-rv-surface2 text-rv-dim hover:text-rv-text'}"
						onclick={() => (activeTab = 'rejected')}
					>
						Already perm-rejected
						<span class="ml-1 text-rv-dim">({rejected.length})</span>
					</button>
				</div>

				<input
					type="text"
					class="mb-4 w-full rounded-lg border border-rv-border bg-rv-bg px-3.5 py-2.5 font-inherit text-sm text-rv-text outline-none transition-all duration-150 placeholder:text-rv-dim focus:border-rv-accent"
					placeholder="Search by project, author, or email…"
					bind:value={search}
				/>
			</section>

			<section class="px-6 pb-12">
				{#if visible.length === 0}
					<p class="py-6 text-sm text-rv-dim">
						{activeTab === 'pending'
							? 'No silent rejections waiting on a decision.'
							: 'No permanent rejections yet.'}
					</p>
				{:else}
					<div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
						{#each visible as p (p.projectId)}
							<div
								class="flex flex-col gap-2 rounded-[10px] border border-rv-border bg-rv-surface p-4"
							>
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										<p class="m-0 truncate text-[15px] font-semibold text-rv-text">
											{p.projectTitle}
										</p>
										<p class="m-0 text-[12px] text-rv-dim">
											{userLabel(p.user)} · {p.user.email}
										</p>
									</div>
									{#if p.permReject}
										<span
											class="inline-block shrink-0 rounded-xl border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[11px] text-red-500"
										>
											Perm-rejected
										</span>
									{:else}
										<span
											class="inline-block shrink-0 rounded-xl border border-yellow-500/40 bg-yellow-500/15 px-2 py-0.5 text-[11px] text-yellow-600"
										>
											Silent reject
										</span>
									{/if}
								</div>

								<div class="flex flex-wrap items-center gap-1.5">
									<span
										class="inline-block rounded-xl bg-rv-tag-bg px-2 py-0.5 text-[11px] text-rv-accent"
									>
										{formatTypeName(p.projectType)}
									</span>
									{#if p.user.isFraud}
										<span
											class="inline-block rounded-xl border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[11px] text-red-500"
										>
											User: fraud
										</span>
									{/if}
									{#if p.user.isSus}
										<span
											class="inline-block rounded-xl border border-orange-500/40 bg-orange-500/15 px-2 py-0.5 text-[11px] text-orange-500"
										>
											User: sus
										</span>
									{/if}
									{#if p.submissionCount > 1}
										<span
											class="inline-block rounded-xl bg-rv-tag-bg px-2 py-0.5 text-[11px] text-rv-accent"
										>
											{p.submissionCount} submissions
										</span>
									{/if}
								</div>

								<div class="grid grid-cols-2 gap-3 text-[12px]">
									<div class="flex flex-col gap-0.5">
										<span class="text-[11px] uppercase tracking-wide text-rv-dim">
											Trust score
										</span>
										<span class="text-rv-text">{formatTrust(p.joeTrustScore)}</span>
									</div>
									<div class="flex flex-col gap-0.5">
										<span class="text-[11px] uppercase tracking-wide text-rv-dim">
											Hackatime hours
										</span>
										<span class="text-rv-text">
											{p.nowHackatimeHours?.toFixed(1) ?? '—'}
										</span>
									</div>
								</div>

								{#if p.joeOutcomeReason}
									<div class="flex flex-col gap-0.5 text-[12px]">
										<span class="text-[11px] uppercase tracking-wide text-rv-dim">
											Joe outcome
										</span>
										<p class="m-0 text-rv-text">{p.joeOutcomeReason}</p>
									</div>
								{/if}

								{#if p.joeJustification}
									<details class="text-[12px]">
										<summary class="cursor-pointer text-[11px] uppercase tracking-wide text-rv-dim">
											Joe justification
										</summary>
										<p class="mt-1 mb-0 whitespace-pre-wrap text-rv-text">
											{p.joeJustification}
										</p>
									</details>
								{/if}

								{#if p.permReject && p.permRejectReason}
									<div class="rounded-md border border-red-500/40 bg-red-500/5 p-2 text-[12px]">
										<p class="m-0 mb-1 text-[11px] uppercase tracking-wide text-rv-dim">
											Perm-reject reason (shown to user)
										</p>
										<p class="m-0 whitespace-pre-wrap text-rv-text">{p.permRejectReason}</p>
									</div>
								{/if}

								<div class="mt-1 flex flex-wrap items-center gap-2">
									<a
										href="{base}/review/{p.projectId}"
										class="rounded-md border border-rv-border bg-rv-surface2 px-3 py-1.5 text-[12px] text-rv-dim no-underline hover:border-rv-accent hover:text-rv-text"
									>
										View project
									</a>
									{#if !p.permReject}
										<button
											class="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[12px] text-red-500 hover:bg-red-500/20"
											onclick={() => openPermRejectModal(p)}
										>
											Permanently reject…
										</button>
									{:else}
										<a
											href="{base}/projects/{p.projectId}"
											class="rounded-md border border-rv-border bg-rv-surface2 px-3 py-1.5 text-[12px] text-rv-dim no-underline hover:border-rv-accent hover:text-rv-text"
										>
											Edit metadata to undo →
										</a>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</section>
		{/if}
	</div>
</div>

{#if modalProject}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
		role="dialog"
		aria-modal="true"
		onclick={closeModal}
		onkeydown={(e) => e.key === 'Escape' && closeModal()}
		tabindex="-1"
	>
		<div
			class="w-full max-w-[520px] rounded-[12px] border border-rv-border bg-rv-surface p-5"
			role="document"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			tabindex="-1"
		>
			<h2 class="m-0 mb-1 text-[16px] font-semibold text-rv-text">
				Permanently reject "{modalProject.projectTitle}"
			</h2>
			<p class="m-0 mb-4 text-[12px] text-rv-dim">
				The user will see this reason on their project page. They will no longer
				be able to resubmit or edit the project.
			</p>

			<label class="mb-1 block text-[12px] text-rv-dim" for="perm-reject-reason">
				Rejection reason (shown to user)
			</label>
			<textarea
				id="perm-reject-reason"
				class="mb-3 min-h-[120px] w-full resize-y rounded-[6px] border border-rv-border bg-rv-bg p-2.5 font-inherit text-[13px] leading-[1.6] text-rv-text focus:border-rv-accent focus:outline-none"
				placeholder="e.g. The repo doesn't match the Hackatime activity — we couldn't verify the work."
				maxlength={1000}
				bind:value={modalReason}
				disabled={modalSubmitting}
			></textarea>

			<label class="mb-1 block text-[12px] text-rv-dim" for="perm-reject-internal">
				Internal note <span class="opacity-80 italic">(admin-only, optional)</span>
			</label>
			<textarea
				id="perm-reject-internal"
				class="mb-3 min-h-[80px] w-full resize-y rounded-[6px] border border-rv-border bg-rv-bg p-2.5 font-inherit text-[13px] leading-[1.6] text-rv-text focus:border-rv-accent focus:outline-none"
				placeholder="Context for future admins — not shown to the user."
				maxlength={1000}
				bind:value={modalInternalNote}
				disabled={modalSubmitting}
			></textarea>

			<label class="mb-4 flex items-center gap-2 text-[13px] text-rv-text">
				<input
					type="checkbox"
					bind:checked={modalSendEmail}
					disabled={modalSubmitting}
				/>
				Send email + Slack DM with this reason
			</label>

			<div class="flex items-center justify-end gap-2">
				<button
					class="rounded-md border border-rv-border bg-rv-surface2 px-3 py-1.5 text-[12px] text-rv-dim hover:text-rv-text disabled:opacity-50"
					onclick={closeModal}
					disabled={modalSubmitting}
				>
					Cancel
				</button>
				<button
					class="rounded-md border border-red-500/40 bg-red-500/15 px-3 py-1.5 text-[12px] text-red-500 hover:bg-red-500/25 disabled:opacity-50"
					onclick={submitPermReject}
					disabled={modalSubmitting || !modalReason.trim()}
				>
					{modalSubmitting ? 'Rejecting…' : 'Permanently reject'}
				</button>
			</div>
		</div>
	</div>
{/if}
