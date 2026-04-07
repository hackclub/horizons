import { ApiProperty } from '@nestjs/swagger';

export class ReferralUserResponse {
  @ApiProperty()
  username: string;

  @ApiProperty({ nullable: true })
  slackUserId: string | null;

  @ApiProperty()
  onboardComplete: boolean;

  @ApiProperty()
  createdAt: string;
}

export class ReferralsResponse {
  @ApiProperty({ type: [ReferralUserResponse] })
  referrals: ReferralUserResponse[];
}
