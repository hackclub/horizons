import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminLightUserResponse {
  @ApiProperty()
  userId: number;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty()
  email: string;

  @ApiProperty({ type: String, nullable: true })
  birthday: string | null;

  @ApiProperty({ type: String, nullable: true })
  addressLine1: string | null;

  @ApiProperty({ type: String, nullable: true })
  addressLine2: string | null;

  @ApiProperty({ type: String, nullable: true })
  city: string | null;

  @ApiProperty({ type: String, nullable: true })
  state: string | null;

  @ApiProperty({ type: String, nullable: true })
  country: string | null;

  @ApiProperty({ type: String, nullable: true })
  zipCode: string | null;

  @ApiProperty({ type: String, nullable: true })
  hackatimeAccount: string | null;

  @ApiProperty({ type: String, nullable: true })
  slackUserId: string | null;

  @ApiProperty()
  isFraud: boolean;

  @ApiProperty()
  isSus: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

class AdminSubmissionProjectUserResponse extends AdminLightUserResponse {
  @ApiPropertyOptional({ type: String, nullable: true })
  airtableRecId?: string | null;
}

class AdminSubmissionProjectResponse {
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
  screenshotUrl: string | null;

  @ApiProperty({ type: Number, nullable: true })
  nowHackatimeHours: number | null;

  @ApiProperty({ type: [String], nullable: true })
  nowHackatimeProjects: string[] | null;

  @ApiProperty({ type: Number, nullable: true })
  approvedHours: number | null;

  @ApiProperty({ type: String, nullable: true })
  hoursJustification: string | null;

  @ApiProperty({ type: String, nullable: true })
  adminComment: string | null;

  @ApiProperty()
  isFraud: boolean;

  @ApiProperty({ type: AdminSubmissionProjectUserResponse })
  user: AdminSubmissionProjectUserResponse;
}

export class AdminSubmissionResponse {
  @ApiProperty()
  submissionId: number;

  @ApiProperty()
  approvalStatus: string;

  @ApiProperty({ type: Number, nullable: true })
  approvedHours: number | null;

  @ApiProperty({ type: String, nullable: true })
  hoursJustification: string | null;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: String, nullable: true })
  playableUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  repoUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  screenshotUrl: string | null;

  @ApiProperty({ type: Number, nullable: true })
  hackatimeHours: number | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: AdminSubmissionProjectResponse })
  project: AdminSubmissionProjectResponse;
}

class AdminProjectSubmissionResponse {
  @ApiProperty()
  submissionId: number;

  @ApiProperty()
  approvalStatus: string;

  @ApiProperty({ type: Number, nullable: true })
  approvedHours: number | null;

  @ApiProperty()
  createdAt: Date;
}

export class AdminProjectResponse {
  @ApiProperty()
  projectId: number;

  @ApiProperty()
  projectTitle: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty()
  projectType: string;

  @ApiProperty({ type: Number, nullable: true })
  nowHackatimeHours: number | null;

  @ApiProperty({ type: [String], nullable: true })
  nowHackatimeProjects: string[] | null;

  @ApiProperty({ type: String, nullable: true })
  playableUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  repoUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  screenshotUrl: string | null;

  @ApiProperty({ type: Number, nullable: true })
  approvedHours: number | null;

  @ApiProperty({ type: String, nullable: true })
  hoursJustification: string | null;

  @ApiProperty()
  isLocked: boolean;

  @ApiProperty()
  isFraud: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: AdminLightUserResponse })
  user: AdminLightUserResponse;

  @ApiProperty({ type: [AdminProjectSubmissionResponse] })
  submissions: AdminProjectSubmissionResponse[];
}

class AdminUserSubmissionResponse {
  @ApiProperty()
  submissionId: number;

  @ApiProperty()
  approvalStatus: string;

  @ApiProperty({ type: Number, nullable: true })
  approvedHours: number | null;

  @ApiProperty()
  createdAt: Date;
}

class AdminUserProjectResponse {
  @ApiProperty()
  projectId: number;

  @ApiProperty()
  projectTitle: string;

  @ApiProperty()
  projectType: string;

  @ApiProperty({ type: Number, nullable: true })
  nowHackatimeHours: number | null;

  @ApiProperty({ type: Number, nullable: true })
  approvedHours: number | null;

  @ApiProperty()
  isLocked: boolean;

  @ApiProperty()
  isFraud: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: [AdminUserSubmissionResponse] })
  submissions: AdminUserSubmissionResponse[];
}

export class AdminUserResponse extends AdminLightUserResponse {
  @ApiProperty()
  role: string;

  @ApiProperty({ type: [AdminUserProjectResponse] })
  projects: AdminUserProjectResponse[];
}

class MetricsTotals {
  @ApiProperty()
  totalHackatimeHours: number;

  @ApiProperty()
  totalApprovedHours: number;

