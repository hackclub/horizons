import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { PostHog } from 'posthog-node';

interface CapturePayload {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
}

const DEFAULT_POSTHOG_KEY = 'phc_B5T0FJzZYK5qPDXnoss4hKtXh8ZyIsHMVlC2ATS2s0y';
const DEFAULT_POSTHOG_HOST = 'https://at.leafd.dev';

@Injectable()
export class PosthogService implements OnModuleDestroy {
  private client: PostHog | null;
  private readonly logger = new Logger(PosthogService.name);

  constructor() {
    const apiKey = process.env.POSTHOG_API_KEY || DEFAULT_POSTHOG_KEY;
    const apiHost = process.env.POSTHOG_API_HOST || DEFAULT_POSTHOG_HOST;
    this.client = apiKey ? new PostHog(apiKey, { host: apiHost }) : null;
    if (this.client) {
      this.logger.log(`PostHog client initialized for ${apiHost}`);
    } else {
      this.logger.warn('PostHog client not initialized');
    }
  }

  capture(payload: CapturePayload) {
    if (!this.client) {
      this.logger.warn('PostHog client missing, capture skipped');
      return;
    }

    this.client.capture({
      distinctId: payload.distinctId,
      event: payload.event,
      properties: payload.properties,
    });
    this.logger.debug(`PostHog capture ${payload.event}`);
  }

  async onModuleDestroy() {
    if (!this.client) {
      return;
    }

    await this.client.shutdown();
    this.logger.log('PostHog client shutdown');
  }
}
