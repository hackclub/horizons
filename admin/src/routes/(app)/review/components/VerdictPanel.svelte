<script lang="ts">
	import { api, type components } from '$lib/api';
	import { toast } from '$lib/toastStore';
	import { timeAgo, formatDate } from '../utils';
	import JustificationBuilder from './JustificationBuilder.svelte';

	type SentToAdminInfo = components['schemas']['SentToAdminInfoResponse'];

	interface Props {
		submissionId: number;
		/** Current finalized status of the submission. Drives the superadmin
		 *  override gating — flipping approved↔rejected is superadmin-only. */
		approvalStatus?: 'pending' | 'approved' | 'rejected';
		/** Whether the active user is a superadmin. Required to flip a
		 *  finalized submission's status (approved↔rejected). */
		isSuperadmin?: boolean;
		/** Whether the active user is an admin (or superadmin). Escalated
		 *  submissions only accept verdicts from admins, and only admins can
		 *  return one to the reviewer queue. */
		isAdmin?: boolean;
		/** Set when this submission is already in the admin queue. */
		sentToAdmin?: SentToAdminInfo | null;
		/** Called after a successful send-to-admin or return-to-queue, with the
		 *  new escalation state (info object or null). */
		onSentToAdminChange?: (info: SentToAdminInfo | null) => void;
		/** Whether the submission has a per-project Airtable record. Drives
		 *  the optional "+ Delete Airtable" button on the approved→rejected
		 *  override path. */
		hasAirtableRecord?: boolean;
		hackatimeHours: number | null;
		/** Hours Hackatime attributed to AI coding / non-coding categories, from
		 *  the live hour breakdown. null while it's still loading or unavailable. */
		aiHours?: number | null;
		/** Total hours from that same live breakdown. Paired with aiHours to get
		 *  the AI share — the absolute figures aren't comparable to hackatimeHours. */
		totalHours?: number | null;
		/** Which Hackatime window the aiHours/totalHours pair was measured over:
		 *  'ship' = cutoff → submission date, 'overall' = cutoff → now. Shown so
		 *  the reviewer knows what the AI share covers (toggle lives on the
		 *  Hours Breakdown card). */
		aiScope?: 'ship' | 'overall';
		/** AI hours recorded on the submission when it was last reviewed. */
		priorAiHours?: number | null;
		/** Whether the AI reduction checkbox was ticked the last time this
		 *  submission was reviewed. null for submissions reviewed before the
		 *  checkbox existed — those fall back to ticked. */
		priorAiReductionApplied?: boolean | null;
		joeFraudPassed?: boolean | null;
		/** Reviewer's own decision — null when the reviewer hasn't voted yet. */
		reviewPassed?: boolean | null;
		priorApprovedHours?: number | null;
		priorReviewerAnalysis?: string | null;
		priorUserFeedback?: string | null;
		isResubmission?: boolean;
		hasPriorYswsSubmission?: boolean;
		/** approvedHours from the most recent OTHER approved submission for this
		 *  project, if any. Used to surface the reship delta. */
		priorReshipApprovedHours?: number | null;
		/** Hours the reviewer of that prior approval took off by hand, on top of
		 *  the automatic AI reduction. Carried forward so a reship doesn't
		 *  re-credit time an earlier reviewer already rejected. */
		priorManualReduction?: number;
		/** Sum of hoursShipped from non-Horizons Manifest entries — already
		 *  credited elsewhere, so subtracted from the delta sent to Airtable. */
		priorYswsHoursShipped?: number;
		readOnly?: boolean;
		onReviewComplete: (approved: boolean) => void;
	}

	let {
		submissionId,
		approvalStatus = 'pending',
		isSuperadmin = false,
		isAdmin = false,
		sentToAdmin = null,
		onSentToAdminChange,
		hasAirtableRecord = false,
		hackatimeHours,
		aiHours = null,
		totalHours = null,
		aiScope = 'ship',
		priorAiHours = null,
		priorAiReductionApplied = null,
		joeFraudPassed = null,
		reviewPassed = null,
		priorApprovedHours = null,
		priorReviewerAnalysis = null,
		priorUserFeedback = null,
		isResubmission = false,
		hasPriorYswsSubmission = false,
		priorReshipApprovedHours = null,
		priorManualReduction = 0,
		priorYswsHoursShipped = 0,
		readOnly = false,
		onReviewComplete,
	}: Props = $props();

	let activeForm = $state<'approve' | 'changes' | 'admin'>('changes');

	// True when the active form would flip a finalized submission to the
	// opposite status — the backend blocks this for non-superadmins.
	let isStatusFlip = $derived(
		(approvalStatus === 'approved' && activeForm === 'changes') ||
			(approvalStatus === 'rejected' && activeForm === 'approve'),
	);
	let flipBlocked = $derived(isStatusFlip && !isSuperadmin);
	// Escalated submissions only accept verdicts from admins — the backend
	// refuses reviewer verdicts, so gray the submit buttons with a hint.
	let escalationBlocked = $derived(!!sentToAdmin && !isAdmin);
	let submitting = $state(false);
	let savingDraft = $state(false);
	let draftSavedFlash = $state(false);
	// Stays true after a successful verdict so the submit buttons remain grayed
	// out — prevents accidental double-submission once the parent has switched
	// to a different tab. Resets when the submission changes.
	let justSubmitted = $state(false);

	// Approval form fields
	let hoursJustification = $state('');
	let approveComment = $state('');
	let approvedHours = $state(hackatimeHours ?? 0);
	let reviewerManuallyEditedHours = $state(false);
	let approvedHoursLocked = $state(true);
	let sendEmail = $state(true);
	// Ticked by default: AI-detected time is credited at a third. Untick only to
	// grant the full tracked AI time — the justification records the override.
	let reduceAiHours = $state(true);

	// The breakdown's absolute hours are NOT comparable to hackatimeHours: the
	// submission's figure is deduped and frozen at ship time, while the
	// breakdown is a live, non-deduped query over the same projects. Only the
	// AI *share* survives that mismatch (see HackatimeService.getProjectHourBreakdown),
	// so take the ratio and apply it to the hours actually being approved.
	let aiShare = $derived(
		aiHours != null && totalHours != null && totalHours > 0
			? Math.min(1, Math.max(0, aiHours / totalHours))
			: null,
	);
	let liveAiHours = $derived(
		aiShare != null && hackatimeHours != null ? hackatimeHours * aiShare : null,
	);
	// Re-submitting an unchanged verdict must not change the record. Once a
	// submission has been reviewed, keep the snapshot its approved figure was
	// derived from — the live breakdown grows as the user keeps coding, and
	// re-deriving from it would invent adjustments nobody made.
	// Set when the reviewer explicitly asks to re-derive from the live
	// breakdown instead of the stored snapshot.
	let useLiveAiBreakdown = $state(false);
	let usingPriorSnapshot = $derived(
		reviewPassed === true && priorAiHours != null && !useLiveAiBreakdown,
	);
	let effectiveAiHours = $derived(
		usingPriorSnapshot
			? Math.min(priorAiHours ?? 0, hackatimeHours ?? 0)
			: liveAiHours,
	);
	// Set when the live breakdown has drifted away from the stored snapshot —
	// surfaced so a reviewer re-opening an old verdict can see both figures and
	// deliberately switch to the current one.
	let driftedLiveAiHours = $derived(
		usingPriorSnapshot &&
			liveAiHours != null &&
			Math.abs(liveAiHours - (effectiveAiHours ?? 0)) >= 0.5
			? liveAiHours
			: null,
	);
	let nonAiHours = $derived(
		effectiveAiHours != null && hackatimeHours != null
			? hackatimeHours - effectiveAiHours
			: null,
	);
	let reducedAiHours = $derived(
		effectiveAiHours != null ? effectiveAiHours / 3 : null,
	);
	// The hour count the checkbox implies: standard coding in full + a third of
	// the AI time.
	let baseApprovedHours = $derived(
		reduceAiHours && nonAiHours != null && reducedAiHours != null
			? nonAiHours + reducedAiHours
			: (hackatimeHours ?? 0),
	);
	// A manual deduction on an earlier approval of this project stays deducted:
	// that time is still inside the cumulative tracked figure above, so without
	// this a reship silently re-credits hours a previous reviewer rejected.
	// Backend computes the figure (priorManualReduction) so both sides agree.
	let computedApprovedHours = $derived(
		Math.round((baseApprovedHours - priorManualReduction) * 100) / 100,
	);
	// Approved hours are cumulative across reships and overwrite the project's
	// balance, so a rising AI share on an update could compute below what was
	// already granted and quietly claw credit back. Floor the default at the
	// previous approval — a reviewer can still type something lower deliberately.
	let heldAtPriorApproval = $derived(
		priorReshipApprovedHours != null &&
			computedApprovedHours < priorReshipApprovedHours - 0.05,
	);
	// Anything the field differs from this by is a manual reviewer adjustment.
	let autoApprovedHours = $derived(
		heldAtPriorApproval
			? (priorReshipApprovedHours as number)
			: computedApprovedHours,
	);
	// 0.05h ≈ 3min — the same tolerance buildFullJustification uses to decide
	// whether to report a manual adjustment.
	let manuallyAdjusted = $derived(
		Math.abs(approvedHours - autoApprovedHours) >= 0.05,
	);

	function fmtH(hours: number): string {
		return `${Math.round(hours * 100) / 100}h`;
	}

	// Re-apply the default whenever the inputs to it change (the AI breakdown
	// loads after the submission does), unless the reviewer typed their own value.
	$effect(() => {
		const auto = autoApprovedHours;
		if (reviewerManuallyEditedHours) return;
		approvedHours = auto;
	});

	// Changes needed form fields
	let changesComment = $state('');
	let rejectSendEmail = $state(true);
	let permReject = $state(false);
	// Internal note written to project.adminComment. Only shown when permReject
	// is checked — the reject form is otherwise single-textarea.
	let permRejectInternalNote = $state('');

	// Send-to-admin form fields
	let sendToAdminNote = $state('');
	let sendingToAdmin = $state(false);
	let returningToQueue = $state(false);

	// Manifest dedupe math commented out — we no longer subtract prior YSWS
	// hoursShipped from the granted credit, we just surface a notice that the
	// project was credited elsewhere.
	// let alreadyCreditedHours = $derived(
	// 	Math.round(((priorReshipApprovedHours ?? 0) + priorYswsHoursShipped) * 10) /
	// 		10,
	// );
	let hasReshipContext = $derived(
		priorReshipApprovedHours != null || priorYswsHoursShipped > 0,
	);
	let reshipNoticeDismissed = $state(false);
	// let reshipDelta = $derived(
	// 	hasReshipContext
	// 		? Math.round((approvedHours - alreadyCreditedHours) * 10) / 10
	// 		: null,
	// );

	// Reset fields when submission changes. Autofill keys off the reviewer's own
	// decision (reviewPassed), not approvalStatus — a reviewer-approved submission
	// stuck on pending fraud should still surface the prior verdict. Drafts saved
	// without a verdict also persist via priorUserFeedback / priorReviewerAnalysis.
	$effect(() => {
		submissionId; // track
		const reviewerApproved = reviewPassed === true;
		// Escalated + undecided lands on the admin tab so whoever opens the
		// verdict panel sees the escalation context first.
		activeForm = reviewerApproved
			? 'approve'
			: sentToAdmin
				? 'admin'
				: 'changes';
		sendToAdminNote = '';
		hoursJustification = priorReviewerAnalysis ?? '';
		const feedback = priorUserFeedback ?? '';
		approveComment = reviewPassed === false ? '' : feedback;
		approvedHours = reviewerApproved
			? priorApprovedHours ?? hackatimeHours ?? 0
			: hackatimeHours ?? 0;
		// An already-reviewed submission keeps the toggle the reviewer chose;
		// anything else starts ticked.
		reduceAiHours = priorAiReductionApplied ?? true;
		useLiveAiBreakdown = false;
		// A prior verdict's hours stand as-is — don't let the auto-default
		// overwrite what the last reviewer decided.
		reviewerManuallyEditedHours = reviewerApproved;
		approvedHoursLocked = true;
		sendEmail = true;
		changesComment = reviewPassed === true ? '' : feedback;
		rejectSendEmail = true;
		permReject = false;
		permRejectInternalNote = '';
		justSubmitted = false;
		reshipNoticeDismissed = false;
	});

	function setVerdict(type: 'approve' | 'changes' | 'admin') {
		activeForm = type;
	}

	async function submitSendToAdmin() {
		const note = sendToAdminNote.trim();
		if (!note) {
			toast.error('A note explaining why this needs an admin is required.');
			return;
		}
		sendingToAdmin = true;
		try {
			const { error } = await api.POST(
				'/api/reviewer/submissions/{id}/send-to-admin',
				{
					params: { path: { id: submissionId } },
					body: { note },
				},
			);
			if (error)
				throw new Error(
					(error as { message?: string })?.message ??
						`Failed to send submission ${submissionId} to second review`,
				);
			toast.success('Sent to second review');
			justSubmitted = true;
			// Optimistic local echo — the parent refetches on next load anyway.
			onSentToAdminChange?.({
				sentAt: new Date().toISOString(),
				byUserId: null,
				byName: 'you',
				note,
			});
		} catch (error) {
			console.error('Send to second review failed:', error);
			toast.error(
				`Send to second review failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		} finally {
			sendingToAdmin = false;
		}
	}

	async function returnToReviewerQueue() {
		returningToQueue = true;
		try {
			const { error } = await api.DELETE(
				'/api/reviewer/submissions/{id}/send-to-admin',
				{ params: { path: { id: submissionId } } },
			);
			if (error)
				throw new Error(
					(error as { message?: string })?.message ??
						`Failed to return submission ${submissionId} to the reviewer queue`,
				);
			toast.success('Returned to the reviewer queue');
			onSentToAdminChange?.(null);
		} catch (error) {
			console.error('Return to queue failed:', error);
			toast.error(
				`Return to queue failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		} finally {
			returningToQueue = false;
		}
	}

	async function submitApproval() {
		submitting = true;
		try {
			const { error } = await api.PUT('/api/reviewer/submissions/{id}/review', {
				params: { path: { id: submissionId } },
				body: {
					approvalStatus: 'approved',
					approvedHours,
					// Absent when the breakdown never loaded — the backend then
					// measures the AI snapshot server-side. A literal 0 here would
					// be recorded as "measured, none found" and the justification
					// would assert no AI time exists.
					...(effectiveAiHours != null
						? { aiHours: effectiveAiHours, aiReductionApplied: reduceAiHours }
						: {}),
					hoursJustification: hoursJustification || undefined,
					userFeedback: approveComment || undefined,
					sendEmail,
				} as any,
			});
			if (error) throw new Error(`Failed to approve submission ${submissionId}`);
			toast.success('Project approved');
			justSubmitted = true;
			onReviewComplete(true);
		} catch (error) {
			console.error('Approval failed:', error);
			toast.error(
				`Approval failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		} finally {
			submitting = false;
		}
	}

	async function submitChangesNeeded(opts: { deleteAirtableRecord?: boolean } = {}) {
		if (!changesComment.trim()) {
			toast.error('Please describe what needs to change.');
			return;
		}

		if (permReject) {
			const confirmed = window.confirm(
				'Permanently reject this project? The user will see your reason and will NOT be able to resubmit or edit the project. This is final.',
			);
			if (!confirmed) return;
		}

		if (opts.deleteAirtableRecord) {
			const confirmed = window.confirm(
				'Reject this submission AND permanently delete the Airtable record? Airtable has no undo — this cannot be recovered.',
			);
			if (!confirmed) return;
		}

		submitting = true;
		try {
			const internalNote = permRejectInternalNote.trim();
			const { error } = await api.PUT('/api/reviewer/submissions/{id}/review', {
				params: { path: { id: submissionId } },
				body: {
					approvalStatus: 'rejected',
					userFeedback: changesComment,
					sendEmail: rejectSendEmail,
					...(permReject
						? {
								permReject: true,
								...(internalNote ? { adminComment: internalNote } : {}),
							}
						: {}),
					...(opts.deleteAirtableRecord ? { deleteAirtableRecord: true } : {}),
				} as any,
			});
			if (error)
				throw new Error(`Failed to reject submission ${submissionId}`);
			toast.success(permReject ? 'Project permanently rejected' : 'Changes requested');
			justSubmitted = true;
			onReviewComplete(false);
		} catch (error) {
			console.error('Review failed:', error);
			toast.error(
				`Review failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
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
							...(effectiveAiHours != null
								? { aiHours: effectiveAiHours, aiReductionApplied: reduceAiHours }
								: {}),
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
			toast.error(
				`Save failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		} finally {
			savingDraft = false;
		}
	}

	let sendingPreview = $state(false);

	async function previewSlackMessage() {
		sendingPreview = true;
		try {
			const feedbackText = activeForm === 'approve' ? approveComment : changesComment;
			const isApproved = activeForm === 'approve';

			const { error } = await api.POST('/api/reviewer/submissions/{id}/preview-slack-message', {
				params: { path: { id: submissionId } },
				body: {
					userFeedback: feedbackText,
					approvedHours: approvedHours,
					approved: isApproved,
				},
			});

			if (error) {
				const errMsg = (error as { message?: string })?.message || 'Unknown error';
				throw new Error(errMsg);
			}

			toast.success('Preview DM sent to your Slack!');
		} catch (error) {
			console.error('Preview Slack DM failed:', error);
			toast.error(
				`Preview failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		} finally {
			sendingPreview = false;
		}
	}
</script>

<div class="h-full overflow-y-auto bg-rv-bg p-5">
	{#if sentToAdmin}
		<div class="mb-4 rounded-md border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-rv-text">
			<strong class="text-amber-600">In second review</strong>
			<span class="text-rv-dim">
				— sent by {sentToAdmin.byName}
				<span class="border-b border-dotted border-rv-dim cursor-default" title={formatDate(sentToAdmin.sentAt)}>{timeAgo(sentToAdmin.sentAt)}</span>.
				{isAdmin ? 'Decide it here or return it to the reviewer queue below.' : 'Only admins can submit a verdict on it.'}
			</span>
		</div>
	{/if}

	<!-- Full-width slide toggle -->
	<div class="relative flex w-full rounded-lg bg-rv-surface border border-rv-border mb-4 overflow-hidden">
		<div
			class="absolute top-0 bottom-0 w-1/3 rounded-lg transition-all duration-200 ease-in-out {activeForm === 'changes' ? 'left-0 bg-rv-red' : activeForm === 'approve' ? 'left-1/3 bg-rv-green' : 'left-2/3 bg-gray-500'}"
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
		<button
			class="relative z-10 flex-1 py-2.5 text-sm font-semibold font-inherit cursor-pointer bg-transparent border-none transition-colors duration-200 {activeForm === 'admin' ? 'text-white' : 'text-rv-dim hover:text-rv-text'}"
			onclick={() => setVerdict('admin')}
		>
			Second Review
		</button>
	</div>

	{#if activeForm === 'approve'}
		<div class="pt-3 border-t border-rv-border">
			<h3 class="text-sm font-bold mb-3 flex items-center gap-1.5">
				<span class="w-2 h-2 rounded-full bg-rv-green"></span> Approve Project
			</h3>
			{#if isResubmission || hasPriorYswsSubmission}
				<div class="mb-3 rounded-md border border-rv-blue/60 bg-rv-blue/15 px-3 py-2 text-xs leading-relaxed text-rv-text">
					<strong class="text-rv-blue">{hasPriorYswsSubmission && !isResubmission ? 'Submitted to another YSWS' : 'Resubmission'}:</strong> This is an update to an already submitted project. You'll need to describe what changed in the project compared to the previous submission.
				</div>
			{/if}
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
					<span class="font-normal opacity-80 italic">(defaults to the calculation below)</span>
				</label>
				<div class="flex items-center gap-2">
					<input
						id="approved-hours"
						type="number"
						step="0.01"
						min="0"
						bind:value={approvedHours}
						disabled={approvedHoursLocked}
						oninput={() => { reviewerManuallyEditedHours = true; }}
						class="w-[100px] bg-rv-surface border border-rv-border rounded-md p-2.5 text-rv-text text-[13px] font-semibold resize-vertical focus:outline-none focus:border-rv-accent disabled:opacity-60 disabled:cursor-not-allowed"
					/>
					{#if approvedHoursLocked}
						<button
							type="button"
							class="px-2.5 py-1.5 rounded-md text-[11px] font-semibold font-inherit cursor-pointer border border-rv-border bg-transparent text-rv-dim hover:text-rv-text hover:border-rv-accent transition-colors duration-150"
							onclick={() => (approvedHoursLocked = false)}
							title="Override the submitted hours"
						>
							Make adjustments
						</button>
					{:else}
						<button
							type="button"
							class="px-2.5 py-1.5 rounded-md text-[11px] font-semibold font-inherit cursor-pointer border border-rv-border bg-transparent text-rv-dim hover:text-rv-text hover:border-rv-accent transition-colors duration-150"
							onclick={() => (approvedHoursLocked = true)}
							title="Lock the current value"
						>
							Lock
						</button>
						<button
							type="button"
							class="px-2.5 py-1.5 rounded-md text-[11px] font-semibold font-inherit cursor-pointer border border-rv-border bg-transparent text-rv-dim hover:text-rv-text hover:border-rv-accent transition-colors duration-150"
							onclick={() => {
								approvedHoursLocked = true;
								reviewerManuallyEditedHours = false;
								approvedHours = autoApprovedHours;
							}}
							title="Reset to the calculated default and lock"
						>
							Reset
						</button>
					{/if}
				</div>

				<!-- AI reduction toggle + where the number in the box comes from -->
				<div class="mt-2 rounded-md border border-rv-border bg-rv-surface/50 px-2.5 py-2">
					<label class="flex items-start gap-1.5 text-[11px] leading-snug text-rv-text cursor-pointer">
						<input
							type="checkbox"
							bind:checked={reduceAiHours}
							onchange={() => {
								// Retoggling recomputes the default — the reviewer's own
								// edit no longer applies to a different baseline.
								reviewerManuallyEditedHours = false;
								approvedHours = autoApprovedHours;
							}}
							class="accent-rv-accent mt-0.5"
						/>
						<span>
							Reduce 'AI coding' hours to 1/3 of tracked time
							<span class="text-rv-dim italic">(don't touch unless you know what you're doing)</span>
						</span>
					</label>

					<div class="mt-1.5 pl-5 text-[11px] leading-relaxed text-rv-dim">
						{#if hackatimeHours == null}
							No tracked hours on this submission.
						{:else if effectiveAiHours == null || nonAiHours == null || reducedAiHours == null}
							{fmtH(hackatimeHours)} tracked · AI breakdown unavailable — approving the full tracked time.
						{:else if effectiveAiHours < 0.05}
							{fmtH(hackatimeHours)} tracked · no AI time detected, nothing to reduce.
						{:else if reduceAiHours}
							<span class="text-rv-text font-semibold">{fmtH(hackatimeHours)}</span> tracked,
							of which <span class="text-rv-text font-semibold">{fmtH(effectiveAiHours)}</span> was AI
							→ reduced to <span class="text-rv-text font-semibold">{fmtH(reducedAiHours)}</span>.
							<br />
							{fmtH(nonAiHours)} standard + {fmtH(reducedAiHours)} AI =
							<span class="text-rv-text font-semibold">{fmtH(baseApprovedHours)}</span>
						{:else}
							<span class="text-rv-text font-semibold">{fmtH(hackatimeHours)}</span> tracked,
							of which <span class="text-rv-text font-semibold">{fmtH(effectiveAiHours)}</span> was AI —
							credited in full (reduction overridden).
						{/if}
						{#if priorManualReduction >= 0.05}
							<br />
							<span class="text-amber-600 font-semibold">
								−{fmtH(priorManualReduction)} carried forward from a manual deduction on
								a previous approval of this project (that time is still in the tracked
								total above) = {fmtH(computedApprovedHours)}
							</span>
						{/if}
						{#if heldAtPriorApproval}
							<br />
							<span class="text-amber-600 font-semibold">
								Held at {fmtH(autoApprovedHours)} — already approved for this project.
								The AI reduction alone would compute {fmtH(computedApprovedHours)}, which
								would take back credit already granted.
							</span>
						{/if}
						{#if manuallyAdjusted}
							<br />
							<span class="text-amber-600 font-semibold">
								Manual adjustment: {fmtH(autoApprovedHours)} → {fmtH(approvedHours)}
							</span>
						{/if}
						{#if usingPriorSnapshot}
							<br />
							<span class="opacity-80">AI figure from the original review.</span>
							{#if driftedLiveAiHours != null}
								<button
									type="button"
									class="ml-1 underline underline-offset-2 bg-transparent border-none p-0 text-[11px] font-inherit text-rv-accent cursor-pointer"
									onclick={() => {
										useLiveAiBreakdown = true;
										reviewerManuallyEditedHours = false;
										approvedHours = autoApprovedHours;
									}}
									title="Re-derive the default from the current Hackatime breakdown"
								>
									Live breakdown now says {fmtH(driftedLiveAiHours)} — use it
								</button>
							{/if}
						{:else if aiShare != null && effectiveAiHours != null && effectiveAiHours >= 0.05}
							<br />
							<span class="opacity-80">
								{Math.round(aiShare * 100)}% of logged time is AI
								({aiScope === 'ship' ? 'up to the submission date' : 'overall, including post-ship activity'}),
								applied to the {fmtH(hackatimeHours ?? 0)} tracked at submission.
							</span>
						{/if}
					</div>
				</div>

				{#if priorYswsHoursShipped > 0}
					<p class="mt-1 mb-0 text-[11px] text-rv-dim flex items-center gap-1.5">
						<span>
							Notice: <span class="font-semibold text-rv-text">{priorYswsHoursShipped.toFixed(1)}h</span> credited to other YSWS
						</span>
					</p>
				{/if}
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
					maxlength={5000}
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
					type="button"
					class="px-[18px] py-[7px] rounded-md text-[13px] font-semibold font-inherit cursor-pointer border border-rv-border transition-all duration-150 bg-transparent text-rv-dim hover:text-rv-text hover:border-rv-accent disabled:opacity-50 disabled:cursor-not-allowed"
					onclick={previewSlackMessage}
					disabled={sendingPreview || submitting || savingDraft || readOnly}
				>
					{sendingPreview ? 'Sending...' : 'Preview Slack'}
				</button>
				<button
					class="px-[18px] py-[7px] rounded-md text-[13px] font-semibold font-inherit cursor-pointer border border-rv-border transition-all duration-150 bg-transparent text-rv-dim hover:text-rv-text hover:border-rv-accent disabled:opacity-50 disabled:cursor-not-allowed"
					onclick={saveDraft}
					disabled={submitting || savingDraft || readOnly}
				>
					{savingDraft ? 'Saving...' : 'Save Draft'}
				</button>
				<button
					class="px-[18px] py-[7px] rounded-md text-[13px] font-semibold font-inherit cursor-pointer border transition-all duration-150 bg-rv-green text-white border-rv-green disabled:opacity-50 disabled:cursor-not-allowed"
					onclick={submitApproval}
					disabled={submitting || savingDraft || justSubmitted || readOnly || flipBlocked || escalationBlocked}
					title={flipBlocked
						? 'Superadmin only: flipping a rejected submission to approved'
						: escalationBlocked
							? 'This submission is in second review — only admins can submit a verdict'
							: undefined}
				>
					{submitting
						? 'Submitting...'
						: justSubmitted
							? 'Submitted'
							: isStatusFlip && isSuperadmin
								? 'Override → Approve'
								: 'Submit Approval'}
				</button>
			</div>
			{#if flipBlocked}
				<p class="mt-2 text-right text-[11px] text-rv-dim">
					This submission is already rejected. Only superadmins can flip it to approved.
				</p>
			{/if}
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
					maxlength={5000}
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
			<div class="mb-3 rounded-md border {permReject ? 'border-rv-red bg-rv-red/10' : 'border-rv-border'} p-2.5 space-y-2">
				<label class="flex items-start gap-1.5 text-xs text-rv-text cursor-pointer">
					<input type="checkbox" bind:checked={permReject} class="accent-rv-red mt-0.5" />
					<span>
						<span class="font-semibold text-rv-red">Permanently reject</span>
						<span class="text-rv-dim"> — user cannot resubmit or edit the project. The reason above is shown to them as final.</span>
					</span>
				</label>
				{#if permReject}
					<label class="block">
						<span class="block text-[11px] uppercase tracking-wide text-rv-dim mb-1">
							Internal note <span class="normal-case font-normal opacity-80 italic">(admin-only)</span>
						</span>
						<textarea
							bind:value={permRejectInternalNote}
							maxlength={1000}
							placeholder="Why this is being perm-rejected — context for future admins reviewing this project."
							class="w-full bg-rv-surface border border-rv-border rounded-md p-2.5 text-rv-text font-inherit text-[13px] resize-vertical min-h-[60px] focus:outline-none focus:border-rv-accent"
						></textarea>
					</label>
				{/if}
			</div>
			<div class="flex gap-2 justify-end items-center">
				{#if draftSavedFlash}
					<span class="text-[11px] text-rv-green mr-1">Draft saved</span>
				{/if}
				<button
					type="button"
					class="px-[18px] py-[7px] rounded-md text-[13px] font-semibold font-inherit cursor-pointer border border-rv-border transition-all duration-150 bg-transparent text-rv-dim hover:text-rv-text hover:border-rv-accent disabled:opacity-50 disabled:cursor-not-allowed"
					onclick={previewSlackMessage}
					disabled={sendingPreview || submitting || savingDraft || readOnly}
				>
					{sendingPreview ? 'Sending...' : 'Preview Slack'}
				</button>
				<button
					class="px-[18px] py-[7px] rounded-md text-[13px] font-semibold font-inherit cursor-pointer border border-rv-border transition-all duration-150 bg-transparent text-rv-dim hover:text-rv-text hover:border-rv-accent disabled:opacity-50 disabled:cursor-not-allowed"
					onclick={saveDraft}
					disabled={submitting || savingDraft || readOnly}
				>
					{savingDraft ? 'Saving...' : 'Save Draft'}
				</button>
				<button
					class="px-[18px] py-[7px] rounded-md text-[13px] font-semibold font-inherit cursor-pointer border transition-all duration-150 bg-rv-red text-white border-rv-red disabled:opacity-50 disabled:cursor-not-allowed"
					onclick={() => submitChangesNeeded()}
					disabled={submitting || savingDraft || justSubmitted || readOnly || flipBlocked || escalationBlocked}
					title={flipBlocked
						? 'Superadmin only: flipping an approved submission to rejected'
						: escalationBlocked
							? 'This submission is in second review — only admins can submit a verdict'
							: undefined}
				>
					{submitting
						? 'Submitting...'
						: justSubmitted
							? 'Submitted'
							: permReject
								? 'Permanently Reject'
								: isStatusFlip && isSuperadmin
									? 'Override → Reject'
									: 'Request Changes'}
				</button>
				{#if isStatusFlip && isSuperadmin && hasAirtableRecord}
					<button
						class="px-[18px] py-[7px] rounded-md text-[13px] font-semibold font-inherit cursor-pointer border transition-all duration-150 bg-rv-red text-white border-rv-red disabled:opacity-50 disabled:cursor-not-allowed"
						onclick={() => submitChangesNeeded({ deleteAirtableRecord: true })}
						disabled={submitting || savingDraft || justSubmitted || readOnly}
						title="Reject and permanently delete the Airtable record (unrecoverable)"
					>
						{submitting ? 'Submitting...' : 'Override → Reject + Delete Airtable'}
					</button>
				{/if}
			</div>
			{#if flipBlocked}
				<p class="mt-2 text-right text-[11px] text-rv-dim">
					This submission is already approved. Only superadmins can flip it to rejected.
				</p>
			{/if}
		</div>
	{/if}

	{#if activeForm === 'admin'}
		<div class="pt-3 border-t border-rv-border">
			<h3 class="text-sm font-bold mb-3 flex items-center gap-1.5">
				<span class="w-2 h-2 rounded-full bg-gray-500"></span> Second Review
				<span class="text-[11px] font-normal text-rv-dim">(send to admin)</span>
			</h3>
			{#if sentToAdmin}
				<div class="mb-3 rounded-md border border-amber-500/60 bg-amber-500/10 p-3 text-[13px] leading-relaxed text-rv-text">
					<p class="m-0 text-[11px] uppercase tracking-wide text-amber-600 font-semibold">
						Sent by {sentToAdmin.byName}
						<span class="normal-case font-normal text-rv-dim">
							· <span class="border-b border-dotted border-rv-dim cursor-default" title={formatDate(sentToAdmin.sentAt)}>{timeAgo(sentToAdmin.sentAt)}</span>
						</span>
					</p>
					<p class="mt-1.5 mb-0 whitespace-pre-line wrap-break-word">{sentToAdmin.note}</p>
				</div>
				{#if isAdmin}
					<p class="text-[12px] text-rv-dim mb-3">
						Approve or request changes using the other tabs, or send it back to the regular reviewer queue.
					</p>
					<div class="flex gap-2 justify-end items-center">
						<button
							class="px-[18px] py-[7px] rounded-md text-[13px] font-semibold font-inherit cursor-pointer border border-rv-border transition-all duration-150 bg-transparent text-rv-dim hover:text-rv-text hover:border-rv-accent disabled:opacity-50 disabled:cursor-not-allowed"
							onclick={returnToReviewerQueue}
							disabled={returningToQueue || readOnly}
						>
							{returningToQueue ? 'Returning...' : 'Return to Reviewer Queue'}
						</button>
					</div>
				{:else}
					<p class="text-[12px] text-rv-dim mb-0">
						An admin will pick this up from the second review queue — no further action needed from you.
					</p>
				{/if}
			{:else if approvalStatus !== 'pending' || reviewPassed !== null}
				<p class="text-[12px] text-rv-dim mb-0">
					Only pending, unreviewed submissions can be sent to second review.
				</p>
			{:else}
				<p class="text-[12px] text-rv-dim mb-3">
					Moves this submission out of the reviewer queue into the second review queue that only admins act on. The user isn't notified.
				</p>
				<div class="mb-3">
					<label for="send-to-admin-note" class="block text-xs font-semibold text-rv-dim mb-1">
						Why does this need an admin?
						<span class="font-normal opacity-80 italic">(required — internal, shown to admins)</span>
					</label>
					<textarea
						id="send-to-admin-note"
						bind:value={sendToAdminNote}
						maxlength={2000}
						placeholder="e.g. hours look inflated but I can't verify, user is claiming special circumstances, policy question..."
						class="w-full bg-rv-surface border border-rv-border rounded-md p-2.5 text-rv-text font-inherit text-[13px] resize-vertical min-h-[80px] focus:outline-none focus:border-rv-accent"
					></textarea>
				</div>
				<div class="flex gap-2 justify-end items-center">
					<button
						class="px-[18px] py-[7px] rounded-md text-[13px] font-semibold font-inherit cursor-pointer border transition-all duration-150 bg-gray-500 text-white border-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
						onclick={submitSendToAdmin}
						disabled={sendingToAdmin || submitting || savingDraft || justSubmitted || readOnly || !sendToAdminNote.trim()}
						title={!sendToAdminNote.trim() ? 'A note is required' : undefined}
					>
						{sendingToAdmin ? 'Sending...' : justSubmitted ? 'Sent' : 'Send to Second Review'}
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>
