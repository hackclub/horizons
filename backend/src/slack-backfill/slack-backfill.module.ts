import { Module } from '@nestjs/common';
import { SlackBackfillService } from './slack-backfill.service';
import { SlackInteractivityController } from './slack-interactivity.controller';
import { SlackModule } from '../slack/slack.module';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [SlackModule],
  controllers: [SlackInteractivityController],
  providers: [SlackBackfillService, PrismaService],
  exports: [SlackBackfillService],
})
export class SlackBackfillModule {}
