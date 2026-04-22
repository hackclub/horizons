import {
  BadRequestException,
  Controller,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { Public } from '../auth/public.decorator';
import {
  REMOVE_ACTION_ID,
  SlackChannelsService,
} from './slack-channels.service';

interface SlackBlockAction {
  action_id?: string;
}

interface SlackInteractivityPayload {
  type?: string;
  user?: { id?: string };
  actions?: SlackBlockAction[];
  response_url?: string;
}

@Controller('api/slack/interactivity')
@Public()
export class SlackInteractivityController {
  constructor(private channels: SlackChannelsService) {}

  @Post()
  async handle(@Req() req: RawBodyRequest<Request>) {
    this.verifySignature(req);

    const body = req.body as Record<string, string> | undefined;
    const raw = body?.payload;
    if (!raw) {
      throw new BadRequestException('Missing payload');
    }

    let payload: SlackInteractivityPayload;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new BadRequestException('Invalid payload JSON');
    }

    if (payload.type !== 'block_actions') {
      return { ok: true };
    }

    const action = payload.actions?.[0];
    const slackUserId = payload.user?.id;

    if (!action || !slackUserId) {
      return { ok: true };
    }

    if (action.action_id === REMOVE_ACTION_ID) {
      const result = await this.channels.removeUserFromAllChannels(slackUserId);

      // Leave the original DM intact in every case. Show a small ephemeral
      // ack for each outcome.
      const followUp =
        result.errors > 0 && result.removed === 0
          ? "couldn't leave the channels — try again later."
          : result.removed === 0
            ? 'already left!'
            : 'removed ya!';

      if (payload.response_url) {
        await fetch(payload.response_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            response_type: 'ephemeral',
            replace_original: false,
            text: followUp,
          }),
        });
      }

      return { ok: true };
    }

    return { ok: true };
  }

  private verifySignature(req: RawBodyRequest<Request>) {
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (!signingSecret) {
      throw new UnauthorizedException('Slack signing secret not configured');
    }

    const timestamp = req.header('x-slack-request-timestamp');
    const signature = req.header('x-slack-signature');
    const rawBody = req.rawBody?.toString('utf8');

    if (!timestamp || !signature || !rawBody) {
      throw new UnauthorizedException('Missing Slack signature headers');
    }

    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 60 * 5) {
      throw new UnauthorizedException('Slack request timestamp out of range');
    }

    const base = `v0:${timestamp}:${rawBody}`;
    const expected =
      'v0=' + createHmac('sha256', signingSecret).update(base).digest('hex');

    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid Slack signature');
    }
  }
}
