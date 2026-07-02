import { Module } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import {
  AnnouncementsAuthController,
  AnnouncementsAdminController,
} from './announcements.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [AnnouncementsAdminController, AnnouncementsAuthController],
  providers: [AnnouncementsService, PrismaService],
})
export class AnnouncementsModule {}
