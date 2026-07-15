import { IsOptional, IsString, IsNumber, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Superadmin edit of a submission's snapshot fields (the values captured at
 * submit time). Verdict fields (status / approved hours / feedback) are NOT
 * here — those go through the reviewer review endpoint, which owns the
 * side effects.
 */
export class UpdateAdminSubmissionDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  playableUrl?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  repoUrl?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  screenshotUrl?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @Min(0)
  @IsOptional()
  hackatimeHours?: number;
}
