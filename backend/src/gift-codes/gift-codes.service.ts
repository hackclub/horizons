import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MailService } from '../mail/mail.service';
import { SendGiftCodesDto } from './dto/send-gift-codes.dto';
import { randomBytes } from 'crypto';

@Injectable()
export class GiftCodesService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

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

        const giftCode = await this.prisma.giftCode.create({
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

        const filloutUrlWithParams = this.buildFilloutUrl(
          dto.filloutUrl,
          user?.firstName || '',
          user?.lastName || '',
          email,
          code,
        );

        await this.mailService.sendGiftCodeEmail(email, {
          firstName: user?.firstName || 'Friend',
          itemDescription: dto.itemDescription,
          imageUrl: dto.imageUrl,
          claimUrl: filloutUrlWithParams,
        });

        await this.prisma.giftCode.update({
          where: { id: giftCode.id },
          data: { emailSentAt: new Date() },
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

  private buildFilloutUrl(
    baseUrl: string,
    firstName: string,
    lastName: string,
    email: string,
    lfdRec: string,
  ): string {
    const url = new URL(baseUrl);
    url.searchParams.set('first_name', firstName);
    url.searchParams.set('last_name', lastName);
    url.searchParams.set('email', email);
    url.searchParams.set('lfd_rec', lfdRec);
    return url.toString();
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
