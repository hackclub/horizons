import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Query,
  Param,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { HackatimeService } from './hackatime.service';
import { Public } from '../auth/public.decorator';
import {
  HackatimeLinkUrlResponse,
  HackatimeUnlinkResponse,
  HackatimeProjectsResponse,
  TotalNowHackatimeHoursResponse,
  TotalApprovedHoursResponse,
  RecalculateHoursResponse,
  HackatimeAccountStatusResponse,
} from './response';

@ApiTags('Hackatime')
@Controller('api/hackatime')
export class HackatimeController {
  constructor(private hackatimeService: HackatimeService) {}

  @Get('link')
  @ApiOperation({ summary: 'Get Hackatime OAuth URL to link account' })
  @ApiOkResponse({ type: HackatimeLinkUrlResponse })
  async getLinkUrl(@Req() req: Request): Promise<HackatimeLinkUrlResponse> {
    const userId = req.user.userId;
    return this.hackatimeService.getLinkUrl(userId);
  }

  @Get('callback')
  @Public()
  @ApiOperation({ summary: 'Handle Hackatime OAuth callback' })
  @ApiQuery({ name: 'code', required: true })
  @ApiQuery({ name: 'state', required: true })
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.hackatimeService.handleCallback(code, state);
    res.setHeader('Content-Type', 'text/html');
    res.send(
      '<html><body><script>window.close();</script><p>Linked! You can close this tab.</p></body></html>',
    );
  }

  @Post('unlink')
  @ApiOperation({ summary: 'Unlink Hackatime account' })
  @ApiOkResponse({ type: HackatimeUnlinkResponse })
  async unlinkAccount(@Req() req: Request): Promise<HackatimeUnlinkResponse> {
    const userId = req.user.userId;
    return this.hackatimeService.unlinkAccount(userId);
  }

  @Get('projects/unlinked')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get unlinked Hackatime projects for current user' })
  @ApiOkResponse({
    type: HackatimeProjectsResponse,
    description: 'List of unlinked Hackatime projects',
  })
  async getUnlinkedProjects(@Req() req: Request) {
    const userEmail = req.user.email;
    return this.hackatimeService.getUnlinkedHackatimeProjects(userEmail);
  }

  @Get('projects/linked/:id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Get linked Hackatime projects for a specific project',
  })
  @ApiParam({ name: 'id', description: 'Project ID', type: Number })
  @ApiOkResponse({
    type: HackatimeProjectsResponse,
    description: 'List of linked Hackatime projects',
  })
  async getLinkedProjects(@Param('id') id: string, @Req() req: Request) {
    const userEmail = req.user.email;
    const projectId = parseInt(id);

    if (isNaN(projectId)) {
      throw new BadRequestException('Invalid project ID');
    }

    return this.hackatimeService.getLinkedHackatimeProjects(
      userEmail,
      projectId,
    );
  }

  @Get('projects/all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get all Hackatime projects for current user' })
  @ApiOkResponse({
    type: HackatimeProjectsResponse,
    description: 'List of all Hackatime projects',
  })
  async getAllProjects(@Req() req: Request) {
    const userEmail = req.user.email;
    return this.hackatimeService.getAllHackatimeProjects(userEmail);
  }

  @Get('hours/total')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Get total Hackatime hours since now for current user',
  })
  @ApiOkResponse({
    type: TotalNowHackatimeHoursResponse,
    description: 'Total Hackatime hours',
  })
  async getTotalNowHackatimeHours(@Req() req: Request) {
    const userId = req.user.userId;
    const total = await this.hackatimeService.getTotalNowHackatimeHours(userId);
    return { totalNowHackatimeHours: total };
  }

  @Get('hours/approved')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get total approved hours for current user' })
  @ApiOkResponse({
    type: TotalApprovedHoursResponse,
    description: 'Total approved hours',
  })
  async getTotalApprovedHours(@Req() req: Request) {
    const userId = req.user.userId;
    const total = await this.hackatimeService.getTotalApprovedHours(userId);
    return { totalApprovedHours: total };
  }

  @Post('hours/recalculate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Recalculate Hackatime hours for current user' })
  @ApiOkResponse({
    type: RecalculateHoursResponse,
    description: 'Hours recalculated successfully',
  })
  async recalculateNowHackatimeHours(@Req() req: Request) {
    const userId = req.user.userId;
    return this.hackatimeService.recalculateNowHackatimeHours(userId);
  }

  @Get('account')
  @Throttle({ default: { ttl: 3600000, limit: 1000000 } })
  @HttpCode(200)
  @ApiOperation({ summary: 'Check Hackatime account status for current user' })
  @ApiOkResponse({
    type: HackatimeAccountStatusResponse,
    description: 'Hackatime account status',
  })
  async checkHackatimeAccount(@Req() req: Request) {
    const userEmail = req.user.email;
    return this.hackatimeService.checkHackatimeAccountStatus(userEmail);
  }
}
