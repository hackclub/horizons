import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SendGiftCodesDto } from './dto/send-gift-codes.dto';
import { randomBytes } from 'crypto';

@Injectable()
export class GiftCodesService {
  constructor(private prisma: PrismaService) {}

  private generateCode(): string {
    return randomBytes(8).toString('hex').toUpperCase();
  }

  async sendGiftCodes(dto: SendGiftCodesDto) {
    const results: Array<{
      email: string;
      code: string;
      success: boolean;
      error?: string;
    }> = [];

    for (const email of dto.emails) {
      const code = this.generateCode();

      try {
        const user = await this.prisma.user.findUnique({
          where: { email },
          select: { firstName: true, lastName: true },
        });

        await this.prisma.giftCode.create({
          data: {
            code,
            email,
            firstName: user?.firstName || null,
            lastName: user?.lastName || null,
            itemDescription: dto.itemDescription,
            imageUrl: dto.imageUrl,
            filloutUrl: dto.filloutUrl,
          },
        });

        results.push({ email, code, success: true });
      } catch (error) {
        results.push({
          email,
          code,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      total: dto.emails.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  async getGiftCodeByCode(code: string) {
    const giftCode = await this.prisma.giftCode.findUnique({
      where: { code },
    });

    if (!giftCode) {
      throw new NotFoundException('Gift code not found');
    }

    return {
      imageUrl: giftCode.imageUrl,
      itemDescription: giftCode.itemDescription,
      isClaimed: giftCode.isClaimed,
    };
  }

  async markCodeAsClaimed(code: string) {
    const giftCode = await this.prisma.giftCode.findUnique({
      where: { code },
    });

    if (!giftCode) {
      throw new NotFoundException('Gift code not found');
    }

    await this.prisma.giftCode.update({
      where: { code },
      data: {
        isClaimed: true,
        claimedAt: new Date(),
      },
    });

    return {
      success: true,
      isClaimed: true,
    };
  }

  async getAllGiftCodes() {
    return this.prisma.giftCode.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}
