import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { SlackService } from '../slack/slack.service';

interface ReviewerCount {
  reviewerId: number;
  count: number;
  name: string;
  slackUserId: string | null;
}

@Injectable()
export class ReviewerLeaderboardCronService {
  private readonly logger = new Logger(ReviewerLeaderboardCronService.name);

  constructor(
    private prisma: PrismaService,
    private slack: SlackService,
  ) {}

  /**
   * Post yesterday's reviewer leaderboard to Slack at noon Eastern. The window
   * matches MetricsSnapshotService so daily numbers reconcile against the
   * historical metric snapshot. Skips silently if the channel env var is
   * unset (e.g. local dev) or no reviews landed in the window.
   */
  @Cron('0 12 * * *', { timeZone: 'America/New_York' })
  async handleDaily() {
    const channelId = process.env.SLACK_REVIEWER_LEADERBOARD_CHANNEL;
    if (!channelId) {
      this.logger.log(
        'SLACK_REVIEWER_LEADERBOARD_CHANNEL not set, skipping daily leaderboard.',
      );
      return;
    }

    const now = new Date();
    const dayEnd = new Date(now);
    dayEnd.setUTCHours(0, 0, 0, 0);
    const dayStart = new Date(dayEnd);
    dayStart.setUTCDate(dayStart.getUTCDate() - 1);

    await this.postLeaderboard(channelId, dayStart, dayEnd);
  }

  /**
   * Compute and post the leaderboard for an arbitrary [start, end) UTC window.
   * Extracted so admins can trigger a manual post for any day without waiting
   * for the cron.
   */
  async postLeaderboard(channelId: string, start: Date, end: Date) {
    const dateLabel = start.toISOString().split('T')[0];

    const submissions = await this.prisma.submission.findMany({
      where: {
        reviewedBy: { not: null },
        approvalStatus: { in: ['approved', 'rejected'] },
        reviewedAt: { gte: start, lt: end },
      },
      select: { reviewedBy: true, approvalStatus: true },
    });

    if (submissions.length === 0) {
      this.logger.log(
        `No reviews completed on ${dateLabel}, skipping leaderboard post.`,
      );
      return;
    }

    const counts = new Map<
      number,
      { total: number; approved: number; rejected: number }
    >();
    for (const sub of submissions) {
      const id = parseInt(sub.reviewedBy!);
      if (isNaN(id)) continue;
      const entry = counts.get(id) ?? { total: 0, approved: 0, rejected: 0 };
      entry.total += 1;
      if (sub.approvalStatus === 'approved') entry.approved += 1;
      else if (sub.approvalStatus === 'rejected') entry.rejected += 1;
      counts.set(id, entry);
    }

    const reviewerIds = [...counts.keys()];
    const users = await this.prisma.user.findMany({
      where: { userId: { in: reviewerIds } },
      select: {
        userId: true,
        firstName: true,
        lastName: true,
        slackUserId: true,
      },
    });
    const userMap = new Map(users.map((u) => [u.userId, u]));

    const leaderboard: (ReviewerCount & {
      approved: number;
      rejected: number;
    })[] = reviewerIds.map((id) => {
      const u = userMap.get(id);
      const entry = counts.get(id)!;
      return {
        reviewerId: id,
        count: entry.total,
        approved: entry.approved,
        rejected: entry.rejected,
        name: u ? `${u.firstName} ${u.lastName ?? ''}`.trim() : `User ${id}`,
        slackUserId: u?.slackUserId ?? null,
      };
    });
    leaderboard.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    const totalReviews = submissions.length;
    const medals = ['🥇', '🥈', '🥉'];
    const lines = leaderboard.map((r, i) => {
      const rankBadge = i < medals.length ? medals[i] : `${i + 1}.`;
      const who = r.slackUserId ? `<@${r.slackUserId}>` : `*${r.name}*`;
      return `${rankBadge} ${who} — *${r.count}* (${r.approved} approved · ${r.rejected} rejected)`;
    });

    const blocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `Reviewer leaderboard — ${dateLabel}`,
          emoji: true,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `*${totalReviews}* submissions reviewed by *${leaderboard.length}* reviewer${leaderboard.length === 1 ? '' : 's'} on ${dateLabel} (UTC).`,
          },
        ],
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: lines.join('\n') },
      },
    ];

    const fallback = `Reviewer leaderboard for ${dateLabel}: ${totalReviews} submissions reviewed by ${leaderboard.length} reviewer${leaderboard.length === 1 ? '' : 's'}.`;

    const result = await this.slack.postToChannel(channelId, fallback, blocks);
    if (result.success) {
      this.logger.log(
        `Posted reviewer leaderboard for ${dateLabel}: ${totalReviews} reviews by ${leaderboard.length} reviewers.`,
      );
    } else {
      this.logger.warn(
        `Failed to post reviewer leaderboard for ${dateLabel}: ${result.error}`,
      );
    }
  }
}
