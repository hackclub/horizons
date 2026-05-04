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

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  hackatimeStartDate: Date | null;

  @ApiProperty({ type: String, nullable: true })
  slackUserId: string | null;

  @ApiProperty({ type: String, nullable: true })
  referralCode: string | null;

  @ApiProperty({ type: Number, nullable: true })
  referredByUserId: number | null;

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

  @ApiProperty({
    enum: [
      'windows_playable',
      'mac_playable',
      'linux_playable',
      'web_playable',
      'cross_platform_playable',
      'hardware',
      'mobile_app',
    ],
  })
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
  readmeUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  journalUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  screenshotUrl: string | null;

  @ApiProperty({ type: Number, nullable: true })
  approvedHours: number | null;

  @ApiProperty({ type: String, nullable: true })
  hoursJustification: string | null;

  @ApiProperty({ type: String, nullable: true })
  adminComment: string | null;

  @ApiProperty()
  isLocked: boolean;

  @ApiProperty({ type: Boolean, nullable: true })
  joeFraudPassed: boolean | null;

  @ApiProperty({ type: Number, nullable: true })
  joeTrustScore: number | null;

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

class HackatimeProjectEntry {
  @ApiProperty()
  name: string;

  @ApiProperty()
  totalHours: number;
}

export class ProjectOwnerHackatimeProjectsResponse {
  @ApiProperty({ type: [HackatimeProjectEntry] })
  projects: HackatimeProjectEntry[];

  @ApiProperty({ type: [String] })
  linked: string[];

  @ApiProperty({ type: String, nullable: true })
  hackatimeAccount: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  hackatimeStartDate: Date | null;
}

export class ElevatedUserResponse {
  @ApiProperty()
  userId: number;

  @ApiProperty()
  email: string;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty()
  role: string;

  @ApiProperty()
  createdAt: Date;
}

export class UpdateUserRoleResponse {
  @ApiProperty()
  userId: number;

  @ApiProperty()
  email: string;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty()
  role: string;
}

export class UpdateUserResponse {
  @ApiProperty()
  userId: number;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  hackatimeStartDate: Date | null;

  @ApiProperty()
  recalculatedProjects: number;
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
  @ApiProperty({
    enum: [
      'project_created',
      'submission',
      'resubmission',
      'project_updated',
      'admin_review',
      'admin_update',
    ],
  })
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

// --- Stats Dashboard DTOs ---

class StatsFunnel {
  @ApiProperty()
  totalUsers: number;

  @ApiProperty()
  hasHackatime: number;

  @ApiProperty()
  createdProject: number;

  @ApiProperty()
  project10PlusHours: number;

  @ApiProperty()
  atLeast1Submission: number;

  @ApiProperty()
  atLeast1ApprovedHour: number;

  @ApiProperty()
  approved10Plus: number;

  @ApiProperty()
  approved30Plus: number;

  @ApiProperty()
  approved60Plus: number;
}

class StatsUserGrowth {
  @ApiProperty()
  totalUsers: number;

  @ApiProperty()
  newLast30Days: number;

  @ApiProperty()
  newLast7Days: number;

  @ApiProperty()
  growthPercent: number;
}

class StatsReviewHours {
  @ApiProperty({ type: Number, nullable: true })
  medianReviewTimeThisWeek: number | null;

  @ApiProperty({ type: Number, nullable: true })
  medianFraudCheckTimeThisWeek: number | null;

  @ApiProperty({ type: Number, nullable: true })
  lastProjectReviewTime: number | null;

  @ApiProperty({ type: Number, nullable: true })
  lastProjectFraudCheckTime: number | null;
}

class StatsFunnelMatrixRow {
  @ApiProperty()
  fraudPassed: number;

  @ApiProperty()
  fraudFailed: number;

  @ApiProperty()
  fraudPending: number;
}

class StatsFunnelMatrix {
  @ApiProperty({ type: StatsFunnelMatrixRow })
  reviewApproved: StatsFunnelMatrixRow;

  @ApiProperty({ type: StatsFunnelMatrixRow })
  reviewRejected: StatsFunnelMatrixRow;

  @ApiProperty({ type: StatsFunnelMatrixRow })
  reviewPending: StatsFunnelMatrixRow;
}

class StatsReviewProjects {
  @ApiProperty()
  shipped: number;

  @ApiProperty()
  fraudChecked: number;

  @ApiProperty()
  fraudQueue: number;

  @ApiProperty()
  reviewQueue: number;

  @ApiProperty()
  awaitingFraud: number;

  @ApiProperty()
  fraudTeamDeliberation: number;

  @ApiProperty()
  reviewed: number;

  @ApiProperty()
  approved: number;

  @ApiProperty()
  shippedThisWeek: number;

  @ApiProperty()
  fraudCheckedThisWeek: number;

  @ApiProperty()
  reviewedThisWeek: number;

  @ApiProperty({ type: StatsFunnelMatrix })
  funnelMatrix: StatsFunnelMatrix;
}

class StatsSignupEventEntry {
  @ApiProperty()
  eventId: number;

