import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BalanceService } from './balance.service';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [ConfigModule],
  providers: [BalanceService, PrismaService],
  exports: [BalanceService],
})
export class BalanceModule {}
