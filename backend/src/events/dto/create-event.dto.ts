import { IsString, IsNumber, IsOptional, IsBoolean, IsDateString, MaxLength, Matches, Min } from 'class-validator';

export class CreateEventDto {
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'Slug must be lowercase alphanumeric with hyphens (e.g. "my-event")',
  })
  slug: string;

  @IsString()
  @MaxLength(200)
  title: string;

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

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsNumber()
  @Min(0)
  hourCost: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