  @ApiProperty()
  title: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  count: number;
}

class StatsSignupRoute {
  @ApiProperty()
  originCountry: string;

  @ApiProperty()
  eventCountry: string;

  @ApiProperty()
  eventTitle: string;

  @ApiProperty()
  count: number;
}

class StatsSignupQualificationModeCounts {
  @ApiProperty()
  engaged: number;

  @ApiProperty()
  rsvped: number;

  @ApiProperty()
  qualified: number;
}

class StatsSignupQualificationModes {
  @ApiProperty({ type: StatsSignupQualificationModeCounts })
  approved: StatsSignupQualificationModeCounts;

  @ApiProperty({ type: StatsSignupQualificationModeCounts })
  shipped: StatsSignupQualificationModeCounts;

  @ApiProperty({ type: StatsSignupQualificationModeCounts })
  unshipped: StatsSignupQualificationModeCounts;
}

class StatsSignupQualificationEntry {
  @ApiProperty()
  eventId: number;

  @ApiProperty()
  title: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  signedUp: number;

  @ApiProperty()
  engaged: number;

  @ApiProperty()
  rsvped: number;

  @ApiProperty()
  qualified: number;

  @ApiProperty({ type: StatsSignupQualificationModes })
  modes: StatsSignupQualificationModes;
}

class StatsSignups {
  @ApiProperty()
  total: number;

  @ApiProperty({ type: [StatsSignupEventEntry] })
  perEvent: StatsSignupEventEntry[];

  @ApiProperty({ type: [StatsSignupQualificationEntry] })
  qualification: StatsSignupQualificationEntry[];

  @ApiProperty({ type: [StatsSignupRoute] })
  routes: StatsSignupRoute[];

  @ApiProperty()
  signupsMissingOrigin: number;

  @ApiProperty({ type: [String] })
  eventsMissingCountry: string[];
}

class StatsUtmEntry {
  @ApiProperty()
  source: string;

  @ApiProperty()
  count: number;

  @ApiProperty()
  onboardedCount: number;

  @ApiProperty()
  shipped10HoursCount: number;
}

class StatsUtm {
  @ApiProperty({ type: [StatsUtmEntry] })
  sources: StatsUtmEntry[];
}

class HistoricalDataPoint {
  @ApiProperty()
  date: string;

  @ApiProperty()
  value: number;
}

class StatsHistorical {
  @ApiProperty({ type: [HistoricalDataPoint] })
  dau: HistoricalDataPoint[];

  @ApiProperty({ type: [HistoricalDataPoint] })
  newSignups: HistoricalDataPoint[];

  @ApiProperty({ type: [HistoricalDataPoint] })
  submissionsCreated: HistoricalDataPoint[];

  @ApiProperty({ type: [HistoricalDataPoint] })
  reviewsCompleted: HistoricalDataPoint[];

  @ApiProperty({ type: [HistoricalDataPoint] })
  medianReviewTimeHours: HistoricalDataPoint[];

  @ApiProperty({ type: [HistoricalDataPoint] })
  dailyHoursLogged: HistoricalDataPoint[];

  @ApiProperty({ type: [HistoricalDataPoint] })
  projectsShipped: HistoricalDataPoint[];

  @ApiProperty({ type: [HistoricalDataPoint] })
  projectsFraudChecked: HistoricalDataPoint[];

  @ApiProperty({ type: [HistoricalDataPoint] })
  medianFraudCheckTimeHours: HistoricalDataPoint[];
}

class StatsDauEventEntry {
  @ApiProperty()
  eventId: number;

  @ApiProperty()
  title: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  count: number;
}

class StatsDau {
  @ApiProperty()
  yesterday: number;

  @ApiProperty()
  avg7: number;

  @ApiProperty()
  avg30: number;

  @ApiProperty()
  growthPercent7: number;

  @ApiProperty({ type: [StatsDauEventEntry] })
  perEvent: StatsDauEventEntry[];
}

export class AdminStatsResponse {
  @ApiProperty({ type: StatsFunnel })
  funnel: StatsFunnel;

  @ApiProperty({ type: StatsUserGrowth })
  userGrowth: StatsUserGrowth;

  @ApiProperty({ type: StatsReviewHours })
  reviewStats: StatsReviewHours;

  @ApiProperty({ type: StatsReviewProjects })
  reviewProjects: StatsReviewProjects;

  @ApiProperty({ type: StatsSignups })
  signups: StatsSignups;

  @ApiProperty({ type: StatsUtm })
  utm: StatsUtm;

  @ApiProperty({ type: StatsHistorical })
  historical: StatsHistorical;

  @ApiProperty({ type: StatsDau })
  dau: StatsDau;
}

class ImportCsvError {
  @ApiProperty()
  row: number;

  @ApiProperty()
  email: string;

  @ApiProperty()
  message: string;
}

class ImportCsvSkipped {
  @ApiProperty()
  row: number;

  @ApiProperty()
  email: string;

  @ApiProperty()
  reason: string;
}

export class ImportCsvResponse {
  @ApiProperty()
  total: number;

