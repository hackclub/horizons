import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsDateString,
  MaxLength,
  Matches,
  Min,
} from 'class-validator';

export class UpdateEventDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message:
      'Slug must be lowercase alphanumeric with hyphens (e.g. "my-event")',
  })
  slug?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  location?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  country?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  hourCost?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  rsvpCost?: number | null;

  @IsNumber()
  @Min(0)
  @IsOptional()
  ticketCost?: number | null;

  @IsBoolean()
  @IsOptional()
  rsvpEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  ticketEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
