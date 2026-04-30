import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  CommunityEventsAdminController,
  CommunityEventsController,
} from './community-events.controller';
import { CommunityEventsService } from './community-events.service';

@Module({
  controllers: [CommunityEventsAdminController, CommunityEventsController],
  providers: [CommunityEventsService, PrismaService],
})
export class CommunityEventsModule {}
