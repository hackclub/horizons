import { Module } from '@nestjs/common';
import { FraudReviewService } from './fraud-review.service';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [FraudReviewService, PrismaService],
  exports: [FraudReviewService],
})
export class FraudReviewModule {}
