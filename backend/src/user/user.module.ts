import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { UserService } from './user.service';
import { DashboardController } from './dashboard.controller';
import { PrismaService } from '../prisma.service';
import { MailModule } from '../mail/mail.module';
import { SlackModule } from '../slack/slack.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 3600000,
        limit: 1000000,
      },
    ]),
    MailModule,
    SlackModule,
  ],
  controllers: [DashboardController],
  providers: [
    UserService,
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class UserModule {}
