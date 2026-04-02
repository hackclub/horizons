import { ApiProperty } from '@nestjs/swagger';

export class ReferralCodeResponse {
  @ApiProperty()
  referralCode: string;
}
