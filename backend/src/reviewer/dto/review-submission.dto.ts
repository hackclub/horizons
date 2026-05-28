import {
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  IsArray,
  IsInt,
  MaxLength,
  IsBoolean,
} from 'class-validator';
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
  @MaxLength(5000)
  userFeedback?: string; // Shown to the user via email/Slack

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  hoursJustification?: string; // Reviewer's analysis — server wraps with boilerplate before saving

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  adminComment?: string; // Internal admin comment, stored on the project

  @IsBoolean()
  @IsOptional()
  sendEmail?: boolean; // Only sends email when explicitly true

  // When true AND approvalStatus === 'rejected', mark the project permanently
  // rejected. The user sees the rejection reason and can no longer resubmit or
  // edit the project. `userFeedback` is reused as the user-facing reason.
  @IsBoolean()
  @IsOptional()
  permReject?: boolean;

  // When true, skip the Manifest-based "other YSWS hours already shipped"
  // deduction when computing the Airtable delta. Only honored when this
  // reviewer decision finalizes the submission in-request — if fraud is still
  // pending and finalization defers to the fraud-poll path, the override is
  // not preserved and normal dedupe applies.
  @IsBoolean()
  @IsOptional()
  ignorePriorYswsCredit?: boolean;
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

export class PreviewSlackMessageDto {
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  userFeedback?: string;

  @IsNumber()
  @IsOptional()
  approvedHours?: number;

  @IsBoolean()
  @IsOptional()
  approved?: boolean;
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

export class ClaimSubmissionDto {
  // Set true to take over an active claim held by another reviewer. Without
  // this flag, the endpoint refuses with conflict info so the UI can prompt.
  @IsBoolean()
  @IsOptional()
  force?: boolean;
}
