import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  BadGatewayException,
} from '@nestjs/common';

interface SlackHuddle {
  channel_id: string;
  call_id: string;
  active_members: string[];
  dropped_members: string[];
  background_id?: string;
  thread_root_ts?: string;
  created_by?: string;
  start_date?: number;
  expiration?: number;
  locale?: string;
}

interface SlackHuddlesInfoResponse {
  ok?: boolean;
  error?: string;
  huddles?: SlackHuddle[];
}

@Injectable()
export class HuddlesService {
  private readonly logger = new Logger(HuddlesService.name);
  private readonly clientToken = process.env.SLACK_CLIENT_TOKEN || '';
  private readonly teamId = process.env.SLACK_TEAM_ID || 'T0266FRGM';
  private readonly edgeHeaders = this.parseHeaders(
    process.env.SLACK_EDGE_HEADERS || '',
  );

  constructor() {
    if (!this.clientToken) {
      this.logger.warn(
        'SLACK_CLIENT_TOKEN not set — huddle status endpoint will 503',
      );
    }
    if (!this.edgeHeaders) {
      this.logger.warn(
        'SLACK_EDGE_HEADERS not set — Slack edge API likely to reject requests',
      );
    }
  }

  private parseHeaders(raw: string): Record<string, string> | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, string>;
      }
      return null;
    } catch (err) {
      this.logger.error('Failed to parse SLACK_EDGE_HEADERS as JSON', err);
      return null;
    }
  }

  /**
   * Hit Slack's undocumented edge cache API to fetch huddle state for a set
   * of channels. The public Web API does not expose live huddle membership;
   * the edge API requires a client token (xoxc) plus cookie auth headers.
   * Pattern lifted from techpixel/barista (src/slack/huddleInfo.ts).
   */
  async fetchHuddles(channelIds: string[]): Promise<SlackHuddle[]> {
    if (!this.clientToken) {
      throw new ServiceUnavailableException(
        'Slack client token not configured (SLACK_CLIENT_TOKEN)',
      );
    }

    const url = `https://edgeapi.slack.com/cache/${this.teamId}/huddles/info?_x_app_name=client&fp=f5&_x_num_retries=0`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.edgeHeaders ?? {}),
        },
        body: JSON.stringify({
          token: this.clientToken,
          channel_ids: channelIds,
        }),
        redirect: 'follow',
      });
    } catch (err) {
      this.logger.error('Slack edge API request failed', err);
      throw new BadGatewayException('Failed to reach Slack edge API');
    }

    let data: SlackHuddlesInfoResponse;
    try {
      data = (await response.json()) as SlackHuddlesInfoResponse;
    } catch (err) {
      this.logger.error('Slack edge API returned non-JSON response', err);
      throw new BadGatewayException('Invalid response from Slack edge API');
    }

    if (data.error) {
      this.logger.error(`Slack edge API error: ${data.error}`);
      throw new BadGatewayException(`Slack edge API error: ${data.error}`);
    }

    return data.huddles ?? [];
  }

  async getHuddleStatus(channelId: string) {
    const huddles = await this.fetchHuddles([channelId]);
    const huddle = huddles.find((h) => h.channel_id === channelId);

    if (!huddle || huddle.active_members.length === 0) {
      return {
        channelId,
        active: false,
        callId: huddle?.call_id ?? null,
        createdBy: null,
        startedAt: null,
        threadRootTs: null,
        activeMembers: [],
        droppedMembers: huddle?.dropped_members ?? [],
        memberCount: 0,
      };
    }

    return {
      channelId: huddle.channel_id,
      active: true,
      callId: huddle.call_id,
      createdBy: huddle.created_by ?? null,
      startedAt: huddle.start_date ?? null,
      threadRootTs: huddle.thread_root_ts ?? null,
      activeMembers: huddle.active_members,
      droppedMembers: huddle.dropped_members ?? [],
      memberCount: huddle.active_members.length,
    };
  }
}
