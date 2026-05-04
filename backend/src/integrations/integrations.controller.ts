import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { IntegrationsService } from './integrations.service';
import { GetReferralDto } from './dto/get-referral.dto';
import { ReferralResponse } from './response/referral.response';

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
}
