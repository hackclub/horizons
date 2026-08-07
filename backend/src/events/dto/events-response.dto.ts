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

  @ApiProperty({ type: String, nullable: true })
  country: string | null;

  @ApiProperty()
  startDate: Date;

  @ApiProperty({ type: Date, nullable: true })
  endDate: Date | null;

  @ApiProperty()
  hourCost: number;

  @ApiProperty({ type: Number, nullable: true })
  ticketThreshold: number | null;

  @ApiProperty({ type: Number, nullable: true })
  ticketCost: number | null;

  @ApiProperty()
  ticketEnabled: boolean;

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

export class TicketStatusResponse {
  @ApiProperty()
  slug: string;

  @ApiProperty({ type: Number, nullable: true })
  ticketThreshold: number | null;

  @ApiProperty({ type: Number, nullable: true })
  ticketCost: number | null;

  @ApiProperty()
  ticketEnabled: boolean;

  @ApiProperty()
  hasTicket: boolean;

  @ApiProperty()
  balance: number;

  @ApiProperty()
  approvedHours: number;
}

export class TicketTransactionResponse {
  @ApiProperty()
  transactionId: number;

  @ApiProperty()
  newBalance: number;
}

export class PushToAttendFailure {
  @ApiProperty()
  email: string;

  @ApiProperty()
  error: string;
}

export class PushToAttendResponse {
  @ApiProperty({ description: 'Attend event name the participants were pushed to' })
  attendEventName: string;

  @ApiProperty({ description: 'Active ticket holders found for the event' })
  total: number;

  @ApiProperty({ description: 'Participants successfully pushed to Attend' })
  pushed: number;

  @ApiProperty({ description: 'Participants Attend already had (409)' })
  alreadyAdded: number;

  @ApiProperty({ type: [PushToAttendFailure] })
  failures: PushToAttendFailure[];
}

export class AttendeeResponse {
  @ApiProperty()
  userId: number;

  @ApiProperty()
  email: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty({ type: Date, nullable: true })
  ticketAt: Date | null;

  @ApiProperty()
  totalSpent: number;
}
