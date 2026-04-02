import { Controller, Get, Post, Body, HttpCode } from '@nestjs/common';
import { Public } from '../auth/public.decorator';

@Controller()
@Public()
export class HealthController {
  constructor() {}

  @Get('/api/healthcheck')
  @HttpCode(200)
  async healthCheck() {
    return { success: true, message: 'Health check passed' };
  }
}
