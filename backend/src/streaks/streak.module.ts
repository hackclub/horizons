import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { StreakController } from './streak.controller';
import { StreakService } from './streak.service';

@Module({
  controllers: [StreakController],
  providers: [StreakService, PrismaService],
  exports: [StreakService],
})
export class StreakModule {}
