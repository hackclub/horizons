import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { SlackService } from '../slack/slack.service';

interface ReviewerCount {
  reviewerId: number;
  count: number;
  name: string;
  slackUserId: string | null;
}

export interface LeaderboardPostResult {
  posted: boolean;
  dateLabel: string;
  totalReviews: number;
  reviewerCount: number;
  message: string;
}

@Injectable()
export class ReviewerLeaderboardCronService {
  private readonly logger = new Logger(ReviewerLeaderboardCronService.name);

  constructor(
    private prisma: PrismaService,
    private slack: SlackService,
  ) {}

  /**
   * Post the reviewer leaderboard for the most recent 6-hour UTC window to
   * Slack. Fires at 00:00, 06:00, 12:00, 18:00 UTC. Skips silently if the
   * channel env var is unset (e.g. local dev) or no reviews landed in the
   * window.
   */
  @Cron('0 0,6,12,18 * * *', { timeZone: 'UTC' })
  async handleSixHourly() {
    const channelId = process.env.SLACK_REVIEWER_LEADERBOARD_CHANNEL;
    if (!channelId) {
      this.logger.log(
        'SLACK_REVIEWER_LEADERBOARD_CHANNEL not set, skipping leaderboard.',
      );
      return;
    }

    const { start, end } = this.previousSixHourWindow();
    await this.postLeaderboard(channelId, start, end);
  }

  /**
   * Manually trigger the same leaderboard the cron would post (the most recent
   * completed 6-hour UTC window). Throws if the Slack channel env var isn't
   * configured.
   */
  async triggerNow(): Promise<LeaderboardPostResult> {
    const channelId = process.env.SLACK_REVIEWER_LEADERBOARD_CHANNEL;
    if (!channelId) {
      throw new BadRequestException(
        'SLACK_REVIEWER_LEADERBOARD_CHANNEL is not configured.',
      );
    }
    const { start, end } = this.previousSixHourWindow();
    return this.postLeaderboard(channelId, start, end);
  }

  private previousSixHourWindow() {
    const now = new Date();
    const end = new Date(now);
    end.setUTCMinutes(0, 0, 0);
    end.setUTCHours(Math.floor(end.getUTCHours() / 6) * 6);
    const start = new Date(end);
    start.setUTCHours(start.getUTCHours() - 6);
    return { start, end };
  }

  /**
   * Compute and post the leaderboard for an arbitrary [start, end) UTC window.
   * Extracted so admins can trigger a manual post for any window without
   * waiting for the cron.
   */
  async postLeaderboard(
    channelId: string,
    start: Date,
    end: Date,
  ): Promise<LeaderboardPostResult> {
    const dateStr = start.toISOString().split('T')[0];
    const fmtHour = (d: Date) =>
      `${String(d.getUTCHours()).padStart(2, '0')}:00`;
    const dateLabel = `${dateStr} ${fmtHour(start)}–${fmtHour(end)} UTC`;

    const submissions = await this.prisma.submission.findMany({
      where: {
        reviewedBy: { not: null },
        approvalStatus: { in: ['approved', 'rejected'] },
        reviewedAt: { gte: start, lt: end },
      },
      select: { reviewedBy: true, approvalStatus: true },
    });

    if (submissions.length === 0) {
      const message = `No reviews completed on ${dateLabel}, skipping leaderboard post.`;
      this.logger.log(message);
      return {
        posted: false,
        dateLabel,
        totalReviews: 0,
        reviewerCount: 0,
        message,
      };
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
            text: `*${totalReviews}* submissions reviewed by *${leaderboard.length}* reviewer${leaderboard.length === 1 ? '' : 's'} in ${dateLabel}.`,
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
      const message = `Posted reviewer leaderboard for ${dateLabel}: ${totalReviews} reviews by ${leaderboard.length} reviewers.`;
      this.logger.log(message);
      return {
        posted: true,
        dateLabel,
        totalReviews,
        reviewerCount: leaderboard.length,
        message,
      };
    }
    const errMessage = `Failed to post reviewer leaderboard for ${dateLabel}: ${result.error}`;
    this.logger.warn(errMessage);
    return {
      posted: false,
      dateLabel,
      totalReviews,
      reviewerCount: leaderboard.length,
      message: errMessage,
    };
  }
}
