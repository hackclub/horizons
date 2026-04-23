import { Module } from '@nestjs/common';
import { FraudReviewService } from './fraud-review.service';
import { PrismaService } from '../prisma.service';
import { SubmissionApprovalModule } from '../submission-approval/submission-approval.module';

@Module({
  imports: [SubmissionApprovalModule],
  providers: [FraudReviewService, PrismaService],
  exports: [FraudReviewService],
})
export class FraudReviewModule {}
