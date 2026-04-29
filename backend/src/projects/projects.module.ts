import { Module } from '@nestjs/common';
import {
  ProjectsController,
  ProjectsAuthController,
} from './projects.controller';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis.service';
import { PosthogService } from '../posthog/posthog.service';
import { AirtableModule } from '../airtable/airtable.module';
import { FraudReviewModule } from '../fraud-review/fraud-review.module';
import { ManifestModule } from '../manifest/manifest.module';

@Module({
  imports: [AirtableModule, FraudReviewModule, ManifestModule],
  controllers: [ProjectsController, ProjectsAuthController],
  providers: [ProjectsService, PrismaService, RedisService, PosthogService],
})
export class ProjectsModule {}
