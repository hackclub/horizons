import { ApiProperty } from '@nestjs/swagger';

export class HackatimeLinkUrlResponse {
  @ApiProperty({ description: 'Hackatime OAuth authorization URL' })
  url: string;
}

export class HackatimeLinkCallbackResponse {
  @ApiProperty()
  message: string;

  @ApiProperty()
  hackatimeUserId: string;
}

export class HackatimeUnlinkResponse {
  @ApiProperty()
  message: string;
}

export class HackatimeProjectResponse {
  @ApiProperty({ description: 'Project ID' })
  id: number;

  @ApiProperty({ description: 'Project name' })
  name: string;

  @ApiProperty({ description: 'Total seconds logged', required: false })
  total_seconds?: number;
}

export class HackatimeProjectsResponse {
  @ApiProperty({
    description: 'List of Hackatime projects',
    type: [HackatimeProjectResponse],
  })
  projects: HackatimeProjectResponse[];
}

export class TotalNowHackatimeHoursResponse {
  @ApiProperty({ description: 'Total Hackatime hours since now' })
  totalNowHackatimeHours: number;
}

export class TotalApprovedHoursResponse {
  @ApiProperty({ description: 'Total approved hours' })
  totalApprovedHours: number;
}

export class RecalculateHoursResponse {
  @ApiProperty({ description: 'Whether recalculation was successful' })
  success: boolean;

  @ApiProperty({ description: 'Response message', required: false })
  message?: string;
}

export class ActiveCodersTodayResponse {
  @ApiProperty({ description: 'Distinct users with project activity since start of today (UTC)' })
  count: number;
}

export class HackatimeAccountStatusResponse {
  @ApiProperty({ description: 'User email' })
  email: string;

  @ApiProperty({ description: 'Whether a Hackatime account is linked' })
  hasHackatimeAccount: boolean;

  @ApiProperty({
    description: 'Hackatime account ID',
    required: false,
    nullable: true,
  })
  hackatimeAccountId: string | null;

  @ApiProperty({ description: 'Whether the stored access token is valid' })
  tokenValid: boolean;
}
