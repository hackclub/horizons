import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client';
import { TransactionKind } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma.service';
import { debugLog } from '../utils/debug-log';

@Injectable()
export class BalanceService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async getUserBalance(userId: number, client?: Prisma.TransactionClient) {
    const db = client ?? this.prisma;

    const totalApprovedHours = await db.project.aggregate({
      where: { userId, deletedAt: null },
      _sum: { approvedHours: true },
    });

    const totalSpent = await db.transaction.aggregate({
      where: { userId, refundedAt: null },
      _sum: { cost: true },
    });

    const approved = totalApprovedHours._sum.approvedHours ?? 0;
    const spent = totalSpent._sum.cost ?? 0;
    const balance = Math.round((approved - spent) * 10) / 10;

    return {
      totalApprovedHours: approved,
      totalSpent: spent,
      balance,
    };
  }

  // Atomic spend: row-locks the user, re-checks balance and any caller-supplied
  // preCheck under the lock, then writes one Transaction per unit. Prevents
  // concurrent purchases from both passing a stale balance check.
  async processPurchase(params: {
    userId: number;
    cost: number;
    kind: TransactionKind;
    itemDescription: string;
    itemId?: number | null;
    variantId?: number | null;
    eventId?: number | null;
    quantity?: number;
    enforceBalance?: boolean;
    preCheck?: (tx: Prisma.TransactionClient) => Promise<void>;
  }) {
    const {
      userId,
      cost,
      kind,
      itemDescription,
      itemId = null,
      variantId = null,
      eventId = null,
      quantity = 1,
      enforceBalance = true,
      preCheck,
    } = params;

    if (quantity < 1) {
      throw new BadRequestException('Quantity must be at least 1');
    }

    const totalCost = cost * quantity;

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM users WHERE user_id = ${userId} FOR UPDATE`;

      if (preCheck) {
        await preCheck(tx);
      }

      if (enforceBalance) {
        const { balance } = await this.getUserBalance(userId, tx);
        if (balance < totalCost) {
          throw new BadRequestException(
            `Insufficient balance. You have ${balance} hours but this costs ${totalCost} hours.`,
          );
        }
      }

      const data = {
        userId,
        kind,
        itemId,
        variantId,
        eventId,
        itemDescription,
        cost,
      };

      let lastTxn = null;
      for (let i = 0; i < quantity; i++) {
        lastTxn = await tx.transaction.create({
          data,
          include: {
            item: true,
            variant: true,
          },
        });
      }
      return lastTxn!;
    });
  }

  async verifyEligibility(userId: number, context: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { email: true },
    });

    if (!user || !user.email) {
      throw new BadRequestException('User email not found');
    }

    const externalApiBaseUrl = this.configService.get<string>(
      'EXTERNAL_VERIFICATION_API_URL',
      'https://identity.hackclub.com/api/external',
    );
    const checkUrl = `${externalApiBaseUrl}/check?email=${encodeURIComponent(user.email)}`;

    try {
      const verificationResponse = await fetch(checkUrl);

      if (!verificationResponse.ok) {
        const errorText = await verificationResponse
          .text()
          .catch(() => 'Unable to read response');
        console.error(
          `[${context}] Verification API returned non-OK status: ${verificationResponse.status}, response: ${errorText}`,
        );
        throw new BadRequestException(
          'Failed to verify eligibility. Please try again later.',
        );
      }

      const verificationData = await verificationResponse.json();

      if (verificationData.result !== 'verified_eligible') {
        debugLog(
          `[${context}] User ${userId} (${user.email}) is not verified_eligible. Result: ${verificationData.result}`,
        );
        throw new BadRequestException(
          'You must be verified eligible to complete this action',
        );
      }

      debugLog(`[${context}] User ${userId} verification check passed`);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error(
        `[${context}] Error checking verification status for user ${userId}:`,
        error,
      );
      throw new BadRequestException(
        'Failed to verify eligibility. Please try again later.',
      );
    }
  }
}
