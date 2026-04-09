import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { MetricsSnapshotService } from './metrics-snapshot.service';
import { PrismaService } from '../prisma.service';
import { SlackModule } from '../slack/slack.module';

@Module({
  imports: [SlackModule],
  controllers: [AdminController],
  providers: [AdminService, MetricsSnapshotService, PrismaService],
})
export class AdminModule {}