  @ApiProperty()
  totalUsers: number;

  @ApiProperty()
  totalProjects: number;

  @ApiProperty()
  totalSubmittedHackatimeHours: number;
}

export class AdminMetricsResponse {
  @ApiProperty({ type: MetricsTotals })
  totals: MetricsTotals;
}

export class ReviewerLeaderboardEntry {
  @ApiProperty()
  reviewerId: string;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty({ type: String, nullable: true })
  email: string | null;

  @ApiProperty()
  approved: number;

  @ApiProperty()
  rejected: number;

  @ApiProperty()
  total: number;

  @ApiProperty({ type: Date, nullable: true })
  lastReviewedAt: Date | null;
}

export class AdminFraudFlagResponse {
  @ApiProperty()
  projectId: number;

  @ApiProperty()
  projectTitle: string;

  @ApiProperty()
  isFraud: boolean;
}

export class AdminUserFlagResponse {
  @ApiProperty()
  userId: number;

  @ApiProperty()
  email: string;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty()
  isFraud: boolean;
}

export class AdminUserSusFlagResponse {
  @ApiProperty()
  userId: number;

  @ApiProperty()
  email: string;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty()
  isSus: boolean;
}

export class AdminUserSlackResponse {
  @ApiProperty()
  userId: number;

  @ApiProperty()
  email: string;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty({ type: String, nullable: true })
  slackUserId: string | null;
}

export class SlackLookupResponse {
  @ApiProperty()
  found: boolean;

  @ApiPropertyOptional()
  message?: string;

  @ApiPropertyOptional()
  slackUserId?: string;

  @ApiPropertyOptional()
  displayName?: string;

  @ApiPropertyOptional()
  realName?: string;
}

export class PriorityUserResponse {
  @ApiProperty()
  userId: number;

  @ApiProperty()
  email: string;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty()
  totalApprovedHours: number;

  @ApiProperty()
  potentialHoursIfApproved: number;

  @ApiProperty()
  reason: string;
}

export class GlobalSettingsResponse {
  @ApiProperty()
  id: string;

  @ApiProperty()
  submissionsFrozen: boolean;

  @ApiProperty({ type: Date, nullable: true })
  submissionsFrozenAt: Date | null;

  @ApiProperty({ type: String, nullable: true })
  submissionsFrozenBy: string | null;
}

export class DeleteProjectResponse {
  @ApiProperty()
  deleted: boolean;

  @ApiProperty()
  projectId: number;
}

class AuditLogAdminResponse {
  @ApiProperty()
  userId: number;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty()
  email: string;
}

export class SubmissionAuditLogResponse {
  @ApiProperty()
  id: number;

  @ApiProperty()
  submissionId: number;

  @ApiProperty()
  adminId: number;

  @ApiProperty()
  action: string;

  @ApiProperty({ type: String, nullable: true })
  newStatus: string | null;

  @ApiProperty({ type: Number, nullable: true })
  approvedHours: number | null;

  @ApiPropertyOptional()
  changes?: any;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: AuditLogAdminResponse, nullable: true })
  admin: AuditLogAdminResponse | null;
}

class TimelineActorResponse {
  @ApiProperty()
  userId: number;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty()
  email: string;
}

class TimelineEventResponse {
  @ApiProperty({ enum: ['project_created', 'submission', 'resubmission', 'project_updated', 'admin_review', 'admin_update'] })
  type: string;

  @ApiProperty()
  timestamp: Date;

  @ApiProperty({ type: TimelineActorResponse, nullable: true })
  actor: TimelineActorResponse | null;

  @ApiProperty()
  details: Record<string, any>;
}

export class ProjectTimelineResponse {
  @ApiProperty()
  projectId: number;

  @ApiProperty()
  projectTitle: string;

  @ApiProperty({ type: TimelineActorResponse })
  user: TimelineActorResponse;

  @ApiProperty({ type: [TimelineEventResponse] })
  timeline: TimelineEventResponse[];
}

export class RecalculateProjectResponse {
  @ApiPropertyOptional({ type: AdminProjectResponse })
  project?: AdminProjectResponse;

  @ApiPropertyOptional()
  skipped?: boolean;

  @ApiPropertyOptional()
  reason?: string;
}

class RecalculateAllSkipped {
  @ApiProperty()
  projectId: number;

  @ApiProperty()
  reason: string;
}

class RecalculateAllError {
  @ApiProperty()
  projectId: number;

  @ApiProperty()
  message: string;
}

export class RecalculateAllResponse {
  @ApiProperty()
  processed: number;

  @ApiProperty()
  updated: number;

  @ApiProperty({ type: [RecalculateAllSkipped] })
  skipped: RecalculateAllSkipped[];

  @ApiProperty({ type: [RecalculateAllError] })
  errors: RecalculateAllError[];
}
