import { Module } from '@nestjs/common';
import { AirtableService } from './airtable.service';
import { AirtableSyncService } from './airtable-sync.service';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [AirtableService, AirtableSyncService, PrismaService],
  exports: [AirtableService],
})
export class AirtableModule {}
