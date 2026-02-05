import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma.service';
import { MailService } from '../mail/mail.service';
import { JobLockService } from '../job-lock.service';
import { RedisService } from '../redis.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, PrismaService, MailService, JobLockService, RedisService],
})
export class AuthModule {}
