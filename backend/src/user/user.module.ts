import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { UserService } from './user.service';
import { PrismaService } from '../prisma.service';
import { SlackModule } from '../slack/slack.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 3600000,
        limit: 1000000,
      },
    ]),
    SlackModule,
  ],
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
