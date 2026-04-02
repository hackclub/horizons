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

@Module({
  imports: [AirtableModule],
  controllers: [ProjectsController, ProjectsAuthController],
  providers: [ProjectsService, PrismaService, RedisService, PosthogService],
})
export class ProjectsModule {}
