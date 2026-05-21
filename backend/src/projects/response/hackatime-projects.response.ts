import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HackatimeProjectsInfoResponse {
  @ApiProperty({ description: 'Project ID' })
  projectId: number;

  @ApiPropertyOptional({
    description: 'Linked Hackatime project names',
    type: [String],
  })
  hackatimeProjects: string[];

  @ApiPropertyOptional({
    description: 'Live Hackatime hours calculated on request',
  })
  currentHackatimeHours: number;

  @ApiPropertyOptional({
    description: 'Hours per linked Hackatime project, calculated live',
    type: 'object',
    additionalProperties: { type: 'number' },
  })
  hackatimeProjectHours: Record<string, number>;

  @ApiPropertyOptional({
    description:
      'Hours tallied at the time of the last submission; null if never submitted',
    nullable: true,
  })
  lastSubmittedHours: number | null;

  @ApiPropertyOptional({
    description:
      'Hours tallied at the time of the most recent approved submission; null if never approved. Used by the ship gate to require an additional 3 hours per reship.',
    nullable: true,
  })
  lastApprovedHours: number | null;

  @ApiProperty({
    description:
      'Consecutive days the user has logged >=1 hour on linked Hackatime projects, with timezone-aware lazy decay applied',
  })
  currentStreak: number;

  @ApiProperty({
    description: 'Longest streak ever achieved by the user',
  })
  longestStreak: number;
}
