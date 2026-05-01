import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { MailModule } from './mail/mail.module';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { AdminModule } from './admin/admin.module';
import { ReviewerModule } from './reviewer/reviewer.module';
import { HealthModule } from './health/health.module';
import { UploadsModule } from './uploads/uploads.module';
import { ShopModule } from './shop/shop.module';
import { EventsModule } from './events/events.module';
import { CommunityEventsModule } from './community-events/community-events.module';
import { GiftCodesModule } from './gift-codes/gift-codes.module';
import { SlackModule } from './slack/slack.module';
import { SlackChannelsModule } from './slack-channels/slack-channels.module';
import { HuddlesModule } from './huddles/huddles.module';
import { HackatimeModule } from './hackatime/hackatime.module';
import { UtilsModule } from './utils/utils.module';
import { GitHubModule } from './github/github.module';
import { ManifestModule } from './manifest/manifest.module';
import { AuthGuard } from './auth/auth.guard';
import { PrismaService } from './prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot(),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 3600000,
        limit: 1000000,
      },
    ]),
    MailModule,
    UserModule,
    AuthModule,
    ProjectsModule,
    AdminModule,
    ReviewerModule,
    HealthModule,
    UploadsModule,
    ShopModule,
    EventsModule,
    CommunityEventsModule,
    GiftCodesModule,
    SlackModule,
    SlackChannelsModule,
    HuddlesModule,
    HackatimeModule,
    UtilsModule,
    GitHubModule,
    ManifestModule,
  ],
  providers: [
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
