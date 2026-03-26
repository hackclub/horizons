<script lang="ts">
	import { api } from '$lib/api';

	interface Props {
		submissionId: number;
		hackatimeHours: number | null;
		editedHours?: number | null;
		projectTitle: string | null;
		projectDescription: string | null;
		screenshotUrl: string | null;
		onReviewComplete: () => void;
	}

	let {
		submissionId,
		hackatimeHours,
		editedHours = null,
		projectTitle = null,
		projectDescription = null,
		screenshotUrl = null,
		onReviewComplete,
	}: Props = $props();

	let activeForm: 'approve' | 'changes' | null = $state(null);
	let showProjectCard = $state(false);
	let submitting = $state(false);

	// Approval form fields
	let hoursJustification = $state('');
	let approveComment = $state('');
	let approvedHours = $state(hackatimeHours ?? 0);
	let reviewerManuallyEditedHours = $state(false);
	let sendEmail = $state(false);

	// Changes needed form fields
	let changesComment = $state('');
	let rejectSendEmail = $state(false);

	// Reset fields when submission changes
	$effect(() => {
		submissionId; // track
		activeForm = null;
		showProjectCard = false;
		hoursJustification = '';
		approveComment = '';
		approvedHours = hackatimeHours ?? 0;
		reviewerManuallyEditedHours = false;
		sendEmail = false;
		changesComment = '';
		rejectSendEmail = false;
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
</script>

<div class="action-bar">
	<div class="action-bar-buttons">
		<button class="btn btn-approve" onclick={() => showForm('approve')}>Approve</button>
		<button class="btn btn-changes" onclick={() => showForm('changes')}>Changes Needed</button>
		<button
			class="btn btn-card"
			class:btn-card-active={showProjectCard}
			onclick={() => { showProjectCard = !showProjectCard; }}
		>
			Project Card
		</button>
	</div>

	{#if showProjectCard}
		<div class="project-card">
			{#if screenshotUrl}
				<img
					class="project-card-thumb"
					src={screenshotUrl}
					alt="{projectTitle ?? 'Project'} screenshot"
				/>
			{:else}
				<div class="project-card-thumb project-card-thumb-empty">No screenshot</div>
			{/if}
			<div class="project-card-body">
				<h4 class="project-card-title">{projectTitle ?? 'Untitled Project'}</h4>
				<p class="project-card-desc">
					{projectDescription ?? 'No description provided.'}
				</p>
			</div>
		</div>
	{/if}

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
					<span class="hint">(internal — synced to Airtable)</span>
				</label>
				<textarea
					id="justify"
					bind:value={hoursJustification}
					maxlength={500}
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
					maxlength={500}
					placeholder="Nice work! Any feedback you want to share..."
				></textarea>
			</div>
			<div class="form-row">
				<label class="checkbox-label">
					<input type="checkbox" bind:checked={sendEmail} />
					Send email notification to user
				</label>
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
					maxlength={500}
					placeholder="Describe what the user needs to fix or improve..."
				></textarea>
			</div>
			<div class="form-row">
				<label class="checkbox-label">
					<input type="checkbox" bind:checked={rejectSendEmail} />
					Send email notification to user
				</label>
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

	.form-row {
		margin-bottom: 12px;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--text-dim);
		cursor: pointer;
	}

	.checkbox-label input[type='checkbox'] {
		accent-color: var(--accent);
	}

	/* Project Card button */
	.btn-card {
		background: transparent;
		color: var(--text-dim);
		border-color: var(--border);
		margin-left: auto;
	}

	.btn-card:hover,
	.btn-card-active {
		color: var(--accent);
		border-color: var(--accent);
	}

	/* Project Card preview */
	.project-card {
		margin-top: 12px;
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
		background: var(--bg);
	}

	.project-card-thumb {
		width: 100%;
		max-height: 200px;
		object-fit: cover;
		display: block;
		border-bottom: 1px solid var(--border);
	}

	.project-card-thumb-empty {
		height: 100px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-dim);
		font-size: 12px;
		background: var(--surface2);
	}

	.project-card-body {
		padding: 12px;
	}

	.project-card-title {
		font-size: 15px;
		font-weight: 700;
		margin: 0 0 6px;
		font-family: 'Space Mono', monospace;
	}

	.project-card-desc {
		font-size: 13px;
		color: var(--text-dim);
		margin: 0;
		line-height: 1.5;
		white-space: pre-wrap;
	}
</style>
