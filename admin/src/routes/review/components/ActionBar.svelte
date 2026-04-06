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

<div class="bg-rv-surface border-t border-rv-border px-5 py-3 shrink-0">
	<div class="flex gap-2.5 items-center">
		<button
			class="px-6 py-2.5 rounded-lg text-sm font-semibold font-inherit cursor-pointer border-2 border-transparent transition-all duration-150 bg-rv-green text-white hover:bg-[#66bb6a]"
			onclick={() => showForm('approve')}
		>
			Approve
		</button>
		<button
			class="px-6 py-2.5 rounded-lg text-sm font-semibold font-inherit cursor-pointer border-2 transition-all duration-150 bg-rv-red-bg text-rv-red border-rv-red hover:bg-[rgba(239,83,80,0.2)]"
			onclick={() => showForm('changes')}
		>
			Changes Needed
		</button>
		<button
			class="px-6 py-2.5 rounded-lg text-sm font-semibold font-inherit cursor-pointer border-2 transition-all duration-150 bg-transparent text-rv-dim border-rv-border ml-auto hover:text-rv-accent hover:border-rv-accent {showProjectCard ? 'text-rv-accent border-rv-accent' : ''}"
			onclick={() => { showProjectCard = !showProjectCard; }}
		>
			Project Card
		</button>
	</div>

	{#if showProjectCard}
		<div class="mt-3 border border-rv-border rounded-lg overflow-hidden bg-rv-bg">
			{#if screenshotUrl}
				<img
					class="w-full max-h-[200px] object-cover block border-b border-rv-border"
					src={screenshotUrl}
					alt="{projectTitle ?? 'Project'} screenshot"
				/>
			{:else}
				<div class="w-full h-[100px] flex items-center justify-center text-rv-dim text-xs bg-rv-surface2 border-b border-rv-border">No screenshot</div>
			{/if}
			<div class="p-3">
				<h4 class="text-[15px] font-bold m-0 mb-1.5 font-[Space_Mono,monospace]">{projectTitle ?? 'Untitled Project'}</h4>
				<p class="text-[13px] text-rv-dim m-0 leading-relaxed whitespace-pre-wrap">
					{projectDescription ?? 'No description provided.'}
				</p>
			</div>
		</div>
	{/if}

	{#if activeForm === 'approve'}
		<div class="mt-3 pt-3 border-t border-rv-border">
			<h3 class="text-sm font-bold mb-3 flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-rv-green"></span> Approve Project</h3>
			<div class="mb-3">
				<label for="approved-hours" class="block text-xs font-semibold text-rv-dim mb-1">
					Approved Hours
					<span class="font-normal opacity-70 italic">(defaults to Hackatime hours)</span>
				</label>
				<input
					id="approved-hours"
					type="number"
					step="0.5"
					min="0"
					bind:value={approvedHours}
					oninput={() => { reviewerManuallyEditedHours = true; }}
					class="w-[100px] bg-rv-bg border border-rv-border rounded-md p-2.5 text-rv-text font-[Space_Mono,monospace] text-[13px] font-semibold resize-vertical focus:outline-none focus:border-rv-accent"
				/>
			</div>
			<div class="mb-3">
				<label for="justify" class="block text-xs font-semibold text-rv-text mb-1">
					Ship Justification
					<span class="font-normal opacity-70 italic">(internal — synced to Airtable)</span>
				</label>
				<textarea
					id="justify"
					bind:value={hoursJustification}
					maxlength={500}
					placeholder="Why are you approving this? e.g. hours look right, project is complete, shipped publicly..."
					class="w-full bg-rv-bg border border-rv-border rounded-md p-2.5 text-rv-text font-inherit text-[13px] resize-vertical min-h-[60px] focus:outline-none focus:border-rv-accent"
				></textarea>
			</div>
			<div class="mb-3">
				<label for="approve-comment" class="block text-xs font-semibold text-rv-dim mb-1">
					Comment for User
					<span class="font-normal opacity-70 italic">(optional — shown to user)</span>
				</label>
				<textarea
					id="approve-comment"
					bind:value={approveComment}
					maxlength={500}
					placeholder="Nice work! Any feedback you want to share..."
					class="w-full bg-rv-bg border border-rv-border rounded-md p-2.5 text-rv-text font-inherit text-[13px] resize-vertical min-h-[60px] focus:outline-none focus:border-rv-accent"
				></textarea>
			</div>
			<div class="mb-3">
				<label class="flex items-center gap-1.5 text-xs text-rv-dim cursor-pointer">
					<input type="checkbox" bind:checked={sendEmail} class="accent-rv-accent" />
					Send email notification to user
				</label>
			</div>
			<div class="flex gap-2 justify-end">
				<button class="px-[18px] py-[7px] rounded-md text-[13px] font-semibold font-inherit cursor-pointer border border-rv-border transition-all duration-150 bg-transparent text-rv-dim hover:text-rv-text disabled:opacity-50 disabled:cursor-not-allowed" onclick={hideForm}>Cancel</button>
				<button class="px-[18px] py-[7px] rounded-md text-[13px] font-semibold font-inherit cursor-pointer border transition-all duration-150 bg-rv-green text-white border-rv-green disabled:opacity-50 disabled:cursor-not-allowed" onclick={submitApproval} disabled={submitting}>
					{submitting ? 'Submitting...' : 'Submit Approval'}
				</button>
			</div>
		</div>
	{/if}

	{#if activeForm === 'changes'}
		<div class="mt-3 pt-3 border-t border-rv-border">
			<h3 class="text-sm font-bold mb-3 flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-rv-red"></span> Request Changes</h3>
			<div class="mb-3">
				<label for="changes-comment" class="block text-xs font-semibold text-rv-dim mb-1">
					What needs to change?
					<span class="font-normal opacity-70 italic">(shown to user)</span>
				</label>
				<textarea
					id="changes-comment"
					bind:value={changesComment}
					maxlength={500}
					placeholder="Describe what the user needs to fix or improve..."
					class="w-full bg-rv-bg border border-rv-border rounded-md p-2.5 text-rv-text font-inherit text-[13px] resize-vertical min-h-[60px] focus:outline-none focus:border-rv-accent"
				></textarea>
			</div>
			<div class="mb-3">
				<label class="flex items-center gap-1.5 text-xs text-rv-dim cursor-pointer">
					<input type="checkbox" bind:checked={rejectSendEmail} class="accent-rv-accent" />
					Send email notification to user
				</label>
			</div>
			<div class="flex gap-2 justify-end">
				<button class="px-[18px] py-[7px] rounded-md text-[13px] font-semibold font-inherit cursor-pointer border border-rv-border transition-all duration-150 bg-transparent text-rv-dim hover:text-rv-text disabled:opacity-50 disabled:cursor-not-allowed" onclick={hideForm}>Cancel</button>
				<button
					class="px-[18px] py-[7px] rounded-md text-[13px] font-semibold font-inherit cursor-pointer border transition-all duration-150 bg-rv-red text-white border-rv-red disabled:opacity-50 disabled:cursor-not-allowed"
					onclick={submitChangesNeeded}
					disabled={submitting}
				>
					{submitting ? 'Submitting...' : 'Submit'}
				</button>
			</div>
		</div>
	{/if}
</div>
