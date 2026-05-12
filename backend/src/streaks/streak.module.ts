import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { StreakController } from './streak.controller';
import { StreakService } from './streak.service';
import { StreakCronService } from './streak-cron.service';

@Module({
  controllers: [StreakController],
  providers: [StreakService, StreakCronService, PrismaService],
  exports: [StreakService],
})
export class StreakModule {}
