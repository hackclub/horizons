import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BalanceService } from '../balance/balance.service';
import { AirtableService } from '../airtable/airtable.service';
import {
  ExecuteReviewerPayoutDto,
  UpdateReviewerPayoutFlagsDto,
} from './dto/reviewer-payouts.dto';

// July 13, 2026 00:00 US Eastern — reviews on/after this instant pay at the
// boosted rate when the reviewer's boostedRateEnabled flag is on.
const RATE_CUTOFF = new Date('2026-07-13T04:00:00.000Z');
// Base rate: all reviews, and post-cutoff reviews without the boost flag.
const BASE_REVIEWS_PER_HOUR = 15;
// Boosted rate: post-cutoff reviews when the reviewer's flag is on.
const BOOSTED_REVIEWS_PER_HOUR = 5;

@Injectable()
export class ReviewerPayoutsService {
  constructor(
    private prisma: PrismaService,
    private balanceService: BalanceService,
    private airtableService: AirtableService,
  ) {}

  // Rate is applied at payout time from the reviewer's current flags:
  //  - boosted OFF: one pool — every unpaid review pays 1h per 15.
  //  - boosted ON: two pools — unpaid pre-cutoff reviews at 1h/15, unpaid
  //    post-cutoff reviews at 1h/5.
  // Only whole blocks pay; the remainder carries over to the next payout.
  private computeOwed(
    unpaidBefore: number,
    unpaidAfter: number,
    boosted: boolean,
  ): { owedHours: number; carryover: number } {
    if (boosted) {
      const owedHours =
        Math.floor(unpaidBefore / BASE_REVIEWS_PER_HOUR) +
        Math.floor(unpaidAfter / BOOSTED_REVIEWS_PER_HOUR);
      return {
        owedHours,
        carryover:
          (unpaidBefore % BASE_REVIEWS_PER_HOUR) +
          (unpaidAfter % BOOSTED_REVIEWS_PER_HOUR),
      };
    }
    const total = unpaidBefore + unpaidAfter;
    return {
      owedHours: Math.floor(total / BASE_REVIEWS_PER_HOUR),
      carryover: total % BASE_REVIEWS_PER_HOUR,
    };
  }

  async listReviewers() {
    // reviewed_by stores the reviewer's userId as a string — group on the raw
    // text and parse afterward, same as ReviewerLeaderboardCronService.
    const rows = await this.prisma.$queryRaw<
      Array<{
        reviewed_by: string;
        before_total: bigint;
        after_total: bigint;
        before_unpaid: bigint;
        after_unpaid: bigint;
      }>
    >`
      SELECT s.reviewed_by,
        COUNT(*) FILTER (WHERE s.reviewed_at <  ${RATE_CUTOFF})                                   AS before_total,
        COUNT(*) FILTER (WHERE s.reviewed_at >= ${RATE_CUTOFF})                                   AS after_total,
        COUNT(*) FILTER (WHERE s.reviewed_at <  ${RATE_CUTOFF} AND s.reviewer_payout_id IS NULL)  AS before_unpaid,
        COUNT(*) FILTER (WHERE s.reviewed_at >= ${RATE_CUTOFF} AND s.reviewer_payout_id IS NULL)  AS after_unpaid
      FROM submissions s
      WHERE s.reviewed_by IS NOT NULL
        AND s.review_passed IS NOT NULL
        AND s.reviewed_at IS NOT NULL
      GROUP BY s.reviewed_by
    `;

    const counts = new Map<
      number,
      {
        beforeTotal: number;
        afterTotal: number;
        beforeUnpaid: number;
        afterUnpaid: number;
      }
    >();
    for (const r of rows) {
      const id = Number(r.reviewed_by);
      if (!Number.isInteger(id)) continue;
      counts.set(id, {
        beforeTotal: Number(r.before_total),
        afterTotal: Number(r.after_total),
        beforeUnpaid: Number(r.before_unpaid),
        afterUnpaid: Number(r.after_unpaid),
      });
    }

    const ids = [...counts.keys()];
    if (ids.length === 0) return { reviewers: [], rateCutoff: RATE_CUTOFF };

    const [users, payoutAggregates] = await Promise.all([
      this.prisma.user.findMany({
        where: { userId: { in: ids } },
        select: {
          userId: true,
          firstName: true,
          lastName: true,
          slackUserId: true,
          reviewerPayoutsEnabled: true,
          reviewerBoostedRateEnabled: true,
        },
      }),
      this.prisma.reviewerPayout.groupBy({
        by: ['reviewerUserId'],
        where: { reviewerUserId: { in: ids } },
        _sum: { hours: true },
        _max: { createdAt: true },
      }),
    ]);

    const paidByUser = new Map(
      payoutAggregates.map((p) => [
        p.reviewerUserId,
        { totalPaidHours: p._sum.hours ?? 0, lastPayoutAt: p._max.createdAt },
      ]),
    );

    const reviewers = users
      .map((u) => {
        const c = counts.get(u.userId)!;
        const paid = paidByUser.get(u.userId);
        const { owedHours, carryover } = this.computeOwed(
          c.beforeUnpaid,
          c.afterUnpaid,
          u.reviewerBoostedRateEnabled,
        );
        return {
          userId: u.userId,
          firstName: u.firstName,
          lastName: u.lastName,
          slackUserId: u.slackUserId,
          payoutsEnabled: u.reviewerPayoutsEnabled,
          boostedRateEnabled: u.reviewerBoostedRateEnabled,
          reviewsBeforeCutoff: c.beforeTotal,
          reviewsAfterCutoff: c.afterTotal,
          unpaidBefore: c.beforeUnpaid,
          unpaidAfter: c.afterUnpaid,
          owedHours,
          carryover,
          totalPaidHours: paid?.totalPaidHours ?? 0,
          lastPayoutAt: paid?.lastPayoutAt ?? null,
        };
      })
      .sort(
        (a, b) =>
          b.owedHours - a.owedHours ||
          a.firstName.localeCompare(b.firstName) ||
          a.userId - b.userId,
      );

    return { reviewers, rateCutoff: RATE_CUTOFF };
  }

