import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class UserService {
  private readonly BASE_ID = 'appumOs6hlFGhbv7c';
  private readonly TABLE_NAME = 'tbldJ8CL1xt7qcnrM';
  private readonly EMAIL_TABLE_ID = 'tblFDNhax22eAjSB3';
  private readonly AIRTABLE_API_KEY = process.env.USER_SERVICE_AIRTABLE_API_KEY;

  constructor(private prisma: PrismaService) {}

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async createInitialRsvp(email: string, clientIP: string): Promise<void> {
    throw new HttpException(
      'rsvp is not enabled at this moment',
      HttpStatus.BAD_REQUEST,
    );
  }

  private calculateAge(birthday: string): number {
    const birthDate = new Date(birthday);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }
    return age;
  }

  async completeRsvp(
    data: {
      email: string;
      firstName: string;
      lastName: string;
      birthday: string;
      referralCode?: string;
    },
    clientIP: string,
  ): Promise<{ rafflePosition: number }> {
    throw new HttpException(
      'rsvp is not enabled at this moment',
      HttpStatus.BAD_REQUEST,
    );
  }

  async getRsvpCount(): Promise<{ count: number }> {
    return { count: 0 };
  }

  async verifyStickerToken(
    token: string,
  ): Promise<{ valid: boolean; email?: string; rsvpNumber?: number }> {
    if (!token) {
      throw new HttpException('Token is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const stickerToken = await this.prisma.stickerToken.findUnique({
        where: { token },
      });

      if (!stickerToken) {
        return { valid: false };
      }

      if (stickerToken.isUsed) {
        return { valid: false };
      }

      await this.prisma.stickerToken.update({
        where: { token },
        data: {
          isUsed: true,
          usedAt: new Date(),
        },
      });

      return {
        valid: true,
        email: stickerToken.email,
        rsvpNumber: stickerToken.rsvpNumber,
      };
    } catch (error) {
      console.error('Error verifying sticker token:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
