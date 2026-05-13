import { Module } from '@nestjs/common';
import { TicketQualifyEmailService } from './ticket-qualify-email.service';
import { PrismaService } from '../prisma.service';
import { LoopsModule } from '../loops/loops.module';

@Module({
  imports: [LoopsModule],
  providers: [TicketQualifyEmailService, PrismaService],
  exports: [TicketQualifyEmailService],
})
export class TicketQualifyEmailModule {}
