import { IsOptional, IsDateString, ValidateIf } from 'class-validator';

export class UpdateUserDto {
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  @IsOptional()
  hackatimeStartDate?: string | null;
}
