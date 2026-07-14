export const AUDIT_ACTIONS = {
  review: 'review',
  update: 'update',
  finalize: 'finalize',
  fraudEnqueued: 'fraud_enqueued',
  fraudEnqueueFailed: 'fraud_enqueue_failed',
  fraudReused: 'fraud_reused',
  fraudResolved: 'fraud_resolved',
  fraudRequeued: 'fraud_requeued',
  noteUpdate: 'note_update',
  // Reviewer escalated the submission to the admin queue (changes.note holds
  // the required explanation) / admin sent it back to the reviewer queue.
  sendToAdmin: 'send_to_admin',
  returnToQueue: 'return_to_queue',
  permReject: 'perm_reject',
  permRejectCleared: 'perm_reject_cleared',
  // Superadmin-only out-of-band status flip on an already-finalized submission
  // (approved↔rejected). Bypasses the two-gate state machine entirely.
  superadminOverride: 'superadmin_override',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const SYSTEM_ACTOR_ID = 0;
