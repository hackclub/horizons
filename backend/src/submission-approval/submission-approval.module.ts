import { Module } from '@nestjs/common';
import { SubmissionApprovalService } from './submission-approval.service';
import { PrismaService } from '../prisma.service';
import { AirtableModule } from '../airtable/airtable.module';
import { SlackModule } from '../slack/slack.module';
import { LoopsModule } from '../loops/loops.module';
import { TicketQualifyEmailModule } from '../ticket-qualify-email/ticket-qualify-email.module';

@Module({
  imports: [
    AirtableModule,
    SlackModule,
    LoopsModule,
    TicketQualifyEmailModule,
  ],
  providers: [SubmissionApprovalService, PrismaService],
  exports: [SubmissionApprovalService],
})
export class SubmissionApprovalModule {}
