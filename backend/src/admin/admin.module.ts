import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { MetricsSnapshotService } from './metrics-snapshot.service';
import { GeocodingService } from './geocoding.service';
import { PrismaService } from '../prisma.service';
import { SlackModule } from '../slack/slack.module';
import { CachetModule } from '../cachet/cachet.module';

@Module({
  imports: [SlackModule, CachetModule],
  controllers: [AdminController],
  providers: [AdminService, MetricsSnapshotService, GeocodingService, PrismaService],
})
export class AdminModule {}
