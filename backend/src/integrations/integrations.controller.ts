import {
  Controller,
  Get,
  Headers,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { Public } from '../auth/public.decorator';
import { IntegrationsService } from './integrations.service';
import { GetReferralDto } from './dto/get-referral.dto';
import { GetEventStatsDto } from './dto/get-event-stats.dto';
import { ReferralResponse } from './response/referral.response';
import { EventStatsResponse } from './response/event-stats.response';

@ApiTags('Integrations')
@Controller('api/integrations')
@Public()
export class IntegrationsController {
  constructor(private integrationsService: IntegrationsService) {}

  @Get('referral')
  @ApiOperation({
    summary: "Get a user's referral code and referral count by Slack ID",
  })
  @ApiOkResponse({ type: ReferralResponse })
  async getReferral(@Query() query: GetReferralDto): Promise<ReferralResponse> {
    return this.integrationsService.getReferralBySlackId(query.slackId);
  }

  @Get('event-stats')
  @ApiOperation({
    summary:
      'Get aggregated stats for a sub-event — counts, hour-goal split, DAU, and 30-day timelines for dashboards',
  })
  @ApiHeader({
    name: 'x-api-key',
    description: 'Shared secret from INTEGRATIONS_API_KEY env var',
    required: true,
  })
  @ApiOkResponse({ type: EventStatsResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid x-api-key' })
  async getEventStats(
    @Query() query: GetEventStatsDto,
    @Headers('x-api-key') apiKey: string | undefined,
  ): Promise<EventStatsResponse> {
    this.assertApiKey(apiKey);
    return this.integrationsService.getEventStatsByName(query.name);
  }

  // Constant-time compare against INTEGRATIONS_API_KEY so we don't leak the
  // key length / prefix via response timing. If the env var is unset the
  // endpoint refuses all traffic instead of silently allowing it.
  private assertApiKey(provided: string | undefined) {
    const expected = process.env.INTEGRATIONS_API_KEY;
    if (!expected) {
      throw new UnauthorizedException('Integrations API key not configured');
    }
    if (!provided) {
      throw new UnauthorizedException('Missing x-api-key header');
    }
    const providedBuf = Buffer.from(provided);
    const expectedBuf = Buffer.from(expected);
    if (
      providedBuf.length !== expectedBuf.length ||
      !timingSafeEqual(providedBuf, expectedBuf)
    ) {
      throw new UnauthorizedException('Invalid x-api-key');
    }
  }
}
