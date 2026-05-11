import { Module } from '@nestjs/common';
import { MailController } from './mail.controller';
import { MailService } from './mail.service';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis.service';
import { JobLockService } from '../job-lock.service';

@Module({
  imports: [],
  controllers: [MailController],
  providers: [MailService, PrismaService, RedisService, JobLockService],
  exports: [MailService],
})
export class MailModule {}
