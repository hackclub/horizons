import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class PushToAttendDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  attendApiKey: string;

  @ApiPropertyOptional({ description: 'Defaults to horizons-{slug}' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  attendEventName?: string;
}
