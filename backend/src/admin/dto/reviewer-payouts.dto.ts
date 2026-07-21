import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional } from 'class-validator';

export class UpdateReviewerPayoutFlagsDto {
  @ApiPropertyOptional({
    description: 'Whether this reviewer can be paid out at all.',
  })
  @IsOptional()
  @IsBoolean()
  payoutsEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Whether the boosted 1h/5 rate applies to this reviewer’s post-cutoff reviews (default rate is 1h/15 for everything).',
  })
  @IsOptional()
  @IsBoolean()
  boostedRateEnabled?: boolean;
}

export class ExecuteReviewerPayoutDto {
  @ApiPropertyOptional({
    description:
      'Optimistic-concurrency guard: the owed hours shown in the UI when the admin confirmed. If set and the server-computed hours differ, the payout is rejected with 409 so a stale page never pays a different amount.',
  })
  @IsOptional()
  @IsNumber()
  expectedHours?: number;
}

export class ReviewerPayoutSummaryResponse {
  @ApiProperty()
  userId: number;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty({ type: String, nullable: true })
  slackUserId: string | null;

  @ApiProperty()
  payoutsEnabled: boolean;

  @ApiProperty()
  boostedRateEnabled: boolean;

  @ApiProperty({ description: 'Total reviews performed before the rate cutoff.' })
  reviewsBeforeCutoff: number;

  @ApiProperty({ description: 'Total reviews performed on/after the rate cutoff.' })
  reviewsAfterCutoff: number;

  @ApiProperty({ description: 'Pre-cutoff reviews not yet counted in a payout.' })
  unpaidBefore: number;

  @ApiProperty({ description: 'Post-cutoff reviews not yet counted in a payout.' })
  unpaidAfter: number;

  @ApiProperty({
    description:
      'Whole hours payable right now under the reviewer’s current rate flags. Boosted: floor(unpaidBefore/15) + floor(unpaidAfter/5). Unboosted: floor((unpaidBefore+unpaidAfter)/15).',
  })
  owedHours: number;

  @ApiProperty({
    description:
      'Unpaid reviews that don’t fill a whole block yet and will carry over to the next payout.',
  })
  carryover: number;

  @ApiProperty({ description: 'Sum of hours across all past payouts.' })
  totalPaidHours: number;

  @ApiProperty({ type: Date, nullable: true })
  lastPayoutAt: Date | null;
}

export class ReviewerPayoutListResponse {
  @ApiProperty({ type: [ReviewerPayoutSummaryResponse] })
  reviewers: ReviewerPayoutSummaryResponse[];

  @ApiProperty({ description: 'Rate cutoff instant (July 13 2026, 00:00 US Eastern).' })
  rateCutoff: Date;
}

export class ReviewerPayoutFlagsResponse {
  @ApiProperty()
  userId: number;

  @ApiProperty()
  payoutsEnabled: boolean;

  @ApiProperty()
  boostedRateEnabled: boolean;
}

export class ReviewerPayoutHistoryEntryResponse {
  @ApiProperty()
  payoutId: number;

  @ApiProperty()
  hours: number;

  @ApiProperty()
  reviewsCountedBefore: number;

  @ApiProperty()
  reviewsCountedAfter: number;

  @ApiProperty({ description: 'Whether the boosted 1h/5 rate was active for this payout.' })
  boostedRateApplied: boolean;

  @ApiProperty()
  transactionId: number;

  @ApiProperty({ description: 'True when the backing transaction was refunded.' })
  refunded: boolean;

  @ApiProperty()
  createdByUserId: number;

  @ApiProperty()
  createdAt: Date;
}

export class ReviewerPayoutHistoryResponse {
  @ApiProperty({ type: [ReviewerPayoutHistoryEntryResponse] })
  payouts: ReviewerPayoutHistoryEntryResponse[];
}

export class ExecuteReviewerPayoutResponse {
  @ApiProperty()
  payoutId: number;

  @ApiProperty()
  transactionId: number;

  @ApiProperty()
  hours: number;

  @ApiProperty()
  reviewsCountedBefore: number;

  @ApiProperty()
  reviewsCountedAfter: number;

  @ApiProperty()
  boostedRateApplied: boolean;

  @ApiProperty()
  remainingUnpaidBefore: number;

  @ApiProperty()
  remainingUnpaidAfter: number;

  @ApiProperty({ description: 'Reviewer’s balance after the payout.' })
  newBalance: number;

  @ApiProperty()
  createdAt: Date;
}
