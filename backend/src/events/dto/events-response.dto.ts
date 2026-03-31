import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EventResponse {
  @ApiProperty()
  eventId: number;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: String, nullable: true })
  imageUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  location: string | null;

  @ApiProperty()
  startDate: Date;

  @ApiProperty({ type: Date, nullable: true })
  endDate: Date | null;

  @ApiProperty()
  hourCost: number;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class AdminEventResponse extends EventResponse {
  @ApiProperty()
  _count: { pinnedBy: number };
}

export class DeleteEventResponse {
  @ApiProperty()
  deleted: boolean;

  @ApiProperty()
  slug: string;
}

class PinnedEventDetailResponse {
  @ApiProperty()
  eventId: number;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: String, nullable: true })
  imageUrl: string | null;

  @ApiProperty()
  startDate: Date;

  @ApiProperty({ type: Date, nullable: true })
  endDate: Date | null;

  @ApiProperty()
  hourCost: number;

  @ApiProperty()
  isActive: boolean;
}

export class PinnedEventResponse {
  @ApiProperty()
  userId: number;

  @ApiProperty()
  eventId: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: PinnedEventDetailResponse })
  event: PinnedEventDetailResponse;
}

export class RemovedEventResponse {
  @ApiProperty()
  removed: boolean;
}
