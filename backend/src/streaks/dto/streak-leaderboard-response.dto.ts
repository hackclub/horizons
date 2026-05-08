import { ApiProperty } from '@nestjs/swagger';

export class StreakLeaderboardEntry {
  @ApiProperty({ description: 'Rank starting at 1' })
  rank: number;

  @ApiProperty({ description: 'Slack display name for the user' })
  displayName: string;

  @ApiProperty({ description: 'Current consecutive-day Hackatime streak' })
  currentStreak: number;
}
