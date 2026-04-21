import { Injectable, OnModuleInit } from '@nestjs/common';
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

const DM_FALLBACK_TEXT =
  "hi! i've added you to the horizons channels because I noticed you weren't in any of the channels!";

function buildDmBlocks(subeventChannelId: string | null): any[] {
  const channelBullets: any[] = [
    {
      type: 'rich_text_section',
      elements: [
        { type: 'channel', channel_id: 'C0AGKQ6K476' },
        { type: 'text', text: ' - chat w/ people going to horizons events!' },
      ],
    },
    {
      type: 'rich_text_section',
      elements: [
        { type: 'channel', channel_id: 'C0AF4T2GCTZ' },
        { type: 'text', text: '  - get up to date announcements regarding horizons!' },
      ],
    },
    {
      type: 'rich_text_section',
      elements: [
        { type: 'channel', channel_id: 'C0AFLAUT58A' },
        { type: 'text', text: ' - need help w/ something? ask here!' },
      ],
    },
  ];

  if (subeventChannelId) {
    channelBullets.push({
      type: 'rich_text_section',
      elements: [
        { type: 'channel', channel_id: subeventChannelId },
        { type: 'text', text: " - the subevent you're going to!" },
      ],
    });
  }

  return [
    {
      type: 'rich_text',
      elements: [
        {
          type: 'rich_text_section',
          elements: [
            {
              type: 'text',
              text: "hi! i've added you to the horizons channels because I noticed you weren't in any of the channels!\n",
            },
          ],
        },
        {
          type: 'rich_text_list',
          style: 'bullet',
          indent: 0,
          border: 0,
          elements: channelBullets,
        },
        {
          type: 'rich_text_section',
          elements: [
            {
              type: 'text',
              text: '\nhope you have a wonderful day!',
            },
          ],
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '(p.s. if you want to leave the channels hit the ⋯)',
        },
      ],
    },
    {
      type: 'actions',
      block_id: 'horizons_channel_backfill_actions',
      elements: [
        {
          type: 'overflow',
          action_id: REMOVE_ACTION_ID,
          options: [
            {
              text: {
                type: 'plain_text',
                text: 'Leave channels',
                emoji: true,
              },
              value: 'remove_from_channels',
            },
          ],
          confirm: {
            title: { type: 'plain_text', text: 'Leave Horizons channels?' },
            text: {
              type: 'mrkdwn',
              text: "You'll be removed from the Horizons Slack channels. You can always rejoin later.",
            },
            confirm: { type: 'plain_text', text: 'Remove me' },
            deny: { type: 'plain_text', text: 'Cancel' },
          },
        },
      ],
    },
  ];
}

@Injectable()
export class SlackBackfillService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private slack: SlackService,
  ) {}

  onModuleInit() {
    if (process.env.RUN_SLACK_CHANNEL_BACKFILL !== 'true') {
      return;
    }

    console.log(
      '[SlackBackfill] RUN_SLACK_CHANNEL_BACKFILL=true — starting backfill in background...',
    );
    this.run()
      .then((summary) =>
        console.log(
          `[SlackBackfill] Done. users=${summary.usersProcessed} invited=${summary.totalInvites} usersSkipped=${summary.usersSkipped} dmSent=${summary.dmSent} errors=${summary.errors}. You can now unset RUN_SLACK_CHANNEL_BACKFILL.`,
        ),
      )
      .catch((error) =>
        console.error('[SlackBackfill] Backfill failed:', error),
      );
  }

  async run(): Promise<{
    usersProcessed: number;
    totalInvites: number;
    usersSkipped: number;
    dmSent: number;
    errors: number;
  }> {
    const users = await this.prisma.user.findMany({
      where: { slackUserId: { not: null } },
      select: {
        userId: true,
        slackUserId: true,
        pinnedEvent: {
          select: {
            event: { select: { slug: true } },
          },
        },
      },
    });

    console.log(`[SlackBackfill] Processing ${users.length} users...`);

    let totalInvites = 0;
    let usersSkipped = 0;
    let dmSent = 0;
    let errors = 0;

    for (const user of users) {
      const slackUserId = user.slackUserId!;
      const subeventSlug = user.pinnedEvent?.event.slug ?? null;
      const subeventChannelId = subeventSlug
        ? (SUBEVENT_CHANNELS[subeventSlug] ?? null)
        : null;

      if (subeventSlug && !subeventChannelId) {
        console.warn(
          `[SlackBackfill] No subevent channel mapped for slug="${subeventSlug}" (user=${slackUserId}) — skipping subevent invite`,
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
        usersSkipped += 1;
        console.log(
          `[SlackBackfill] user=${slackUserId} subevent=${subeventSlug ?? 'none'} skipped (alreadyIn=${alreadyIn.length}/${targetChannels.length})`,
        );
        continue;
      }

      // DM first so the user gets context before the channel-invite pings
      // start arriving in their Slack.
      let dmStatus: 'sent' | 'failed' = 'sent';
      let dmError: string | undefined;
      const dm = await this.slack.sendDirectMessageAsUser(
        slackUserId,
        DM_FALLBACK_TEXT,
        buildDmBlocks(subeventChannelId),
      );
      if (dm.success) {
        dmSent += 1;
      } else {
        errors += 1;
        dmStatus = 'failed';
        dmError = dm.error;
      }

      let invitedThisUser = 0;
      for (const channelId of targetChannels) {
        const result = await this.slack.inviteUserToChannel(
          slackUserId,
          channelId,
        );

        if (!result.success) {
          errors += 1;
          console.warn(
            `[SlackBackfill] Invite failed user=${slackUserId} channel=${channelId} error=${result.error}`,
          );
          continue;
        }

        if (!result.alreadyInChannel) {
          invitedThisUser += 1;
          totalInvites += 1;
        }

        // Light pacing between channel invites (Tier 3 = ~50/min)
        await sleep(1200);
      }

      console.log(
        `[SlackBackfill] user=${slackUserId} subevent=${subeventSlug ?? 'none'} invited=${invitedThisUser}/${targetChannels.length} dm=${dmStatus}${dmError ? ` dmError=${dmError}` : ''}`,
      );
    }

    return {
      usersProcessed: users.length,
      totalInvites,
      usersSkipped,
      dmSent,
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
          `[SlackBackfill] Kick failed user=${slackUserId} channel=${channelId} error=${result.error}`,
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
