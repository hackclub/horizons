import { Controller, Get, Post, Body, HttpCode } from '@nestjs/common';
import { MailService } from './mail.service';
import { SendEmailDto } from './dto/send-email.dto';
import { debugLog } from '../utils/debug-log';

@Controller()
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post('/send-rsvp-email')
  @HttpCode(200)
  async sendRsvpEmail(@Body() body: SendEmailDto) {
    debugLog('=== MAIL CONTROLLER RECEIVED ===');
    debugLog('Full body:', JSON.stringify(body, null, 2));
    debugLog(
      'body.rafflePosition:',
      body.rafflePosition,
      'type:',
      typeof body.rafflePosition,
    );
    return await this.mailService.sendRsvpEmail(
      body.email,
      body.rsvpNumber,
      body.rafflePosition,
      body.stickerToken,
    );
  }

  @Post('/process-scheduled-emails')
  @HttpCode(200)
  async processScheduledEmails() {
    await this.mailService.processScheduledEmails();
    return { success: true, message: 'Scheduled emails processed' };
  }

  @Get()
  getHello(): string {
    return this.mailService.getHello();
  }
}
