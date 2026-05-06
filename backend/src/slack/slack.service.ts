import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

interface SlackMessageBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  elements?: any[];
  style?: string;
  indent?: number;
  border?: number;
}

@Injectable()
export class SlackService {
  private botToken: string;

  constructor(private prisma: PrismaService) {
    this.botToken = process.env.SLACK_BOT_TOKEN || '';

    if (!this.botToken) {
      console.warn(
        'SLACK_BOT_TOKEN not configured - Slack notifications disabled',
      );
    }
  }

  async getSlackUserEmail(slackUserId: string): Promise<string | null> {
    if (!this.botToken) {
      return null;
    }

    try {
      const response = await fetch(
        `https://slack.com/api/users.info?user=${slackUserId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.botToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const data = await response.json();

      if (!data.ok) {
        console.error('Failed to fetch Slack user info:', data.error);
        return null;
      }

      return data.user?.profile?.email || null;
    } catch (error) {
      console.error('Error fetching Slack user email:', error);
      return null;
    }
  }

  async lookupSlackUserByEmail(
    email: string,
  ): Promise<{ slackUserId: string; displayName: string } | null> {
    if (!this.botToken) {
      return null;
    }

    try {
      const response = await fetch(
        `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.botToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const data = await response.json();

      if (!data.ok) {
        if (data.error === 'users_not_found') {
          return null;
        }
        console.error('Failed to lookup Slack user by email:', data.error);
        return null;
      }

      return {
        slackUserId: data.user?.id,
        displayName:
          data.user?.profile?.display_name ||
          data.user?.profile?.real_name ||
          data.user?.name ||
          'Unknown',
      };
    } catch (error) {
      console.error('Error looking up Slack user by email:', error);
      return null;
    }
  }

  async getSlackUserInfo(
    slackUserId: string,
  ): Promise<{
    displayName: string;
    email: string | null;
    tz: string | null;
    tzLabel: string | null;
  } | null> {
    if (!this.botToken || !slackUserId) {
      return null;
    }

    try {
      const response = await fetch(
        `https://slack.com/api/users.info?user=${slackUserId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.botToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const data = await response.json();

      if (!data.ok) {
        console.error('Failed to fetch Slack user info:', data.error);
        return null;
      }

      return {
        displayName:
          data.user?.profile?.display_name ||
          data.user?.profile?.real_name ||
          data.user?.name ||
          'Unknown',
        email: data.user?.profile?.email || null,
        tz: typeof data.user?.tz === 'string' ? data.user.tz : null,
        tzLabel: typeof data.user?.tz_label === 'string' ? data.user.tz_label : null,
      };
    } catch (error) {
      console.error('Error fetching Slack user info:', error);
      return null;
    }
  }

  async getSlackUserTimezone(slackUserId: string): Promise<string | null> {
    const info = await this.getSlackUserInfo(slackUserId);
    return info?.tz ?? null;
  }

  private async fetchUsernameFromSlack(
    slackUserId: string,
  ): Promise<string | null> {
    if (!this.botToken) return null;

    try {
      const response = await fetch(
        `https://slack.com/api/users.info?user=${slackUserId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.botToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const data = await response.json();

      if (!data.ok) {
        console.error('Failed to fetch Slack username:', data.error);
        return null;
      }

      return data.user?.name ?? null;
    } catch (error) {
      console.error('Error fetching Slack username:', error);
      return null;
    }
  }

  async getUsername(slackUserId: string): Promise<string | null> {
    if (!slackUserId) return null;

    const cached = await this.prisma.user.findUnique({
      where: { slackUserId },
      select: { slackUsername: true },
    });

    if (cached?.slackUsername) return cached.slackUsername;

    const name = await this.fetchUsernameFromSlack(slackUserId);
    if (!name) return null;

    if (cached) {
      await this.prisma.user
        .update({
          where: { slackUserId },
          data: { slackUsername: name },
        })
        .catch((err) => {
          console.error('Failed to cache Slack username:', err);
        });
    }

    return name;
  }

  async getUsernames(slackUserIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (slackUserIds.length === 0) return map;

    const cachedUsers = await this.prisma.user.findMany({
      where: { slackUserId: { in: slackUserIds } },
      select: { slackUserId: true, slackUsername: true },
    });

    const inDb = new Set<string>();
    for (const u of cachedUsers) {
      if (!u.slackUserId) continue;
      inDb.add(u.slackUserId);
      if (u.slackUsername) map.set(u.slackUserId, u.slackUsername);
    }

    const missing = slackUserIds.filter((id) => !map.has(id));
    if (missing.length === 0) return map;

    const fetched = await Promise.allSettled(
      missing.map(async (id) => ({
        id,
        name: await this.fetchUsernameFromSlack(id),
      })),
    );

    const updates: Array<{ id: string; name: string }> = [];
    for (const result of fetched) {
      if (result.status !== 'fulfilled' || !result.value.name) continue;
      map.set(result.value.id, result.value.name);
      if (inDb.has(result.value.id)) {
        updates.push({ id: result.value.id, name: result.value.name });
      }
    }

    if (updates.length > 0) {
      await Promise.allSettled(
        updates.map((u) =>
          this.prisma.user.update({
            where: { slackUserId: u.id },
            data: { slackUsername: u.name },
          }),
        ),
      ).catch((err) => {
        console.error('Failed to cache Slack usernames:', err);
      });
    }

    return map;
  }

  async getUserChannels(slackUserId: string): Promise<Set<string>> {
    const result = new Set<string>();
    if (!this.botToken) return result;

    let cursor: string | undefined;
    try {
      do {
        const params = new URLSearchParams({
          user: slackUserId,
          types: 'public_channel,private_channel',
          limit: '200',
          exclude_archived: 'true',
        });
        if (cursor) params.set('cursor', cursor);

        const response = await fetch(
          `https://slack.com/api/users.conversations?${params.toString()}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${this.botToken}`,
              'Content-Type': 'application/json',
            },
          },
        );

        const data = await response.json();
        if (!data.ok) {
          console.error(
            `Failed to fetch user.conversations for ${slackUserId}:`,
            data.error,
          );
          return result;
        }

        for (const ch of data.channels ?? []) {
          if (ch?.id) result.add(ch.id);
        }
        cursor = data.response_metadata?.next_cursor || undefined;
      } while (cursor);
    } catch (error) {
      console.error('Error fetching user channels:', error);
    }
    return result;
  }

