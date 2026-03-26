import { IsOptional, IsString, IsNumber, IsEnum, IsArray, IsInt, MaxLength, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewSubmissionDto {
  @ApiPropertyOptional({ enum: ['pending', 'approved', 'rejected'] })
  @IsEnum(['pending', 'approved', 'rejected'])
  @IsOptional()
  approvalStatus?: 'pending' | 'approved' | 'rejected';

  @IsNumber()
  @IsOptional()
  approvedHours?: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  userFeedback?: string; // Shown to the user via email/Slack

  @IsString()
  @IsOptional()
  @MaxLength(500)
  hoursJustification?: string; // Internal justification, synced to Airtable

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  adminComment?: string; // Internal admin comment, stored on the project

  @IsBoolean()
  @IsOptional()
  sendEmail?: boolean; // Only sends email when explicitly true
}

export class QuickApproveDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  userFeedback?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  hoursJustification?: string;

  @IsNumber()
  @IsOptional()
  approvedHours?: number;
}

export class SaveNoteDto {
  @IsString()
  @MaxLength(2000)
  content: string;
}

export class SaveChecklistDto {
  @IsArray()
  @IsInt({ each: true })
  checkedItems: number[];
}
