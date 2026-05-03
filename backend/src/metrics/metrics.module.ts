import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { PrismaService } from '../prisma.service';
import { FraudReviewModule } from '../fraud-review/fraud-review.module';

@Module({
  imports: [FraudReviewModule],
  providers: [MetricsService, PrismaService],
  exports: [MetricsService],
})
export class MetricsModule {}
