import { Module } from '@nestjs/common';
import { ManifestService } from './manifest.service';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [ManifestService, PrismaService],
  exports: [ManifestService],
})
export class ManifestModule {}
