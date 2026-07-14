import {
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  IsArray,
  IsInt,
  IsNotEmpty,
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

  // Superadmin-only: when flipping an already-approved submission to rejected,
  // also delete the per-project Airtable record in the Approved Projects table.
  // Ignored on any other transition. Airtable has no soft-delete — this is
  // unrecoverable, so it's opt-in via a separate UI button.
  @IsBoolean()
  @IsOptional()
  deleteAirtableRecord?: boolean;
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

export class SendToAdminDto {
  // Required explanation of why this submission needs an admin's eyes —
  // surfaced on the admin queue card and in the review timeline.
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  note: string;
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
