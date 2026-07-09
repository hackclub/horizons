import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LapseUserResponse {
  @ApiProperty()
  id: string;

  @ApiProperty()
  handle: string;

  @ApiProperty()
  displayName: string;
}

export class LapseTimelapseResponse {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  hackatimeProject: string | null;

  /** Streamable video URL. Null while the timelapse is still processing. */
  @ApiPropertyOptional({ type: String, nullable: true })
  playbackUrl: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  thumbnailUrl: string | null;

  /** Duration in seconds. */
  @ApiProperty()
  duration: number;

  @ApiProperty()
  visibility: string;

  @ApiProperty()
  createdAt: string;
}

export class ProjectLapsesResponse {
  @ApiPropertyOptional({ type: LapseUserResponse, nullable: true })
  lapseUser: LapseUserResponse | null;

  /** Timelapses published against this project's linked Hackatime projects. */
  @ApiProperty({ type: [LapseTimelapseResponse] })
  timelapses: LapseTimelapseResponse[];

  /** The user's remaining timelapses not linked to this project. */
  @ApiProperty()
  otherTimelapseCount: number;

  @ApiPropertyOptional()
  error?: string;
}
