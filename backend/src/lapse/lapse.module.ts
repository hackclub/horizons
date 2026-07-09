import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LapseController } from './lapse.controller';
import { LapseService } from './lapse.service';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [ConfigModule],
  controllers: [LapseController],
  providers: [LapseService, PrismaService],
  exports: [LapseService],
})
export class LapseModule {}
