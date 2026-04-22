import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma.service';
import { AirtableModule } from '../airtable/airtable.module';
import { CachetModule } from '../cachet/cachet.module';
import { SlackChannelsModule } from '../slack-channels/slack-channels.module';

@Module({
  imports: [AirtableModule, CachetModule, SlackChannelsModule],
  controllers: [AuthController],
  providers: [AuthService, PrismaService],
})
export class AuthModule {}
