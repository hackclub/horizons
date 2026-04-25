import { Module } from '@nestjs/common';
import { ManifestService } from './manifest.service';
import { ManifestBackfillService } from './manifest-backfill.service';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [ManifestService, ManifestBackfillService, PrismaService],
  exports: [ManifestService],
})
export class ManifestModule {}
