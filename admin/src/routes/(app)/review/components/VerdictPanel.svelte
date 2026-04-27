<script lang="ts">
	import { api } from '$lib/api';
	import JustificationBuilder from './JustificationBuilder.svelte';

	interface Props {
		submissionId: number;
		hackatimeHours: number | null;
		editedHours?: number | null;
		joeFraudPassed?: boolean | null;
		/** Reviewer's own decision — null when the reviewer hasn't voted yet. */
		reviewPassed?: boolean | null;
		priorApprovedHours?: number | null;
		priorReviewerAnalysis?: string | null;
		priorUserFeedback?: string | null;
		onReviewComplete: () => void;
	}

	let {
		submissionId,
		hackatimeHours,
		editedHours = null,
		joeFraudPassed = null,
		reviewPassed = null,
		priorApprovedHours = null,
		priorReviewerAnalysis = null,
		priorUserFeedback = null,
		onReviewComplete,
	}: Props = $props();

	let activeForm: 'approve' | 'changes' = $state('changes');
	let submitting = $state(false);
	let savingDraft = $state(false);
	let draftSavedFlash = $state(false);

	// Approval form fields
	let hoursJustification = $state('');
	let approveComment = $state('');
	let approvedHours = $state(hackatimeHours ?? 0);
	let reviewerManuallyEditedHours = $state(false);
	let sendEmail = $state(false);

	// Changes needed form fields
	let changesComment = $state('');
	let rejectSendEmail = $state(false);

	// Reset fields when submission changes. Autofill keys off the reviewer's own
	// decision (reviewPassed), not approvalStatus — a reviewer-approved submission
	// stuck on pending fraud should still surface the prior verdict. Drafts saved
	// without a verdict also persist via priorUserFeedback / priorReviewerAnalysis.
	$effect(() => {
		submissionId; // track
		const reviewerApproved = reviewPassed === true;
		activeForm = reviewerApproved ? 'approve' : 'changes';
		hoursJustification = priorReviewerAnalysis ?? '';
		approveComment = reviewerApproved ? priorUserFeedback ?? '' : '';
		approvedHours = reviewerApproved
			? priorApprovedHours ?? hackatimeHours ?? 0
			: hackatimeHours ?? 0;
		reviewerManuallyEditedHours = reviewerApproved;
		sendEmail = false;
		changesComment = reviewerApproved ? '' : priorUserFeedback ?? '';
		rejectSendEmail = false;
	});

	// Sync approved hours from the breakdown panel unless reviewer manually edited
	$effect(() => {
		if (editedHours != null && !reviewerManuallyEditedHours) {
			approvedHours = Math.round(editedHours * 10) / 10;
		}
	});

	function setVerdict(type: 'approve' | 'changes') {
		activeForm = type;
	}

	async function submitApproval() {
		submitting = true;
		try {
			const { error } = await api.PUT('/api/reviewer/submissions/{id}/review', {
				params: { path: { id: submissionId } },
				body: {
					approvalStatus: 'approved',
					approvedHours,
					hoursJustification: hoursJustification || undefined,
					userFeedback: approveComment || undefined,
					sendEmail,
				},
			});
			if (error) throw new Error(`Failed to approve submission ${submissionId}`);
			onReviewComplete();
		} catch (error) {
			console.error('Approval failed:', error);
			alert(`Approval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		} finally {
			submitting = false;
		}
	}

	async function submitChangesNeeded() {
		if (!changesComment.trim()) {
			alert('Please describe what needs to change.');
			return;
		}

		submitting = true;
		try {
			const { error } = await api.PUT('/api/reviewer/submissions/{id}/review', {
				params: { path: { id: submissionId } },
				body: {
					approvalStatus: 'rejected',
					userFeedback: changesComment,
					sendEmail: rejectSendEmail,
				},
			});
			if (error) throw new Error(`Failed to reject submission ${submissionId}`);
			onReviewComplete();
		} catch (error) {
			console.error('Review failed:', error);
			alert(`Review failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		} finally {
			submitting = false;
		}
	}

	// Save the current tab's text fields without finalizing a verdict — lets a
	// reviewer leave a draft comment / analysis without forcing approve or reject.
	async function saveDraft() {
		savingDraft = true;
		try {
			const body =
				activeForm === 'approve'
					? {
							userFeedback: approveComment,
							hoursJustification,
							approvedHours,
						}
					: { userFeedback: changesComment };
			const { error } = await api.PUT('/api/reviewer/submissions/{id}/review', {
				params: { path: { id: submissionId } },
				body,
			});
			if (error) throw new Error(`Failed to save draft for submission ${submissionId}`);
			draftSavedFlash = true;
			setTimeout(() => (draftSavedFlash = false), 2000);
		} catch (error) {
			console.error('Save draft failed:', error);
			alert(`Save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		} finally {
			savingDraft = false;
		}
	}
</script>

<div class="h-full overflow-y-auto bg-rv-bg p-5">
	<!-- Full-width slide toggle -->
	<div class="relative flex w-full rounded-lg bg-rv-surface border border-rv-border mb-4 overflow-hidden">
		<div
			class="absolute top-0 bottom-0 w-1/2 rounded-lg transition-all duration-200 ease-in-out {activeForm === 'changes' ? 'left-0 bg-rv-red' : 'left-1/2 bg-rv-green'}"
		></div>
		<button
			class="relative z-10 flex-1 py-2.5 text-sm font-semibold font-inherit cursor-pointer bg-transparent border-none transition-colors duration-200 {activeForm === 'changes' ? 'text-white' : 'text-rv-dim hover:text-rv-text'}"
			onclick={() => setVerdict('changes')}
		>
			Changes Needed
		</button>
		<button
			class="relative z-10 flex-1 py-2.5 text-sm font-semibold font-inherit cursor-pointer bg-transparent border-none transition-colors duration-200 {activeForm === 'approve' ? 'text-white' : 'text-rv-dim hover:text-rv-text'}"
			onclick={() => setVerdict('approve')}
		>
			Approve
		</button>
	</div>

	{#if activeForm === 'approve'}
		<div class="pt-3 border-t border-rv-border">
			<h3 class="text-sm font-bold mb-3 flex items-center gap-1.5">
				<span class="w-2 h-2 rounded-full bg-rv-green"></span> Approve Project
			</h3>
			{#if joeFraudPassed === null}
				<div class="mb-3 rounded-md border border-yellow-500 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-800">
					Fraud review still pending — this will finalize once fraud passes.
				</div>
			{:else if joeFraudPassed === false}
				<div class="mb-3 rounded-md border border-red-500 bg-red-500/10 px-3 py-2 text-xs text-red-700">
					Fraud review failed — approving here will silent-reject the submission internally.
				</div>
			{/if}
			<div class="mb-3">
				<label for="approved-hours" class="block text-xs font-semibold text-rv-dim mb-1">
					Approved Hours
					<span class="font-normal opacity-80 italic">(defaults to Hackatime hours)</span>
				</label>
				<input
					id="approved-hours"
					type="number"
					step="0.5"
					min="0"
					bind:value={approvedHours}
					oninput={() => { reviewerManuallyEditedHours = true; }}
					class="w-[100px] bg-rv-surface border border-rv-border rounded-md p-2.5 text-rv-text font-[Space_Mono,monospace] text-[13px] font-semibold resize-vertical focus:outline-none focus:border-rv-accent"
				/>
			</div>

			<!-- Structured justification builder -->
			<div class="mb-3">
				<label class="block text-xs font-semibold text-rv-text mb-1">
					Ship Justification
					<span class="font-normal opacity-80 italic">(internal — synced to Airtable)</span>
				</label>
				<JustificationBuilder
					bind:justification={hoursJustification}
				/>
			</div>

			<div class="mb-3">
				<label for="approve-comment" class="block text-xs font-semibold text-rv-dim mb-1">
					Comment for User
					<span class="font-normal opacity-80 italic">(optional — shown to user)</span>
				</label>
				<textarea
					id="approve-comment"
					bind:value={approveComment}
					maxlength={500}
					placeholder="Nice work! Any feedback you want to share..."
					class="w-full bg-rv-surface border border-rv-border rounded-md p-2.5 text-rv-text font-inherit text-[13px] resize-vertical min-h-[60px] focus:outline-none focus:border-rv-accent"
				></textarea>
			</div>
			<div class="mb-3">
				<label class="flex items-center gap-1.5 text-xs text-rv-dim cursor-pointer">
					<input type="checkbox" bind:checked={sendEmail} class="accent-rv-accent" />
					Send email notification to user
				</label>
			</div>
			<div class="flex gap-2 justify-end items-center">
				{#if draftSavedFlash}
					<span class="text-[11px] text-rv-green mr-1">Draft saved</span>
				{/if}
				<button
					class="px-[18px] py-[7px] rounded-md text-[13px] font-semibold font-inherit cursor-pointer border border-rv-border transition-all duration-150 bg-transparent text-rv-dim hover:text-rv-text hover:border-rv-accent disabled:opacity-50 disabled:cursor-not-allowed"
					onclick={saveDraft}
					disabled={submitting || savingDraft}
				>
					{savingDraft ? 'Saving...' : 'Save Draft'}
				</button>
				<button
					class="px-[18px] py-[7px] rounded-md text-[13px] font-semibold font-inherit cursor-pointer border transition-all duration-150 bg-rv-green text-white border-rv-green disabled:opacity-50 disabled:cursor-not-allowed"
					onclick={submitApproval}
					disabled={submitting || savingDraft}
				>
					{submitting ? 'Submitting...' : 'Submit Approval'}
				</button>
			</div>
		</div>
	{/if}

	{#if activeForm === 'changes'}
		<div class="pt-3 border-t border-rv-border">
			<h3 class="text-sm font-bold mb-3 flex items-center gap-1.5">
				<span class="w-2 h-2 rounded-full bg-rv-red"></span> Request Changes
			</h3>
			<div class="mb-3">
				<label for="changes-comment" class="block text-xs font-semibold text-rv-dim mb-1">
					What needs to change?
					<span class="font-normal opacity-80 italic">(shown to user)</span>
				</label>
				<textarea
					id="changes-comment"
					bind:value={changesComment}
					maxlength={500}
					placeholder="Describe what the user needs to fix or improve..."
					class="w-full bg-rv-surface border border-rv-border rounded-md p-2.5 text-rv-text font-inherit text-[13px] resize-vertical min-h-[60px] focus:outline-none focus:border-rv-accent"
				></textarea>
			</div>
			<div class="mb-3">
				<label class="flex items-center gap-1.5 text-xs text-rv-dim cursor-pointer">
					<input type="checkbox" bind:checked={rejectSendEmail} class="accent-rv-accent" />
					Send email notification to user
				</label>
			</div>
			<div class="flex gap-2 justify-end items-center">
				{#if draftSavedFlash}
					<span class="text-[11px] text-rv-green mr-1">Draft saved</span>
				{/if}
				<button
					class="px-[18px] py-[7px] rounded-md text-[13px] font-semibold font-inherit cursor-pointer border border-rv-border transition-all duration-150 bg-transparent text-rv-dim hover:text-rv-text hover:border-rv-accent disabled:opacity-50 disabled:cursor-not-allowed"
					onclick={saveDraft}
					disabled={submitting || savingDraft}
				>
					{savingDraft ? 'Saving...' : 'Save Draft'}
				</button>
				<button
					class="px-[18px] py-[7px] rounded-md text-[13px] font-semibold font-inherit cursor-pointer border transition-all duration-150 bg-rv-red text-white border-rv-red disabled:opacity-50 disabled:cursor-not-allowed"
					onclick={submitChangesNeeded}
					disabled={submitting || savingDraft}
				>
					{submitting ? 'Submitting...' : 'Request Changes'}
				</button>
			</div>
		</div>
	{/if}
</div>
