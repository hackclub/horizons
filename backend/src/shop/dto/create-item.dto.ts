import {
  IsString,
  IsNumber,
  IsOptional,
  IsInt,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateItemDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsNumber()
  @Min(0)
  cost: number;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  region?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  maxPerUser?: number;
}
