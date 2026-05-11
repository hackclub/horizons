import { Injectable } from '@nestjs/common';
import {
  APIError,
  LoopsClient,
  RateLimitExceededError,
  TransactionalAttachment,
  TransactionalVariables,
} from 'loops';

export type LoopsAttachment = TransactionalAttachment;

export interface SendTransactionalParams {
  email: string;
  transactionalId: string;
  dataVariables?: TransactionalVariables;
  addToAudience?: boolean;
  attachments?: LoopsAttachment[];
  idempotencyKey?: string;
}

export interface SendTransactionalResult {
  success: boolean;
  message?: string;
  status: number;
}

@Injectable()
export class LoopsService {
  private readonly client: LoopsClient | null;
  private readonly tidSubmissionApproved: string;
  private readonly tidSubmissionDenied: string;

  constructor() {
    const apiKey = process.env.LOOPS_API_KEY || '';
    this.tidSubmissionApproved =
      process.env.LOOPS_TID_SUBMISSION_APPROVED || '';
    this.tidSubmissionDenied = process.env.LOOPS_TID_SUBMISSION_DENIED || '';

    if (!apiKey) {
      console.warn(
        'LOOPS_API_KEY not configured - transactional emails will be skipped',
      );
      this.client = null;
    } else {
      this.client = new LoopsClient(apiKey);
    }
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  /**
   * Send a transactional email via the official Loops SDK.
   * https://loops.so/docs/sdks/javascript
   *
   * Returns a result instead of throwing so callers can decide whether a failed
   * email should bubble up. 409 (idempotency-key reuse within 24h) is treated
   * as success since the same email was already delivered.
   */
  async sendTransactional(
    params: SendTransactionalParams,
  ): Promise<SendTransactionalResult> {
    if (!this.client) {
      console.log(
        `[Loops DISABLED] would send transactional ${params.transactionalId} to ${params.email}`,
        {
          dataVariables: params.dataVariables,
          addToAudience: params.addToAudience,
          attachments: params.attachments?.length ?? 0,
          idempotencyKey: params.idempotencyKey,
        },
      );
      return {
        success: true,
        status: 0,
        message: 'logged (LOOPS_API_KEY not set)',
      };
    }

    const headers: Record<string, string> | undefined = params.idempotencyKey
      ? { 'Idempotency-Key': params.idempotencyKey }
      : undefined;

    try {
      await this.client.sendTransactionalEmail({
        transactionalId: params.transactionalId,
        email: params.email,
        dataVariables: params.dataVariables,
        addToAudience: params.addToAudience,
        attachments: params.attachments,
        headers,
      });
      return { success: true, status: 200 };
    } catch (error) {
      if (error instanceof APIError) {
        // 409 = duplicate idempotency key within 24h. The original send went
        // through, so the caller's intent is satisfied.
        if (error.statusCode === 409) {
          return {
            success: true,
            status: 409,
            message: 'duplicate idempotency',
          };
        }
        const message =
          (error.json && 'message' in error.json
            ? error.json.message
            : undefined) ?? error.message;
        return { success: false, status: error.statusCode, message };
      }
      if (error instanceof RateLimitExceededError) {
        return { success: false, status: 429, message: error.message };
      }
      return {
        success: false,
        status: 0,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Submission reviewed — approval or denial notification.
   *
   * Templates are configured in Loops; their IDs come from
   * LOOPS_TID_SUBMISSION_APPROVED / LOOPS_TID_SUBMISSION_DENIED. Data variables
   * expected by the templates: projectTitle, projectId, projectUrl,
   * approvedHours (approved only), feedback (optional).
   */
  async sendSubmissionReviewEmail(
    email: string,
    data: {
      projectTitle: string;
      projectId: number;
      approved: boolean;
      approvedHours?: number;
      feedback?: string | null;
    },
    options?: { idempotencyKey?: string },
  ): Promise<SendTransactionalResult> {
    const transactionalId = data.approved
      ? this.tidSubmissionApproved
      : this.tidSubmissionDenied;

    // In dev (no API key) sendTransactional handles the log fallback below;
    // missing template ids only matter when we'd actually call Loops.
    if (this.isEnabled() && !transactionalId) {
      return {
        success: false,
        status: 0,
        message: `Loops template id missing (${
          data.approved
            ? 'LOOPS_TID_SUBMISSION_APPROVED'
            : 'LOOPS_TID_SUBMISSION_DENIED'
        })`,
      };
    }

    const frontendUrl =
      process.env.FRONTEND_URL || 'https://midnight.hackclub.com';
    const projectUrl = `${frontendUrl}/app/projects/${data.projectId}`;

    const dataVariables: TransactionalVariables = {
      projectTitle: data.projectTitle,
      projectId: data.projectId,
      projectUrl,
      feedback: data.feedback ?? '',
    };
    if (data.approved && data.approvedHours !== undefined) {
      dataVariables.approvedHours = data.approvedHours;
    }

    return this.sendTransactional({
      email,
      transactionalId,
      dataVariables,
      idempotencyKey: options?.idempotencyKey,
    });
  }
}
