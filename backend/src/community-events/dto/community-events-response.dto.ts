import { ApiProperty } from '@nestjs/swagger';

export class CommunityEventResponse {
  @ApiProperty()
  communityEventId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  start: Date;

  @ApiProperty()
  end: Date;

  @ApiProperty({ type: String, nullable: true })
  tagline: string | null;

  @ApiProperty({ type: String, nullable: true })
  joinInfo: string | null;

  @ApiProperty({ type: String, nullable: true })
  actionUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  actionLabel: string | null;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class DeleteCommunityEventResponse {
  @ApiProperty()
  deleted: boolean;

  @ApiProperty()
  communityEventId: string;
}
