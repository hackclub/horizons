/**
 * Archived 2026-05-11.
 *
 * Originally part of `src/slack-channels/slack-channels.service.ts`. This was
 * the one-shot backfill that swept every user with a `slackUserId`, invited
 * them to the shared/subevent channels they weren't already in, and DM'd them
 * a "you've been added" rich-text block with a "Leave channels" overflow
 * action. Triggered by `RUN_SLACK_CHANNEL_BACKFILL=true` on boot via
 * `OnModuleInit` (fire-and-forget).
 *
 * Removed because: the backfill has run; leaving it wired risked silent
 * re-runs if the flag was left on across deploys (no idempotency table). The
 * live service keeps `inviteSingleUser`, `inviteToSubeventChannel`, and
 * `removeUserFromAllChannels` — those still serve normal flows.
 *
 * The "Leave channels" overflow action's `REMOVE_ACTION_ID` still lives in
 * `slack-channels.service.ts` because `slack-interactivity.controller.ts`
 * dispatches on it for users who use the button on the original DM. The
 * action stays even though we don't send the DM anymore.
 *
 * To revive: re-add `implements OnModuleInit`, paste back into the service,
 * un-private `processUser` if calling from a script, and wire an env-flag
 * (or an admin endpoint that calls `run()` directly).
 */

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
          action_id: 'horizons_remove_from_channels', // REMOVE_ACTION_ID
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

// Methods on SlackChannelsService when this was wired:

/*
  onModuleInit() {
    if (process.env.RUN_SLACK_CHANNEL_BACKFILL !== 'true') {
      return;
    }

    console.log(
      '[SlackChannels] RUN_SLACK_CHANNEL_BACKFILL=true — starting backfill in background...',
    );
    this.run()
      .then((summary) =>
        console.log(
          `[SlackChannels] Done. users=${summary.usersProcessed} invited=${summary.totalInvites} usersSkipped=${summary.usersSkipped} dmSent=${summary.dmSent} errors=${summary.errors}. You can now unset RUN_SLACK_CHANNEL_BACKFILL.`,
        ),
      )
      .catch((error) =>
        console.error('[SlackChannels] Backfill failed:', error),
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

    console.log(`[SlackChannels] Processing ${users.length} users...`);

    let totalInvites = 0;
    let usersSkipped = 0;
    let dmSent = 0;
    let errors = 0;

    for (const user of users) {
      const outcome = await this.processUser({
        slackUserId: user.slackUserId!,
        subeventSlug: user.pinnedEvent?.event.slug ?? null,
        sendDm: true,
      });
      totalInvites += outcome.invited;
      if (outcome.skipped) usersSkipped += 1;
      if (outcome.dmSent) dmSent += 1;
      errors += outcome.errors;
    }

    return {
      usersProcessed: users.length,
      totalInvites,
      usersSkipped,
      dmSent,
      errors,
    };
  }
*/

// And the DM branch inside processUser that this depended on:

/*
    let dmStatus: 'sent' | 'failed' | 'skipped' = 'skipped';
    let dmError: string | undefined;
    let dmSent = false;
    if (sendDm) {
      const dm = await this.slack.sendDirectMessageAsUser(
        slackUserId,
        DM_FALLBACK_TEXT,
        buildDmBlocks(subeventChannelId),
      );
      if (dm.success) {
        dmSent = true;
        dmStatus = 'sent';
      } else {
        errors += 1;
        dmStatus = 'failed';
        dmError = dm.error;
      }
    }
*/

export { DM_FALLBACK_TEXT, buildDmBlocks };
