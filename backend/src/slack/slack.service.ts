import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

interface SlackMessageBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  elements?: Array<{
    type: string;
    text?: string;
    url?: string;
  }>;
}

@Injectable()
export class SlackService {
  private botToken: string;

  constructor(private prisma: PrismaService) {
    this.botToken = process.env.SLACK_BOT_TOKEN || '';

    if (!this.botToken) {
      console.warn('SLACK_BOT_TOKEN not configured - Slack notifications disabled');
    }
  }

  async getSlackUserEmail(slackUserId: string): Promise<string | null> {
    if (!this.botToken) {
      return null;
    }

    try {
      const response = await fetch(`https://slack.com/api/users.info?user=${slackUserId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.botToken}`,
          'Content-Type': 'application/json',
        },
      });

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

  async lookupSlackUserByEmail(email: string): Promise<{ slackUserId: string; displayName: string } | null> {
    if (!this.botToken) {
      return null;
    }

    try {
      const response = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.botToken}`,
          'Content-Type': 'application/json',
        },
      });

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
        displayName: data.user?.profile?.display_name || data.user?.profile?.real_name || data.user?.name || 'Unknown',
      };
    } catch (error) {
      console.error('Error looking up Slack user by email:', error);
      return null;
    }
  }

  async getSlackUserInfo(slackUserId: string): Promise<{ displayName: string; email: string | null } | null> {
    if (!this.botToken || !slackUserId) {
      return null;
    }

    try {
      const response = await fetch(`https://slack.com/api/users.info?user=${slackUserId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.botToken}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!data.ok) {
        console.error('Failed to fetch Slack user info:', data.error);
        return null;
      }

      return {
        displayName: data.user?.profile?.display_name || data.user?.profile?.real_name || data.user?.name || 'Unknown',
        email: data.user?.profile?.email || null,
      };
    } catch (error) {
      console.error('Error fetching Slack user info:', error);
      return null;
    }
  }

  async sendDirectMessage(
    slackUserId: string,
    message: string,
    blocks?: SlackMessageBlock[],
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.botToken) {
      console.log('Slack not configured, skipping DM');
      return { success: false, error: 'Slack not configured' };
    }

    try {
      const openResponse = await fetch('https://slack.com/api/conversations.open', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ users: slackUserId }),
      });

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

      const messageResponse = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messagePayload),
      });

      const messageData = await messageResponse.json();

      if (!messageData.ok) {
        console.error('Failed to send Slack message:', messageData.error);
        return { success: false, error: messageData.error };
      }

      return { success: true };
    } catch (error) {
      console.error('Error sending Slack DM:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
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

    const projectUrl = `${process.env.FRONTEND_URL || 'https://horizons.hackclub.com'}/app/projects/${data.projectId}`;
    const statusEmoji = data.approved ? '✅' : '❌';

    const blocks: SlackMessageBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${statusEmoji} Submission ${data.approved ? 'Approved' : 'Needs Changes'}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: data.approved
            ? `Your submission for *${data.projectTitle}* has been approved.`
            : `Your submission for *${data.projectTitle}* needs changes.`,
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
      ? `Your submission for "${data.projectTitle}" has been approved.${data.feedback ? ` Feedback: ${data.feedback}` : ''}`
      : `Your submission for "${data.projectTitle}" needs changes.${data.feedback ? ` Feedback: ${data.feedback}` : ''}`;

    return this.sendDirectMessage(user.slackUserId, fallbackText, blocks);
  }
}

