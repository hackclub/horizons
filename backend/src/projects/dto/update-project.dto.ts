import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength, IsArray, ArrayMinSize } from 'class-validator';

export class UpdateProjectDto {
  @ApiPropertyOptional({ description: 'Project title', maxLength: 30 })
  @IsString()
  @IsOptional()
  @MaxLength(30)
  projectTitle?: string;

  @ApiPropertyOptional({ description: 'Project description', maxLength: 500 })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  // hoursJustification is not user-editable

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

  @ApiPropertyOptional({ description: 'Journal URL (for hardware projects)' })
  @IsUrl()
  @IsOptional()
  journalUrl?: string;

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
