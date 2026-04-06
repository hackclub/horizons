import { Module } from '@nestjs/common';
import { ReviewerController } from './reviewer.controller';
import { ReviewerService } from './reviewer.service';
import { PrismaService } from '../prisma.service';
import { AirtableModule } from '../airtable/airtable.module';
import { MailModule } from '../mail/mail.module';
import { SlackModule } from '../slack/slack.module';
import { FraudReviewModule } from '../fraud-review/fraud-review.module';

@Module({
  imports: [AirtableModule, MailModule, SlackModule, FraudReviewModule],
  controllers: [ReviewerController],
  providers: [ReviewerService, PrismaService],
})
export class ReviewerModule {}
