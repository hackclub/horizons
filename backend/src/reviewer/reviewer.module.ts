import { Module } from '@nestjs/common';
import { ReviewerController } from './reviewer.controller';
import { ReviewerService } from './reviewer.service';
import { PrismaService } from '../prisma.service';
import { AirtableModule } from '../airtable/airtable.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [AirtableModule, MailModule],
  controllers: [ReviewerController],
  providers: [ReviewerService, PrismaService],
})
export class ReviewerModule {}
