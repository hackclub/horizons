import { IsOptional, IsString, IsNumber, IsEnum, IsArray, IsInt, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReviewSubmissionDto {
  @ApiProperty({ enum: ['approved', 'rejected'] })
  @IsEnum(['approved', 'rejected'])
  approvalStatus: 'approved' | 'rejected';

  @IsNumber()
  @IsOptional()
  approvedHours?: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  userFeedback?: string; // Shown to the user

  @IsString()
  @IsOptional()
  @MaxLength(500)
  hoursJustification?: string; // Internal, not shown to user
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
