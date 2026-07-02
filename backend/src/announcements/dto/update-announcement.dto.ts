import {
  IsString,
  IsBoolean,
  IsOptional,
  IsArray,
  ArrayUnique,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  previewText?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;

  // When provided, fully replaces the announcement's event tag set (by slug).
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  eventSlugs?: string[];

  @IsOptional()
  @IsBoolean()
  showOnOpen?: boolean;

  @IsOptional()
  @IsBoolean()
  showAsTag?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
