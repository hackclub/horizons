import { IsString, IsNumber, MaxLength, Min } from 'class-validator';

export class CreateVariantDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsNumber()
  @Min(0)
  cost: number;
}
