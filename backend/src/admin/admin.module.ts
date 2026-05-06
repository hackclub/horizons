import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { MetricsSnapshotService } from './metrics-snapshot.service';
import { PrismaService } from '../prisma.service';
import { SlackModule } from '../slack/slack.module';
import { ManifestModule } from '../manifest/manifest.module';
import { MetricsModule } from '../metrics/metrics.module';
import { FraudReviewModule } from '../fraud-review/fraud-review.module';
import { StreakModule } from '../streaks/streak.module';

@Module({
  imports: [
    SlackModule,
    ManifestModule,
    MetricsModule,
    FraudReviewModule,
    StreakModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, MetricsSnapshotService, PrismaService],
})
export class AdminModule {}