  async getHistory(reviewerUserId: number) {
    const payouts = await this.prisma.reviewerPayout.findMany({
      where: { reviewerUserId },
      include: { transaction: { select: { refundedAt: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      payouts: payouts.map((p) => ({
        payoutId: p.id,
        hours: p.hours,
        reviewsCountedBefore: p.reviewsCountedBefore,
        reviewsCountedAfter: p.reviewsCountedAfter,
        boostedRateApplied: p.boostedRateApplied,
        transactionId: p.transactionId,
        refunded: !!p.transaction.refundedAt,
        createdByUserId: p.createdByUserId,
        createdAt: p.createdAt,
      })),
    };
  }

  async updateFlags(
    reviewerUserId: number,
    dto: UpdateReviewerPayoutFlagsDto,
    requestingUserId: number,
  ) {
    if (dto.payoutsEnabled === undefined && dto.boostedRateEnabled === undefined) {
      throw new BadRequestException(
        'At least one of payoutsEnabled or boostedRateEnabled is required',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { userId: reviewerUserId },
      select: { userId: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { userId: reviewerUserId },
      data: {
        ...(dto.payoutsEnabled !== undefined && {
          reviewerPayoutsEnabled: dto.payoutsEnabled,
        }),
        ...(dto.boostedRateEnabled !== undefined && {
          reviewerBoostedRateEnabled: dto.boostedRateEnabled,
        }),
      },
      select: {
        userId: true,
        reviewerPayoutsEnabled: true,
        reviewerBoostedRateEnabled: true,
      },
    });

    console.log(
      `[ReviewerPayout] flags updated for user_id=${reviewerUserId} payoutsEnabled=${updated.reviewerPayoutsEnabled} boostedRateEnabled=${updated.reviewerBoostedRateEnabled} by_admin=${requestingUserId}`,
    );

    return {
      userId: updated.userId,
      payoutsEnabled: updated.reviewerPayoutsEnabled,
      boostedRateEnabled: updated.reviewerBoostedRateEnabled,
    };
  }

  // Atomic payout: row-locks the reviewer, re-checks flags and unpaid counts
  // under the lock, creates one AdminAdjustment credit covering all payable
  // blocks, and marks exactly the paid reviews via Submission.reviewerPayoutId.
  // Mirrors AdminService.adjustUserHours but can't call it (it opens its own
  // $transaction and hardcodes its description).
  async executePayout(
    reviewerUserId: number,
    dto: ExecuteReviewerPayoutDto,
    requestingUserId: number,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM users WHERE user_id = ${reviewerUserId} FOR UPDATE`;

      const user = await tx.user.findUnique({
        where: { userId: reviewerUserId },
        select: {
          userId: true,
          email: true,
          reviewerPayoutsEnabled: true,
          reviewerBoostedRateEnabled: true,
        },
      });
      if (!user) throw new NotFoundException('User not found');
      if (!user.reviewerPayoutsEnabled) {
        throw new BadRequestException(
          'Reviewer payouts are not enabled for this user',
        );
      }
      const boosted = user.reviewerBoostedRateEnabled;

      // Unpaid reviews, oldest first (deterministic tiebreak on id). Paid
      // reviews are consumed oldest-first so carryover is always the newest.
      const unpaidWhere = {
        reviewedBy: String(reviewerUserId),
        reviewPassed: { not: null },
        reviewedAt: { not: null as Date | null },
        reviewerPayoutId: null,
      };
      const orderBy = [
        { reviewedAt: 'asc' as const },
        { submissionId: 'asc' as const },
      ];
      const [before, after] = await Promise.all([
        tx.submission.findMany({
          where: { ...unpaidWhere, reviewedAt: { lt: RATE_CUTOFF } },
          orderBy,
          select: { submissionId: true, reviewedAt: true },
        }),
        tx.submission.findMany({
          where: { ...unpaidWhere, reviewedAt: { gte: RATE_CUTOFF } },
          orderBy,
          select: { submissionId: true, reviewedAt: true },
        }),
      ]);

      // Which reviews fill whole blocks under the active rate plan.
      let paid: { submissionId: number; reviewedAt: Date | null }[];
      if (boosted) {
        const blocksBefore = Math.floor(before.length / BASE_REVIEWS_PER_HOUR);
        const blocksAfter = Math.floor(after.length / BOOSTED_REVIEWS_PER_HOUR);
        paid = [
          ...before.slice(0, blocksBefore * BASE_REVIEWS_PER_HOUR),
          ...after.slice(0, blocksAfter * BOOSTED_REVIEWS_PER_HOUR),
        ];
      } else {
        // Single pool across both eras, oldest first.
        const pool = [...before, ...after].sort(
          (a, b) =>
            a.reviewedAt!.getTime() - b.reviewedAt!.getTime() ||
            a.submissionId - b.submissionId,
        );
        const blocks = Math.floor(pool.length / BASE_REVIEWS_PER_HOUR);
        paid = pool.slice(0, blocks * BASE_REVIEWS_PER_HOUR);
      }

      const hours = boosted
        ? Math.floor(before.length / BASE_REVIEWS_PER_HOUR) +
          Math.floor(after.length / BOOSTED_REVIEWS_PER_HOUR)
        : Math.floor((before.length + after.length) / BASE_REVIEWS_PER_HOUR);

      if (hours === 0) {
        throw new BadRequestException(
          'No complete review blocks to pay out yet',
        );
      }
      if (dto.expectedHours !== undefined && dto.expectedHours !== hours) {
        throw new ConflictException(
          'Unpaid review counts changed since the page loaded — refresh and retry',
        );
      }

      const countBefore = paid.filter(
        (s) => s.reviewedAt! < RATE_CUTOFF,
      ).length;
      const countAfter = paid.length - countBefore;

      const txn = await tx.transaction.create({
        data: {
          userId: reviewerUserId,
          kind: 'AdminAdjustment',
          cost: -hours,
          itemDescription: `Reviewer payout by user #${requestingUserId}: ${paid.length} reviews = ${hours}h (boosted rate ${boosted ? 'on' : 'off'}, ${countBefore} pre-cutoff + ${countAfter} post-cutoff)`,
          isFulfilled: true,
          fulfilledAt: new Date(),
        },
      });

      const payout = await tx.reviewerPayout.create({
        data: {
          reviewerUserId,
          hours,
          reviewsCountedBefore: countBefore,
          reviewsCountedAfter: countAfter,
          boostedRateApplied: boosted,
          transactionId: txn.transactionId,
          createdByUserId: requestingUserId,
        },
      });

      // The reviewerPayoutId: null re-filter plus count assertion makes double
      // payment impossible even if the row lock were somehow bypassed.
      const updated = await tx.submission.updateMany({
        where: {
          submissionId: { in: paid.map((s) => s.submissionId) },
          reviewerPayoutId: null,
        },
        data: { reviewerPayoutId: payout.id },
      });
      if (updated.count !== paid.length) {
        throw new ConflictException(
          'Concurrent payout detected — no changes were made',
        );
      }

      const { balance } = await this.balanceService.getUserBalance(
        reviewerUserId,
        tx,
      );

      return {
        payout,
        txn,
        balance,
        email: user.email,
        remainingBefore: before.length - countBefore,
        remainingAfter: after.length - countAfter,
      };
    });

    console.log(
      `[ReviewerPayout] user_id=${reviewerUserId} email=${result.email} hours=${result.payout.hours} reviews=${result.payout.reviewsCountedBefore}+${result.payout.reviewsCountedAfter} boosted=${result.payout.boostedRateApplied} by_admin=${requestingUserId} txn=${result.txn.transactionId} new_balance=${result.balance}`,
    );

    void this.airtableService
      .syncTransaction(result.txn.transactionId)
      .catch((err) =>
        console.error('[ReviewerPayout] Airtable txn sync failed:', err),
      );

    return {
      payoutId: result.payout.id,
      transactionId: result.txn.transactionId,
      hours: result.payout.hours,
      reviewsCountedBefore: result.payout.reviewsCountedBefore,
      reviewsCountedAfter: result.payout.reviewsCountedAfter,
      boostedRateApplied: result.payout.boostedRateApplied,
      remainingUnpaidBefore: result.remainingBefore,
      remainingUnpaidAfter: result.remainingAfter,
      newBalance: result.balance,
      createdAt: result.payout.createdAt,
    };
  }
}
