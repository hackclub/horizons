import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GetReferralDto {
  @ApiProperty({ description: 'Slack user ID (e.g. U0123ABC)' })
  @IsString()
  @IsNotEmpty()
  slackId: string;
}
