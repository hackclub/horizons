import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class IntegrationsService {
  constructor(private prisma: PrismaService) {}

  async getReferralBySlackId(slackId: string) {
    const user = await this.prisma.user.findUnique({
      where: { slackUserId: slackId },
      select: {
        referralCode: true,
        _count: { select: { referrals: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('No user found for that Slack ID');
    }

    return {
      referralCode: user.referralCode,
      referralCount: user._count.referrals,
    };
  }
}
