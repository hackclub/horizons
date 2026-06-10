import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BalanceService } from './balance.service';
import { PrismaService } from '../prisma.service';
import { AirtableModule } from '../airtable/airtable.module';

@Module({
  imports: [ConfigModule, AirtableModule],
  providers: [BalanceService, PrismaService],
  exports: [BalanceService],
})
export class BalanceModule {}
