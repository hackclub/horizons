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

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  hackatimeStartDate: Date | null;
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

  @ApiProperty({ type: Boolean, nullable: true })
  joeFraudPassed: boolean | null;

  @ApiProperty({ type: ScopedUserResponse })
  user: ScopedUserResponse;
}

export class ClaimInfoResponse {
  @ApiProperty()
  userId: number;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty({ format: 'date-time' })
  claimedAt: Date;

  @ApiProperty({ format: 'date-time' })
  heartbeatAt: Date;

  // True when the holder has stopped heartbeating; UI may take over without prompting.
  @ApiProperty()
  isStale: boolean;

  // True when the requesting user holds the claim themselves.
  @ApiProperty()
  isMine: boolean;
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

  @ApiProperty({ type: ClaimInfoResponse, nullable: true })
  claim: ClaimInfoResponse | null;
}

export class ClaimResultResponse {
  // True when the caller now holds the claim. False when blocked by an
  // active claim held by another reviewer (see `claim` for details).
  @ApiProperty()
  claimed: boolean;

  @ApiProperty({ type: ClaimInfoResponse, nullable: true })
  claim: ClaimInfoResponse | null;
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

  @ApiProperty({ type: String, nullable: true })
  adminComment: string | null;

  @ApiProperty({ type: Number, nullable: true })
  nowHackatimeHours: number | null;

  @ApiProperty({ type: [String] })
  nowHackatimeProjects: string[];

  @ApiProperty({ type: Boolean, nullable: true })
  joeFraudPassed: boolean | null;

  @ApiProperty({ type: Number, nullable: true })
  joeTrustScore: number | null;

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

export class ProjectSubmissionSummary {
  @ApiProperty()
  submissionId: number;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ enum: ['pending', 'approved', 'rejected'] })
  approvalStatus: string;

  @ApiProperty({ type: Boolean, nullable: true })
  reviewPassed: boolean | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  reviewedAt: Date | null;

  @ApiProperty({ type: Number, nullable: true })
  hackatimeHours: number | null;
}

export class SubmissionDetailResponse {
  @ApiProperty()
  submissionId: number;

  @ApiProperty()
  projectId: number;

  @ApiProperty()
  approvalStatus: string;

  @ApiProperty({ type: Boolean, nullable: true })
  reviewPassed: boolean | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  finalizedAt: Date | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  reviewedAt: Date | null;

  @ApiProperty({ type: Number, nullable: true })
  approvedHours: number | null;

  @ApiProperty({ type: Number, nullable: true })
  hackatimeHours: number | null;

  @ApiProperty({ type: String, nullable: true })
  userFeedback: string | null;

  @ApiProperty({ type: String, nullable: true })
  reviewerAnalysis: string | null;

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

  @ApiProperty({ type: [ProjectSubmissionSummary] })
  submissions: ProjectSubmissionSummary[];

  @ApiProperty({ type: ClaimInfoResponse, nullable: true })
  claim: ClaimInfoResponse | null;
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

export class PastReviewEntry {
  @ApiProperty()
  submissionId: number;

  @ApiProperty()
  projectId: number;

  @ApiProperty()
  projectTitle: string;

  @ApiProperty()
  projectType: string;

  @ApiProperty({ type: String, nullable: true })
  reviewerId: string | null;

  @ApiProperty()
  reviewerName: string;

  /** Reconciled outcome across reviewer + fraud gates. */
  @ApiProperty({ enum: ['pending', 'approved', 'rejected'] })
  approvalStatus: string;

  /** Reviewer's own decision (pre-fraud reconciliation). */
  @ApiProperty({ type: Boolean, nullable: true })
  reviewPassed: boolean | null;

  @ApiProperty({ type: Number, nullable: true })
  approvedHours: number | null;

  @ApiProperty({ type: Number, nullable: true })
  hackatimeHours: number | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  reviewedAt: Date | null;

  @ApiProperty({ type: ScopedUserResponse })
  user: ScopedUserResponse;
}

export class PastReviewsResponse {
  @ApiProperty()
  currentReviewerId: number;

  @ApiProperty({ type: [PastReviewEntry] })
  reviews: PastReviewEntry[];
}

class LeaderboardEntry {
  @ApiProperty()
  reviewerId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  count: number;
}

class LeaderboardBreakdown {
  @ApiProperty({ type: [LeaderboardEntry] })
  allTime: LeaderboardEntry[];

  @ApiProperty({ type: [LeaderboardEntry] })
  week: LeaderboardEntry[];

  @ApiProperty({ type: [LeaderboardEntry] })
  day: LeaderboardEntry[];
}

class GeneralStats {
  @ApiProperty({ type: Number, nullable: true })
  longestWaitLast30Days: number | null;

  @ApiProperty({ type: Number, nullable: true })
  avgReviewTimeLast30Days: number | null;

  @ApiProperty({ type: Number, nullable: true })
  medianReviewTimeLast30Days: number | null;

  @ApiProperty({ type: Number, nullable: true })
  longestCurrentWait: number | null;

  @ApiProperty()
  reviewsLast30Days: number;
}

export class ReviewStatsResponse {
  @ApiProperty({ type: LeaderboardBreakdown })
  leaderboard: LeaderboardBreakdown;

  @ApiProperty({ type: GeneralStats })
  general: GeneralStats;
}

export class ManifestSubmissionResponse {
  @ApiProperty()
  submissionId: string;

  @ApiProperty({ type: String, nullable: true })
  ysws: string | null;

  @ApiProperty({ type: String, nullable: true })
  yswsName: string | null;

  @ApiProperty({ enum: ['draft', 'shipped'] })
  shipStatus: 'draft' | 'shipped';

  @ApiProperty({ type: Number, nullable: true })
  hoursShipped: number | null;

  @ApiProperty({ type: String, nullable: true })
  airtableRecord: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  approvedAt: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  shippedAt: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class ManifestProjectResponse {
  @ApiProperty()
  projectId: string;

  @ApiProperty({ format: 'uri' })
  codeUrl: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: [ManifestSubmissionResponse] })
  submissions: ManifestSubmissionResponse[];

  @ApiPropertyOptional()
  warning?: string;
}

export class ManifestLookupResponse {
  @ApiProperty({ type: String, nullable: true })
  codeUrl: string | null;

  @ApiProperty({ type: ManifestProjectResponse, nullable: true })
  manifest: ManifestProjectResponse | null;
}
