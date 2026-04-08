import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString, IsOptional, IsIn } from 'class-validator';

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
  @ApiProperty({ enum: ['user', 'admin', 'reviewer'] })
  @IsString()
  @IsIn(['user', 'admin', 'reviewer'])
  role: 'user' | 'admin' | 'reviewer';
}
