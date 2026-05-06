import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [MetricsService, PrismaService],
  exports: [MetricsService],
})
export class MetricsModule {}
