import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GetEventStatsDto {
  // Accepts the event slug or the event title. Slug is preferred (canonical
  // identifier) but title is supported because external dashboards typically
  // know the human-readable name.
  @ApiProperty({
    description:
      "Sub-event identifier — matches Event.slug first, then Event.title (case-insensitive) as a fallback",
    example: 'shipwrecked',
  })
  @IsString()
  @IsNotEmpty()
  name: string;
}
