import { ApiProperty } from '@nestjs/swagger';

export class StreakTodayResponse {
  @ApiProperty({ description: 'Seconds of qualifying coding logged today (user-local).' })
  todaySeconds: number;

  @ApiProperty({ description: 'Whether today has already qualified for the streak.' })
  qualified: boolean;

  @ApiProperty({ description: 'Seconds required per day to extend the streak.' })
  qualifyingSeconds: number;
}