  async inviteUserToChannel(
    slackUserId: string,
    channelId: string,
  ): Promise<{
    success: boolean;
    alreadyInChannel: boolean;
    error?: string;
  }> {
    if (!this.botToken) {
      return {
        success: false,
        alreadyInChannel: false,
        error: 'Slack not configured',
      };
    }

    try {
      const response = await fetch('https://slack.com/api/conversations.invite', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channel: channelId, users: slackUserId }),
      });

      const data = await response.json();

      if (data.ok) {
        return { success: true, alreadyInChannel: false };
      }

      if (data.error === 'already_in_channel') {
        return { success: true, alreadyInChannel: true };
      }

      const errorsArr: Array<{ user?: string; error?: string }> = data.errors;
      if (Array.isArray(errorsArr)) {
        const perUser = errorsArr.find((e) => e.user === slackUserId);
        if (perUser?.error === 'already_in_channel') {
          return { success: true, alreadyInChannel: true };
        }
      }

      return {
        success: false,
        alreadyInChannel: false,
        error: data.error || 'unknown_error',
      };
    } catch (error) {
      return {
        success: false,
        alreadyInChannel: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async removeUserFromChannel(
    slackUserId: string,
    channelId: string,
  ): Promise<{ success: boolean; notInChannel: boolean; error?: string }> {
    // Prefer a user token (xoxp-) for kicks so that workspace "who can remove
    // members from channels" restrictions apply to the authorizing admin, not
    // the bot. Fall back to the bot token if no user token is configured.
    const kickToken = process.env.SLACK_USER_TOKEN || this.botToken;
    if (!kickToken) {
      return {
        success: false,
        notInChannel: false,
        error: 'Slack not configured',
      };
    }

    try {
      const response = await fetch('https://slack.com/api/conversations.kick', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${kickToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channel: channelId, user: slackUserId }),
      });

      const data = await response.json();

      if (data.ok) {
        return { success: true, notInChannel: false };
      }

      if (data.error === 'not_in_channel' || data.error === 'user_not_in_channel') {
        return { success: true, notInChannel: true };
      }

      return {
        success: false,
        notInChannel: false,
        error: data.error || 'unknown_error',
      };
    } catch (error) {
      return {
        success: false,
        notInChannel: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async sendDirectMessage(
    slackUserId: string,
    message: string,
    blocks?: SlackMessageBlock[],
  ): Promise<{ success: boolean; error?: string }> {
    return this.sendDmWithToken(this.botToken, slackUserId, message, blocks);
  }

  async sendDirectMessageAsUser(
    slackUserId: string,
    message: string,
    blocks?: SlackMessageBlock[],
  ): Promise<{ success: boolean; error?: string }> {
    const userToken = process.env.SLACK_USER_TOKEN;
    if (!userToken) {
      console.warn(
        'SLACK_USER_TOKEN not set — falling back to bot token for DM',
      );
      return this.sendDirectMessage(slackUserId, message, blocks);
    }
    return this.sendDmWithToken(userToken, slackUserId, message, blocks);
  }

  private async sendDmWithToken(
    token: string,
    slackUserId: string,
    message: string,
    blocks?: SlackMessageBlock[],
  ): Promise<{ success: boolean; error?: string }> {
    if (!token) {
      console.log('Slack not configured, skipping DM');
      return { success: false, error: 'Slack not configured' };
    }

    try {
      const openResponse = await fetch(
        'https://slack.com/api/conversations.open',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ users: slackUserId }),
        },
      );

      const openData = await openResponse.json();

      if (!openData.ok) {
        console.error('Failed to open DM channel:', openData.error);
        return { success: false, error: openData.error };
      }

      const channelId = openData.channel.id;

      const messagePayload: any = {
        channel: channelId,
        text: message,
      };

      if (blocks) {
        messagePayload.blocks = blocks;
      }

      const messageResponse = await fetch(
        'https://slack.com/api/chat.postMessage',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(messagePayload),
        },
      );

      const messageData = await messageResponse.json();

      if (!messageData.ok) {
        console.error('Failed to send Slack message:', messageData.error);
        return { success: false, error: messageData.error };
      }

      return { success: true };
    } catch (error) {
      console.error('Error sending Slack DM:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async notifySubmissionReview(
    email: string,
    data: {
      projectTitle: string;
      projectId: number;
      approved: boolean;
      approvedHours?: number;
      feedback?: string;
    },
  ): Promise<{ success: boolean; error?: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { slackUserId: true, firstName: true },
    });

    if (!user?.slackUserId) {
      return { success: false, error: 'User has no linked Slack account' };
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://horizons.hackclub.com';
    const baseUrl = /^https?:\/\//.test(frontendUrl)
      ? frontendUrl
      : `https://${frontendUrl}`;
    const projectUrl = `${baseUrl}/app/projects/${data.projectId}`;

    const blocks: SlackMessageBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: data.approved
            ? 'Submission is ship certified :check:'
            : 'Submission failed ship certification :X:',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: data.approved
            ? `Your submission for *${data.projectTitle}* is ship certified.`
            : `Your submission for *${data.projectTitle}* failed ship certification.`,
        },
      },
    ];

    if (data.approved && data.approvedHours !== undefined) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Approved Hours:* ${data.approvedHours} hours`,
        },
      });
    }

    if (data.feedback) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Feedback:*\n>${data.feedback.split('\n').join('\n>')}`,
        },
      });
    }

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<${projectUrl}|View your project →>`,
      },
    });

    const fallbackText = data.approved
      ? `Your submission for "${data.projectTitle}" is ship certified.${data.feedback ? ` Feedback: ${data.feedback}` : ''}`
      : `Your submission for "${data.projectTitle}" failed ship certification.${data.feedback ? ` Feedback: ${data.feedback}` : ''}`;

    return this.sendDirectMessage(user.slackUserId, fallbackText, blocks);
  }
}
