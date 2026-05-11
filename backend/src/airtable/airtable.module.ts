import { Module } from '@nestjs/common';
import { AirtableService } from './airtable.service';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [AirtableService, PrismaService],
  exports: [AirtableService],
})
export class AirtableModule {}
