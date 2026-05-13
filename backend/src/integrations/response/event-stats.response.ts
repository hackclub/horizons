import { ApiProperty } from '@nestjs/swagger';

export class EventStatsEventInfo {
  @ApiProperty() eventId: number;
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
  @ApiProperty({ nullable: true, type: String }) description: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Event thumbnail / cover image' })
  imageUrl: string | null;
  @ApiProperty({ nullable: true, type: String }) location: string | null;
  @ApiProperty({ nullable: true, type: String }) country: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) startDate: Date;
  @ApiProperty({ type: String, format: 'date-time' }) endDate: Date;
  @ApiProperty({ description: 'Approved-hours goal users must meet for this sub-event' })
  hourCost: number;
  @ApiProperty({ nullable: true, type: Number }) ticketThreshold: number | null;
  @ApiProperty({ nullable: true, type: Number }) ticketCost: number | null;
  @ApiProperty() ticketEnabled: boolean;
  @ApiProperty() isActive: boolean;
}

export class TimeSeriesPoint {
  @ApiProperty({ description: 'ISO date (YYYY-MM-DD)' }) date: string;
  @ApiProperty() value: number;
}

export class QualificationFunnel {
  @ApiProperty({ description: 'Anyone pinned to this event' }) signedUp: number;
  @ApiProperty({ description: 'Pinned users with ≥1h of approved work' }) engaged: number;
  @ApiProperty({ description: 'Pinned users with ≥15h of approved work (RSVP threshold)' })
  rsvped: number;
  @ApiProperty({ description: 'Pinned users with ≥30h of approved work (qualified)' })
  qualified: number;
}

export class EventStatsResponse {
  @ApiProperty({ type: EventStatsEventInfo }) event: EventStatsEventInfo;

  @ApiProperty({ description: 'Total users currently pinned to this sub-event' })
  pinnedCount: number;

  @ApiProperty({ description: 'Pinned users whose approved hours ≥ hourCost' })
  metHourGoal: number;

  @ApiProperty({ description: 'Pinned users whose approved hours < hourCost' })
  notMetHourGoal: number;

  @ApiProperty({
    description:
      "Yesterday's DAU for this sub-event — read from the historical metric snapshot (today is mid-stream and intentionally omitted)",
  })
  dauYesterday: number;

  @ApiProperty({
    type: [TimeSeriesPoint],
    description: 'Cumulative pinned user count, last 30 days, one point per day',
  })
  pinnedTimeline: TimeSeriesPoint[];

  @ApiProperty({
    type: [TimeSeriesPoint],
    description: 'Daily active users for this sub-event, last 30 days',
  })
  dauTimeline: TimeSeriesPoint[];

  @ApiProperty({
    type: QualificationFunnel,
    description: 'Funnel counts among pinned users, by approved hours',
  })
  qualification: QualificationFunnel;

  @ApiProperty({ description: 'ISO timestamp when this response was generated' })
  generatedAt: string;
}
