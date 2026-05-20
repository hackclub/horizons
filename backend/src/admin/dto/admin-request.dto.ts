import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsString,
  IsOptional,
  IsIn,
  IsNumber,
  MinLength,
  MaxLength,
} from 'class-validator';

export class ToggleFraudFlagDto {
  @ApiProperty()
  @IsBoolean()
  isFraud: boolean;
}

export class ToggleSusFlagDto {
  @ApiProperty()
  @IsBoolean()
  isSus: boolean;
}

export class UpdateSlackIdDto {
  @ApiProperty({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  slackUserId: string | null;
}

export class ToggleSubmissionsFrozenDto {
  @ApiProperty()
  @IsBoolean()
  submissionsFrozen: boolean;
}

export class UpdateUserRoleDto {
  @ApiProperty({ enum: ['user', 'admin', 'reviewer', 'event_viewer'] })
  @IsString()
  @IsIn(['user', 'admin', 'reviewer', 'event_viewer'])
  role: 'user' | 'admin' | 'reviewer' | 'event_viewer';
}

export class AdjustUserHoursDto {
  @ApiProperty({
    description:
      'Hours to credit (positive) or deduct (negative) from the user. Cannot be zero.',
  })
  @IsNumber()
  hours: number;

  @ApiProperty({
    description:
      'Reason for the adjustment. Stored as the transaction description and visible to the user in their transaction history.',
    minLength: 1,
    maxLength: 500,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string;
}

export class PermRejectProjectDto {
  @ApiProperty({
    description:
      'User-facing rejection reason. Shown to the project owner and embedded in the email/Slack DM.',
    minLength: 1,
    maxLength: 1000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason: string;

  @ApiPropertyOptional({
    description: 'Internal-only note for future admin context. Not shown to the user.',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNote?: string;

  @ApiPropertyOptional({
    description: 'Send Loops email + Slack DM to the owner (default true).',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}
