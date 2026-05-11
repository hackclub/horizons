import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SlackService } from '../slack/slack.service';

// Channels everyone signed up for Horizons should be in.
export const SHARED_CHANNELS = [
  'C0AGKQ6K476', // chat w/ people going to horizons events
  'C0AF4T2GCTZ', // announcements
  'C0AFLAUT58A', // help
];

// Per-subevent Slack channels, keyed by `Event.slug`. Fill this in with the
// slug -> channel ID for each subevent. Users whose pinned event is missing
// from this map won't be invited to a subevent channel.
export const SUBEVENT_CHANNELS: Record<string, string> = {
  'arcana': 'C0AKNMLG2P5',
  'crux': 'C0ANDKD8DJB',
  'equinox': 'C0ANDFRS9RD',
  'europa': 'C0AL61QF4R5',
  'polaris': 'C0AKL0G0FFF',
  'sol': 'C0ANDKA6NKH',
};

export const REMOVE_ACTION_ID = 'horizons_remove_from_channels';

@Injectable()
export class SlackChannelsService {
  constructor(
    private prisma: PrismaService,
    private slack: SlackService,
  ) {}

  async inviteSingleUser(userId: number): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        slackUserId: true,
        pinnedEvent: { select: { event: { select: { slug: true } } } },
      },
    });

    if (!user?.slackUserId) return;

    await this.processUser({
      slackUserId: user.slackUserId,
      subeventSlug: user.pinnedEvent?.event.slug ?? null,
    });
  }

  async inviteToSubeventChannel(userId: number): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        slackUserId: true,
        pinnedEvent: { select: { event: { select: { slug: true } } } },
      },
    });

    if (!user?.slackUserId) return;
    const slug = user.pinnedEvent?.event.slug;
    if (!slug) return;
    const channelId = SUBEVENT_CHANNELS[slug];
    if (!channelId) {
      console.warn(
        `[SlackChannels] No subevent channel mapped for slug="${slug}" (user=${user.slackUserId}) — skipping`,
      );
      return;
    }

    const result = await this.slack.inviteUserToChannel(
      user.slackUserId,
      channelId,
    );
    if (!result.success) {
      console.warn(
        `[SlackChannels] Subevent invite failed user=${user.slackUserId} channel=${channelId} error=${result.error}`,
      );
    } else {
      console.log(
        `[SlackChannels] Subevent invite user=${user.slackUserId} channel=${channelId} ${result.alreadyInChannel ? 'alreadyIn' : 'invited'}`,
      );
    }
  }

  private async processUser(input: {
    slackUserId: string;
    subeventSlug: string | null;
  }): Promise<{
    invited: number;
    skipped: boolean;
    errors: number;
  }> {
    const { slackUserId, subeventSlug } = input;
    const subeventChannelId = subeventSlug
      ? (SUBEVENT_CHANNELS[subeventSlug] ?? null)
      : null;

    if (subeventSlug && !subeventChannelId) {
      console.warn(
        `[SlackChannels] No subevent channel mapped for slug="${subeventSlug}" (user=${slackUserId}) — skipping subevent invite`,
      );
    }

    const targetChannels = subeventChannelId
      ? [...SHARED_CHANNELS, subeventChannelId]
      : [...SHARED_CHANNELS];

    // If the user is already in ANY of the target channels, assume they've
    // been through this flow before (or joined manually) and skip entirely.
    const existing = await this.slack.getUserChannels(slackUserId);
    const alreadyIn = targetChannels.filter((id) => existing.has(id));

    if (alreadyIn.length > 0) {
      console.log(
        `[SlackChannels] user=${slackUserId} subevent=${subeventSlug ?? 'none'} skipped (alreadyIn=${alreadyIn.length}/${targetChannels.length})`,
      );
      return { invited: 0, skipped: true, errors: 0 };
    }

    let errors = 0;
    let invited = 0;
    for (const channelId of targetChannels) {
      const result = await this.slack.inviteUserToChannel(
        slackUserId,
        channelId,
      );

      if (!result.success) {
        errors += 1;
        console.warn(
          `[SlackChannels] Invite failed user=${slackUserId} channel=${channelId} error=${result.error}`,
        );
        continue;
      }

      if (!result.alreadyInChannel) {
        invited += 1;
      }

      await sleep(1200);
    }

    console.log(
      `[SlackChannels] user=${slackUserId} subevent=${subeventSlug ?? 'none'} invited=${invited}/${targetChannels.length}`,
    );

    return {
      invited,
      skipped: false,
      errors,
    };
  }

  async removeUserFromAllChannels(slackUserId: string): Promise<{
    removed: number;
    notIn: number;
    errors: number;
  }> {
    const channels = [...SHARED_CHANNELS, ...Object.values(SUBEVENT_CHANNELS)];

    let removed = 0;
    let notIn = 0;
    let errors = 0;

    for (const channelId of channels) {
      const result = await this.slack.removeUserFromChannel(
        slackUserId,
        channelId,
      );
      if (!result.success) {
        errors += 1;
        console.warn(
          `[SlackChannels] Kick failed user=${slackUserId} channel=${channelId} error=${result.error}`,
        );
        continue;
      }
      if (result.notInChannel) {
        notIn += 1;
      } else {
        removed += 1;
      }
    }

    return { removed, notIn, errors };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
