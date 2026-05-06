import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { StreakService } from './streak.service';

@Module({
  providers: [StreakService, PrismaService],
  exports: [StreakService],
})
export class StreakModule {}
