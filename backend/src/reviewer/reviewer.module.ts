import { Module } from '@nestjs/common';
import { ReviewerController } from './reviewer.controller';
import { ReviewerService } from './reviewer.service';
import { PrismaService } from '../prisma.service';
import { FraudReviewModule } from '../fraud-review/fraud-review.module';
import { SubmissionApprovalModule } from '../submission-approval/submission-approval.module';
import { ManifestModule } from '../manifest/manifest.module';
import { SlackModule } from '../slack/slack.module';
import { HackatimeModule } from '../hackatime/hackatime.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [
    FraudReviewModule,
    SubmissionApprovalModule,
    ManifestModule,
    SlackModule,
    HackatimeModule,
    MetricsModule,
  ],
  controllers: [ReviewerController],
  providers: [ReviewerService, PrismaService],
})
export class ReviewerModule {}
