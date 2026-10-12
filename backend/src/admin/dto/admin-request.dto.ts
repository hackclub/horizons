import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsString,
  IsOptional,
  IsIn,
  IsNumber,
  IsArray,
  ArrayNotEmpty,
  ArrayUnique,
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

export class ToggleBypassIdvDto {
  @ApiProperty({
    description:
      'When true, the user skips the HCA identity-verification check on submission.',
  })
  @IsBoolean()
  bypassIdv: boolean;
}

export class ToggleBanDto {
  @ApiProperty()
  @IsBoolean()
  banned: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 1000,
    description: 'Admin-only note explaining why the user was banned.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string | null;
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

export class ToggleTotalSubmissionsFrozenDto {
  @ApiProperty({
    description:
      'When true, ALL submissions are blocked, ignoring the submission whitelist.',
  })
  @IsBoolean()
  totalSubmissionsFrozen: boolean;
}

export class ToggleShopDisabledDto {
  @ApiProperty({
    description:
      'When true, shop purchases are blocked for everyone except users on the shop whitelist.',
  })
  @IsBoolean()
  shopDisabled: boolean;
}

// Shared by the submission and shop whitelist endpoints.
export class AddWhitelistDto {
  @ApiPropertyOptional({
    type: Number,
    description: 'User ID to add to the whitelist.',
  })
  @IsOptional()
  @IsNumber()
  userId?: number;

  @ApiPropertyOptional({
    type: String,
    description:
      'Slack user ID to resolve to a Horizons user and add to the whitelist. Used when userId is not provided.',
  })
  @IsOptional()
  @IsString()
  slackUserId?: string;
}

export class UpdateUserRoleDto {
  @ApiProperty({
    isArray: true,
    enum: ['user', 'admin', 'reviewer', 'event_viewer'],
    description:
      'Full set of roles to assign. Superadmin cannot be assigned here.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  @IsIn(['user', 'admin', 'reviewer', 'event_viewer'], { each: true })
  roles: ('user' | 'admin' | 'reviewer' | 'event_viewer')[];
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
