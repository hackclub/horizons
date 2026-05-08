import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { debugLog } from '../utils/debug-log';

@Injectable()
export class BalanceService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async getUserBalance(userId: number) {
    const totalApprovedHours = await this.prisma.project.aggregate({
      where: { userId },
      _sum: { approvedHours: true },
    });

    const totalSpent = await this.prisma.transaction.aggregate({
      where: { userId },
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
