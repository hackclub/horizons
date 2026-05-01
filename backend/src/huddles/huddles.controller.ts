import {
  Controller,
  Get,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { HuddlesService } from './huddles.service';
import { HuddleStatusResponse } from './dto/huddle-status-response.dto';

@Controller('api/huddles')
export class HuddlesController {
  constructor(private huddlesService: HuddlesService) {}

  /** Check whether a huddle is currently active in the given Slack channel. */
  @Get('status')
  @ApiOkResponse({ type: HuddleStatusResponse })
  async getStatus(
    @Query('channel') channelId: string,
  ): Promise<HuddleStatusResponse> {
    if (!channelId) {
      throw new BadRequestException('Missing required query parameter: channel');
    }
    return this.huddlesService.getHuddleStatus(channelId);
  }
}
