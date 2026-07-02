import {
  IsString,
  IsBoolean,
  IsOptional,
  IsArray,
  ArrayUnique,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAnnouncementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  previewText: string;

  @IsString()
  @MinLength(1)
  body: string;

  // Event tags (by slug). Empty / omitted = a global announcement shown to
  // everyone; otherwise shown only to users whose pinned event slug is listed.
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
