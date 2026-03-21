<script lang="ts">
	import { reviewSubmission } from '../api';

	interface Props {
		submissionId: number;
		hackatimeHours: number | null;
		editedHours?: number | null;
		onReviewComplete: () => void;
	}

	let { submissionId, hackatimeHours, editedHours = null, onReviewComplete }: Props = $props();

	let activeForm: 'approve' | 'changes' | null = $state(null);
	let submitting = $state(false);

	// Approval form fields
	let hoursJustification = $state('');
	let approveComment = $state('');
	let approvedHours = $state(hackatimeHours ?? 0);
	let reviewerManuallyEditedHours = $state(false);

	// Changes needed form fields
	let changesComment = $state('');

	// Reset fields when submission changes
	$effect(() => {
		submissionId; // track
		activeForm = null;
		hoursJustification = '';
		approveComment = '';
		approvedHours = hackatimeHours ?? 0;
		reviewerManuallyEditedHours = false;
		changesComment = '';
	});

	// Sync approved hours from the breakdown panel unless reviewer manually edited
	$effect(() => {
		if (editedHours != null && !reviewerManuallyEditedHours) {
			approvedHours = Math.round(editedHours * 10) / 10;
		}
	});

	function showForm(type: 'approve' | 'changes') {
		activeForm = activeForm === type ? null : type;
	}

	function hideForm() {
		activeForm = null;
	}

	async function submitApproval() {
		submitting = true;
		try {
			await reviewSubmission(submissionId, {
				approvalStatus: 'approved',
				approvedHours,
				hoursJustification: hoursJustification || undefined,
				userFeedback: approveComment || undefined,
			});
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
			await reviewSubmission(submissionId, {
				approvalStatus: 'rejected',
				userFeedback: changesComment,
			});
			onReviewComplete();
		} catch (error) {
			console.error('Review failed:', error);
			alert(`Review failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		} finally {
			submitting = false;
		}
	}
</script>

<div class="action-bar">
	<div class="action-bar-buttons">
		<button class="btn btn-approve" onclick={() => showForm('approve')}>✓ Approve</button>
		<button class="btn btn-changes" onclick={() => showForm('changes')}>✎ Changes Needed</button>
	</div>

	{#if activeForm === 'approve'}
		<div class="action-form">
			<h3><span class="dot dot-green"></span> Approve Project</h3>
			<div class="form-group">
				<label for="approved-hours">
					Approved Hours
					<span class="hint">(defaults to Hackatime hours)</span>
				</label>
				<input
					id="approved-hours"
					type="number"
					step="0.5"
					min="0"
					bind:value={approvedHours}
					oninput={() => { reviewerManuallyEditedHours = true; }}
					class="hours-field"
				/>
			</div>
			<div class="form-group">
				<label for="justify">
					Ship Justification
					<span class="hint">(not shown to user)</span>
				</label>
				<textarea
					id="justify"
					bind:value={hoursJustification}
					placeholder="Why are you approving this? e.g. hours look right, project is complete, shipped publicly..."
				></textarea>
			</div>
			<div class="form-group">
				<label for="approve-comment">
					Comment for User
					<span class="hint">(optional — shown to user)</span>
				</label>
				<textarea
					id="approve-comment"
					bind:value={approveComment}
					placeholder="Nice work! Any feedback you want to share..."
				></textarea>
			</div>
			<div class="form-actions">
				<button class="btn-sm cancel" onclick={hideForm}>Cancel</button>
				<button class="btn-sm submit-approve" onclick={submitApproval} disabled={submitting}>
					{submitting ? 'Submitting...' : 'Submit Approval'}
				</button>
			</div>
		</div>
	{/if}

	{#if activeForm === 'changes'}
		<div class="action-form">
			<h3><span class="dot dot-red"></span> Request Changes</h3>
			<div class="form-group">
				<label for="changes-comment">
					What needs to change?
					<span class="hint">(shown to user)</span>
				</label>
				<textarea
					id="changes-comment"
					bind:value={changesComment}
					placeholder="Describe what the user needs to fix or improve..."
				></textarea>
			</div>
			<div class="form-actions">
				<button class="btn-sm cancel" onclick={hideForm}>Cancel</button>
				<button
					class="btn-sm submit-changes"
					onclick={submitChangesNeeded}
					disabled={submitting}
				>
					{submitting ? 'Submitting...' : 'Submit'}
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.action-bar {
		background: var(--surface);
		border-top: 1px solid var(--border);
		padding: 12px 20px;
		flex-shrink: 0;
	}

	.action-bar-buttons {
		display: flex;
		gap: 10px;
		align-items: center;
	}

	.btn {
		padding: 10px 24px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		border: 2px solid transparent;
		transition: all 0.15s;
	}

	.btn-approve {
		background: var(--green);
		color: #fff;
	}

	.btn-approve:hover {
		background: #66bb6a;
	}

	.btn-changes {
		background: var(--red-bg);
		color: var(--red);
		border-color: var(--red);
	}

	.btn-changes:hover {
		background: rgba(239, 83, 80, 0.2);
	}

	.action-form {
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--border);
	}

	.action-form h3 {
		font-size: 14px;
		font-weight: 700;
		margin-bottom: 12px;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.dot-green {
		background: var(--green);
	}

	.dot-red {
		background: var(--red);
	}

	.form-group {
		margin-bottom: 12px;
	}

	.form-group label {
		display: block;
		font-size: 12px;
		font-weight: 600;
		color: var(--text-dim);
		margin-bottom: 4px;
	}

	.hint {
		font-weight: 400;
		opacity: 0.7;
		font-style: italic;
	}

	.form-group textarea,
	.hours-field {
		width: 100%;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 10px;
		color: var(--text);
		font-family: inherit;
		font-size: 13px;
		resize: vertical;
		min-height: 60px;
	}

	.hours-field {
		min-height: unset;
		width: 100px;
		font-family: 'Space Mono', monospace;
		font-weight: 600;
	}

	.form-group textarea:focus,
	.hours-field:focus {
		outline: none;
		border-color: var(--accent);
	}

	.form-actions {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}

	.btn-sm {
		padding: 7px 18px;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		border: 1px solid var(--border);
		transition: all 0.15s;
	}

	.btn-sm.cancel {
		background: transparent;
		color: var(--text-dim);
	}

	.btn-sm.cancel:hover {
		color: var(--text);
	}

	.btn-sm.submit-approve {
		background: var(--green);
		color: #fff;
		border-color: var(--green);
	}

	.btn-sm.submit-changes {
		background: var(--red);
		color: #fff;
		border-color: var(--red);
	}

	.btn-sm:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
