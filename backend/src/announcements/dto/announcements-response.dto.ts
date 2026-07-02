import { ApiProperty } from '@nestjs/swagger';

export class AnnouncementEventTag {
  @ApiProperty()
  slug: string;

  @ApiProperty()
  title: string;
}

/** Admin-facing shape — full record including publish state. */
export class AnnouncementResponse {
  @ApiProperty()
  announcementId: number;

  @ApiProperty()
  title: string;

  @ApiProperty()
  previewText: string;

  @ApiProperty()
  body: string;

  @ApiProperty()
  showOnOpen: boolean;

  @ApiProperty()
  showAsTag: boolean;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: [String] })
  eventSlugs: string[];
}

/** User-facing shape — adds per-user `isRead`, omits publish/admin state. */
export class UserAnnouncementResponse {
  @ApiProperty()
  announcementId: number;

  @ApiProperty()
  title: string;

  @ApiProperty()
  previewText: string;

  @ApiProperty()
  body: string;

  @ApiProperty()
  showOnOpen: boolean;

  @ApiProperty()
  showAsTag: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: [AnnouncementEventTag] })
  events: AnnouncementEventTag[];

  @ApiProperty()
  isRead: boolean;
}

export class DeleteAnnouncementResponse {
  @ApiProperty()
  success: boolean;
}

export class MarkReadResponse {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  isRead: boolean;
}
