import { Module } from '@nestjs/common';
import { ProjectsController, ProjectsAuthController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { RedisService } from '../redis.service';
import { PosthogService } from '../posthog/posthog.service';

@Module({
  controllers: [ProjectsController, ProjectsAuthController],
  providers: [ProjectsService, PrismaService, AuthGuard, RedisService, PosthogService],
})
export class ProjectsModule {}
