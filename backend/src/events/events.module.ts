import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import {
  EventsController,
  EventsAuthController,
  EventsAdminController,
} from './events.controller';
import { PrismaService } from '../prisma.service';
import { SlackChannelsModule } from '../slack-channels/slack-channels.module';

@Module({
  imports: [SlackChannelsModule],
  controllers: [EventsAdminController, EventsAuthController, EventsController],
  providers: [EventsService, PrismaService],
})
export class EventsModule {}
