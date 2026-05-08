import { Controller, Get, Query, ParseIntPipe } from '@nestjs/common';
import { ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { StreakService } from './streak.service';
import { StreakLeaderboardEntry } from './dto/streak-leaderboard-response.dto';

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
}