  @ApiProperty()
  usersCreated: number;

  @ApiProperty()
  projectsCreated: number;

  @ApiProperty()
  skipped: number;

  @ApiProperty({ type: [ImportCsvSkipped] })
  skippedDetails: ImportCsvSkipped[];

  @ApiProperty({ type: [ImportCsvError] })
  errors: ImportCsvError[];
}

class BackfillEntry {
  @ApiProperty()
  date: string;

  @ApiProperty()
  metricsCount: number;

  @ApiPropertyOptional()
  skipped?: boolean;
}

export class BackfillResponse {
  @ApiProperty({ type: [BackfillEntry] })
  results: BackfillEntry[];
}

// --- Event Stats DTOs ---

class EventStatsEventDetail {
  @ApiProperty()
  eventId: number;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  description: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  imageUrl: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  location: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  country: string | null;

  @ApiProperty()
  startDate: Date;

  @ApiProperty()
  endDate: Date;

  @ApiProperty()
  hourCost: number;

  @ApiProperty()
  isActive: boolean;
}

class EventStatsPinnedTimelineEntry {
  @ApiProperty()
  date: string;

  @ApiProperty()
  value: number;
}

class EventStatsQualification {
  @ApiProperty()
  signedUp: number;

  @ApiProperty()
  engaged: number;

  @ApiProperty()
  rsvped: number;

  @ApiProperty()
  qualified: number;

  @ApiProperty({ type: StatsSignupQualificationModes })
  modes: StatsSignupQualificationModes;
}

export class EventStatsResponse {
  @ApiProperty({ type: EventStatsEventDetail })
  event: EventStatsEventDetail;

  @ApiProperty()
  pinnedCount: number;

  @ApiProperty()
  metHourGoal: number;

  @ApiProperty()
  notMetHourGoal: number;

  @ApiProperty()
  dauYesterday: number;

  @ApiProperty({ type: [EventStatsPinnedTimelineEntry] })
  pinnedTimeline: EventStatsPinnedTimelineEntry[];

  @ApiProperty({ type: [EventStatsPinnedTimelineEntry] })
  dauTimeline: EventStatsPinnedTimelineEntry[];

  @ApiProperty({ type: EventStatsQualification })
  qualification: EventStatsQualification;
}

class FraudQueueProjectUserResponse {
  @ApiProperty()
  userId: number;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty()
  email: string;

  @ApiProperty({ type: String, nullable: true })
  slackUserId: string | null;

  @ApiProperty()
  isFraud: boolean;

  @ApiProperty()
  isSus: boolean;
}

export class FraudQueueProjectResponse {
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

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  latestSubmissionCreatedAt: Date | null;

  @ApiProperty()
  submissionCount: number;

  @ApiProperty({ type: String, nullable: true })
  latestSubmissionStatus: string | null;

  // Joe fields ----
  @ApiProperty({ type: String, nullable: true })
  joeProjectId: string | null;

  @ApiProperty({ type: Boolean, nullable: true })
  joeFraudPassed: boolean | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  joeFraudReviewedAt: Date | null;

  @ApiProperty({ type: Number, nullable: true })
  joeTrustScore: number | null;

  @ApiProperty({ type: String, nullable: true })
  joeJustification: string | null;

  @ApiProperty({ type: String, nullable: true })
  joeOutcomeStatus: string | null;

  @ApiProperty({ type: String, nullable: true })
  joeOutcomeReason: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  joeOutcomeRecordedAt: Date | null;

  // ms waiting on Joe specifically — for pending: now - latestSubmissionCreatedAt; for resolved: joeFraudReviewedAt - latestSubmissionCreatedAt.
  @ApiProperty({ type: Number, nullable: true })
  fraudQueueWaitMs: number | null;

  // ms since project was first created.
  @ApiProperty()
  overallWaitMs: number;

  @ApiProperty({ type: FraudQueueProjectUserResponse })
  user: FraudQueueProjectUserResponse;
}

export class FraudQueueStatsResponse {
  @ApiProperty()
  enabled: boolean;

  @ApiProperty()
  totalProjects: number;

  @ApiProperty()
  pendingCount: number;

  @ApiProperty()
  passedCount: number;

  @ApiProperty()
  failedCount: number;

  @ApiProperty()
  notSubmittedCount: number;

  @ApiProperty({ type: Number, nullable: true })
  avgResolvedFraudWaitMs: number | null;

  @ApiProperty({ type: Number, nullable: true })
  medianResolvedFraudWaitMs: number | null;

  @ApiProperty({ type: Number, nullable: true })
  longestPendingFraudWaitMs: number | null;

  @ApiProperty({ type: Number, nullable: true })
  avgTrustScore: number | null;
}

export class FraudQueueResponse {
  @ApiProperty({ type: FraudQueueStatsResponse })
  stats: FraudQueueStatsResponse;

  @ApiProperty({ type: [FraudQueueProjectResponse] })
  inQueue: FraudQueueProjectResponse[];

  @ApiProperty({ type: [FraudQueueProjectResponse] })
  notInQueue: FraudQueueProjectResponse[];
}
