import { Module } from '@nestjs/common';
import { SubmissionApprovalService } from './submission-approval.service';
import { PrismaService } from '../prisma.service';
import { AirtableModule } from '../airtable/airtable.module';
import { MailModule } from '../mail/mail.module';
import { SlackModule } from '../slack/slack.module';
import { ManifestModule } from '../manifest/manifest.module';

@Module({
  imports: [AirtableModule, MailModule, SlackModule, ManifestModule],
  providers: [SubmissionApprovalService, PrismaService],
  exports: [SubmissionApprovalService],
})
export class SubmissionApprovalModule {}
