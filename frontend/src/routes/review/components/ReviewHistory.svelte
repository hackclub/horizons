<script lang="ts">
	import type { TimelineEntry } from '../api';
	import { timeAgo, formatDate } from '../utils';

	interface Props {
		timeline: TimelineEntry[];
	}

	let { timeline }: Props = $props();
</script>

<div class="section">
	<div class="section-title">Review History</div>

	{#if timeline.length === 0}
		<p class="empty-state">No review history yet.</p>
	{/if}

	{#each timeline as event, index}
		{#if index > 0}
			<hr class="inner-divider" />
		{/if}

		{#if event.type === 'submitted' || event.type === 'resubmitted'}
			<div class="timeline-event">
				<span
					class="timeline-dot"
					class:submit={event.type === 'submitted'}
					class:resubmit={event.type === 'resubmitted'}
				></span>
				<span class="timeline-text">
					{event.type === 'submitted' ? 'Submitted' : 'Re-submitted'} with
					<strong>{event.hours ?? '?'}h</strong>
					<span class="ago" title={formatDate(event.timestamp)}>{timeAgo(event.timestamp)}</span>
				</span>
			</div>
		{:else if event.type === 'approved'}
			<div class="feedback-item">
				<span class="fb-badge approved">✓ Approved</span>
				{#if event.approvedHours != null && event.submittedHours != null && event.approvedHours !== event.submittedHours}
					<span class="fb-badge override">
						{event.submittedHours}h → {event.approvedHours}h override
					</span>
				{/if}
				{#if event.userFeedback}
					<div class="fb-text">{event.userFeedback}</div>
				{/if}
				<div class="fb-meta">
					reviewed by @{event.reviewerName} ·
					<span class="ago" title={formatDate(event.timestamp)}>{timeAgo(event.timestamp)}</span>
				</div>

				{#if event.hoursJustification}
					<div class="justification-block">
						<div class="jb-label">Hours Justification</div>
						<div class="jb-text">{event.hoursJustification}</div>
					</div>
				{/if}
			</div>
		{:else if event.type === 'rejected'}
			<div class="feedback-item">
				<span class="fb-badge changes">↻ Changes Needed</span>
				{#if event.userFeedback}
					<div class="fb-text">{event.userFeedback}</div>
				{/if}
				<div class="fb-meta">
					reviewed by @{event.reviewerName} ·
					<span class="ago" title={formatDate(event.timestamp)}>{timeAgo(event.timestamp)}</span>
				</div>
			</div>
		{/if}
	{/each}
</div>

<style>
	.section {
		padding: 14px 16px;
	}

	.section-title {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.8px;
		color: var(--text-dim);
		font-weight: 600;
		margin-bottom: 10px;
	}

	.empty-state {
		font-size: 13px;
		color: var(--text-dim);
		font-style: italic;
	}

	.inner-divider {
		border: none;
		border-top: 1px solid var(--divider);
		margin: 6px 0;
	}

	.timeline-event {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 6px 0;
		font-size: 12px;
		color: var(--text-dim);
	}

	.timeline-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		margin-top: 5px;
		flex-shrink: 0;
	}

	.timeline-dot.submit {
		background: var(--blue);
	}

	.timeline-dot.resubmit {
		background: var(--accent);
	}

	.timeline-text strong {
		color: var(--text);
		font-weight: 600;
	}

	.ago {
		border-bottom: 1px dotted var(--text-dim);
		cursor: default;
	}

	.feedback-item {
		padding: 0 0 10px;
	}

	.feedback-item:last-child {
		padding-bottom: 0;
	}

	.fb-badge {
		display: inline-block;
		font-size: 10px;
		font-weight: 700;
		padding: 2px 7px;
		border-radius: 4px;
		margin-bottom: 4px;
	}

	.fb-badge.approved {
		background: var(--green-bg);
		color: var(--green);
	}

	.fb-badge.changes {
		background: var(--red-bg);
		color: var(--red);
	}

	.fb-badge.override {
		background: rgba(255, 152, 0, 0.15);
		color: #ff9800;
		font-weight: 700;
	}

	.fb-text {
		font-size: 13px;
		line-height: 1.5;
		margin-top: 4px;
	}

	.fb-meta {
		font-size: 11px;
		color: var(--text-dim);
		margin-top: 4px;
	}

	.justification-block {
		background: rgba(128, 128, 0, 0.08);
		border-left: 3px solid var(--accent);
		border-radius: 0 6px 6px 0;
		padding: 10px 12px;
		margin-top: 6px;
	}

	.jb-label {
		font-size: 10px;
		font-weight: 700;
		color: var(--accent);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 4px;
	}

	.jb-text {
		font-size: 12px;
		line-height: 1.6;
		color: var(--text);
	}
</style>
