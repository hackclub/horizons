import { Module } from '@nestjs/common';
import { ReviewerController } from './reviewer.controller';
import { ReviewerService } from './reviewer.service';
import { PrismaService } from '../prisma.service';
import { FraudReviewModule } from '../fraud-review/fraud-review.module';
import { SubmissionApprovalModule } from '../submission-approval/submission-approval.module';

@Module({
  imports: [FraudReviewModule, SubmissionApprovalModule],
  controllers: [ReviewerController],
  providers: [ReviewerService, PrismaService],
})
export class ReviewerModule {}
