import { ApiProperty } from '@nestjs/swagger';

export class ReferralResponse {
  @ApiProperty({
    description: "The user's referral code",
    nullable: true,
    type: String,
  })
  referralCode: string | null;

  @ApiProperty({ description: 'Number of users this user has referred' })
  referralCount: number;
}
