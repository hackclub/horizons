import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsInt,
  MaxLength,
  Min,
} from 'class-validator';


export class UpdateItemDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  cost?: number;

  @IsString({ each: true })
  @IsOptional()
  regions?: string[];

  @IsInt()
  @IsOptional()
  @Min(1)
  maxPerUser?: number | null;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
