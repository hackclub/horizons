import { Module } from '@nestjs/common';
import { AirtableService } from './airtable.service';
import { AirtableBackfillService } from './airtable-backfill.service';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [AirtableService, AirtableBackfillService, PrismaService],
  exports: [AirtableService],
})
export class AirtableModule {}
