import { Module } from '@nestjs/common';
import { SubmissionApprovalService } from './submission-approval.service';
import { PrismaService } from '../prisma.service';
import { AirtableModule } from '../airtable/airtable.module';
import { SlackModule } from '../slack/slack.module';
import { ManifestModule } from '../manifest/manifest.module';
import { LoopsModule } from '../loops/loops.module';

@Module({
  imports: [AirtableModule, SlackModule, ManifestModule, LoopsModule],
  providers: [SubmissionApprovalService, PrismaService],
  exports: [SubmissionApprovalService],
})
export class SubmissionApprovalModule {}
