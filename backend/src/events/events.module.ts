import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import {
  EventsController,
  EventsAuthController,
  EventsAdminController,
} from './events.controller';
import { PrismaService } from '../prisma.service';
import { SlackChannelsModule } from '../slack-channels/slack-channels.module';
import { SlackModule } from '../slack/slack.module';
import { BalanceModule } from '../balance/balance.module';

@Module({
  imports: [SlackChannelsModule, SlackModule, BalanceModule],
  controllers: [EventsAdminController, EventsAuthController, EventsController],
  providers: [EventsService, PrismaService],
})
export class EventsModule {}
