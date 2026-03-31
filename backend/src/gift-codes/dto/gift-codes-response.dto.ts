import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GiftCodeResponse {
  @ApiProperty()
  giftCodeId: number;

  @ApiProperty()
  code: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  itemDescription: string;

  @ApiProperty()
  imageUrl: string;

  @ApiProperty()
  filloutUrl: string;

  @ApiProperty()
  isClaimed: boolean;

  @ApiPropertyOptional()
  emailSentAt?: Date;

  @ApiPropertyOptional()
  firstName?: string;

  @ApiPropertyOptional()
  lastName?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class GiftCodePublicResponse {
  @ApiProperty()
  imageUrl: string;

  @ApiProperty()
  itemDescription: string;

  @ApiProperty()
  isClaimed: boolean;
}

export class GiftCodeClaimResponse {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  isClaimed: boolean;
}

class SendGiftCodeResult {
  @ApiProperty()
  email: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  success: boolean;

  @ApiPropertyOptional()
  error?: string;
}

export class SendGiftCodesResponse {
  @ApiProperty()
  total: number;

  @ApiProperty()
  successful: number;

  @ApiProperty()
  failed: number;

  @ApiProperty({ type: [SendGiftCodeResult] })
  results: SendGiftCodeResult[];
}
