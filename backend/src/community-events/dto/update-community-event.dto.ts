import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class UpdateCommunityEventDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @IsDateString()
  @IsOptional()
  start?: string;

  @IsDateString()
  @IsOptional()
  end?: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  tagline?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  joinInfo?: string;

  @IsUrl()
  @IsOptional()
  @MaxLength(2000)
  actionUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  actionLabel?: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
