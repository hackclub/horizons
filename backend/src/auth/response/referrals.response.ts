import { ApiProperty } from '@nestjs/swagger';

export class ReferralUserResponse {
  @ApiProperty({ nullable: true })
  slackUserId: string | null;

  @ApiProperty({ nullable: true })
  displayName: string | null;

  @ApiProperty()
  onboardComplete: boolean;

  @ApiProperty()
  createdAt: string;
}

export class ReferralsResponse {
  @ApiProperty({ type: [ReferralUserResponse] })
  referrals: ReferralUserResponse[];
}
