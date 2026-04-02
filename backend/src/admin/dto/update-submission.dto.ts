import {
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  MaxLength,
  IsBoolean,
} from 'class-validator';

export class UpdateSubmissionDto {
  @IsNumber()
  @IsOptional()
  approvedHours?: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  userFeedback?: string; // Feedback for the user, sent via email, stored in submission table

  @IsString()
  @IsOptional()
  @MaxLength(500)
  hoursJustification?: string; // Admin's internal justification, synced to Airtable, stored in project table

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  adminComment?: string;

  @IsEnum(['pending', 'approved', 'rejected'])
  @IsOptional()
  approvalStatus?: 'pending' | 'approved' | 'rejected';

  @IsBoolean()
  @IsOptional()
  sendEmail?: boolean;
}
