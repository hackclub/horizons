import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { ProjectType } from '../../../generated/prisma/client';

export class CreateProjectDto {
  @ApiProperty({ description: 'Project title', maxLength: 30 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  projectTitle: string;

  @ApiProperty({ description: 'Project type', enum: ProjectType })
  @IsEnum(ProjectType)
  @IsNotEmpty()
  projectType: ProjectType;

  @ApiProperty({ description: 'Project description' })
  @IsString()
  @IsNotEmpty()
  projectDescription: string;

  @ApiPropertyOptional({ description: 'Playable URL for the project' })
  @IsUrl()
  @IsOptional()
  playableUrl?: string;

  @ApiPropertyOptional({ description: 'Repository URL' })
  @IsUrl()
  @IsOptional()
  repoUrl?: string;

  @ApiPropertyOptional({ description: 'README URL' })
  @IsUrl()
  @IsOptional()
  readmeUrl?: string;

  @ApiPropertyOptional({ description: 'Screenshot URL' })
  @IsUrl()
  @IsOptional()
  screenshotUrl?: string;

  @ApiPropertyOptional({ description: 'Linked Hackatime project names', type: [String] })
  @IsArray()
  @IsOptional()
  @ArrayMinSize(1)
  @IsString({ each: true })
  nowHackatimeProjects?: string[];
}
