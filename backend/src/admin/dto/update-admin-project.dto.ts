import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ProjectType } from '../../../generated/prisma/client';

export class UpdateAdminProjectDto {
  @ApiPropertyOptional({ maxLength: 30 })
  @IsString()
  @IsOptional()
  @MaxLength(30)
  projectTitle?: string;

  @ApiPropertyOptional({ enum: ProjectType })
  @IsEnum(ProjectType)
  @IsOptional()
  projectType?: ProjectType;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUrl()
  @IsOptional()
  playableUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUrl()
  @IsOptional()
  repoUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUrl()
  @IsOptional()
  readmeUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUrl()
  @IsOptional()
  journalUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUrl()
  @IsOptional()
  screenshotUrl?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  nowHackatimeProjects?: string[];

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  adminComment?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @IsOptional()
  hoursJustification?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(0)
  @IsOptional()
  approvedHours?: number | null;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isLocked?: boolean;
}
