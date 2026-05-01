import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HuddleStatusResponse {
  @ApiProperty()
  channelId: string;

  @ApiProperty({ description: 'Whether a huddle is currently active in the channel' })
  active: boolean;

  @ApiPropertyOptional({ type: String, nullable: true })
  callId: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Slack user ID of the huddle creator' })
  createdBy: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Unix epoch seconds when the huddle started' })
  startedAt: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Slack message ts that anchors the huddle thread' })
  threadRootTs: string | null;

  @ApiProperty({ type: [String] })
  activeMembers: string[];

  @ApiProperty({ type: [String] })
  droppedMembers: string[];

  @ApiProperty()
  memberCount: number;
}
