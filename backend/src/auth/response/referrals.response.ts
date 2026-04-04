import { ApiProperty } from '@nestjs/swagger';

export class ReferralUserResponse {
  @ApiProperty()
  username: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  onboardComplete: boolean;

  @ApiProperty()
  createdAt: string;
}

export class ReferralsResponse {
  @ApiProperty({ type: [ReferralUserResponse] })
  referrals: ReferralUserResponse[];
}
