import { Controller, Get, Post, Query, Req, ParseIntPipe } from '@nestjs/common';
import { ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { StreakService } from './streak.service';
import { StreakLeaderboardEntry } from './dto/streak-leaderboard-response.dto';
import { StreakRefreshResponse } from './dto/streak-refresh-response.dto';
import { StreakTodayResponse } from './dto/streak-today-response.dto';

@Controller('api/streaks')
export class StreakController {
  constructor(private streakService: StreakService) {}

  @Get('leaderboard')
  @ApiOkResponse({ type: [StreakLeaderboardEntry] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getLeaderboard(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<StreakLeaderboardEntry[]> {
    const clamped = Math.min(Math.max(limit ?? 10, 1), 50);
    return this.streakService.getLeaderboard(clamped);
  }

  @Get('today')
  @ApiOkResponse({ type: StreakTodayResponse })
  async today(@Req() req: Request): Promise<StreakTodayResponse> {
    return this.streakService.getTodayProgress(req.user.userId);
  }

  @Post('refresh')
  @ApiOkResponse({ type: StreakRefreshResponse })
  async refresh(@Req() req: Request): Promise<StreakRefreshResponse> {
    return this.streakService.refreshUserActivity(req.user.userId);
  }
}
