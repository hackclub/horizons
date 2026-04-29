import { Module } from '@nestjs/common';
import { SlackChannelsService } from './slack-channels.service';
import { SlackInteractivityController } from './slack-interactivity.controller';
import { SlackModule } from '../slack/slack.module';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [SlackModule],
  controllers: [SlackInteractivityController],
  providers: [SlackChannelsService, PrismaService],
  exports: [SlackChannelsService],
})
export class SlackChannelsModule {}
