import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ManifestModule } from '../manifest/manifest.module';
import { DedupeApprovedHoursBackfillService } from './dedupe-approved-hours.service';

@Module({
  imports: [ManifestModule],
  providers: [DedupeApprovedHoursBackfillService, PrismaService],
})
export class BackfillModule {}
