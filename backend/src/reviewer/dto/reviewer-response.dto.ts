import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ScopedUserResponse {
  @ApiProperty()
  userId: number;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty({ type: String, nullable: true })
  slackUserId: string | null;

  @ApiProperty({ type: Number, nullable: true })
  age: number | null;
}

class QueueProjectResponse {
  @ApiProperty()
  projectId: number;

  @ApiProperty()
  projectTitle: string;

  @ApiProperty()
  projectType: string;

  @ApiProperty({ type: String, nullable: true })
  repoUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  playableUrl: string | null;

  @ApiProperty({ type: Number, nullable: true })
  nowHackatimeHours: number | null;

  @ApiProperty({ type: [String] })
  nowHackatimeProjects: string[];

  @ApiProperty({ type: ScopedUserResponse })
  user: ScopedUserResponse;
}

export class QueueItemResponse {
  @ApiProperty()
  submissionId: number;

  @ApiProperty()
  projectId: number;

  @ApiProperty({ type: Number, nullable: true })
  hackatimeHours: number | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: QueueProjectResponse })
  project: QueueProjectResponse;
}

class SubmissionProjectResponse {
  @ApiProperty()
  projectId: number;

  @ApiProperty()
  projectTitle: string;

  @ApiProperty()
  projectType: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: String, nullable: true })
  playableUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  repoUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  readmeUrl: string | null;

  @ApiProperty({ type: Number, nullable: true })
  nowHackatimeHours: number | null;

  @ApiProperty({ type: [String] })
  nowHackatimeProjects: string[];

  @ApiProperty({ type: ScopedUserResponse })
  user: ScopedUserResponse;
}

export class TimelineEntryResponse {
  @ApiProperty({ enum: ['submitted', 'resubmitted', 'approved', 'rejected'] })
  type: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  hours?: number | null;

  @ApiPropertyOptional()
  reviewerName?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  userFeedback?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  hoursJustification?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  approvedHours?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  submittedHours?: number | null;

  @ApiProperty()
  timestamp: Date;
}

export class SubmissionDetailResponse {
  @ApiProperty()
  submissionId: number;

  @ApiProperty()
  projectId: number;

  @ApiProperty()
  approvalStatus: string;

  @ApiProperty({ type: Number, nullable: true })
  hackatimeHours: number | null;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: String, nullable: true })
  playableUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  repoUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  screenshotUrl: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: SubmissionProjectResponse })
  project: SubmissionProjectResponse;

  @ApiProperty({ type: [TimelineEntryResponse] })
  timeline: TimelineEntryResponse[];
}

export class ReviewResultResponse {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  submissionId: number;

  @ApiProperty()
  status: string;
}

export class NoteResponse {
  @ApiProperty()
  content: string;
}

export class ChecklistResponse {
  @ApiProperty({ type: [Number] })
  checkedItems: number[];
}
