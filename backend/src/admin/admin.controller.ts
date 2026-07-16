import {
  Controller,
  Get,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseIntPipe,
  Delete,
  Post,
  NotFoundException,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
  Header,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOkResponse, ApiCreatedResponse, ApiConsumes, ApiProduces } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AdminService } from './admin.service';
import { MetricsSnapshotService } from './metrics-snapshot.service';
import { StreakService } from '../streaks/streak.service';
import { ReviewerLeaderboardCronService } from '../reviewer/reviewer-leaderboard-cron.service';
import { AirtableService } from '../airtable/airtable.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import {
  AdminSubmissionResponse,
  SubmissionAuditLogResponse,
  AdminProjectResponse,
  AdminProjectListItemResponse,
  AdminUserListResponse,
  ProjectTimelineResponse,
  RecalculateProjectResponse,
  RecalculateAllResponse,
  AdminDeleteProjectResponse,
  AdjustUserHoursResponse,
  AdminMetricsResponse,
  ReviewerLeaderboardEntry,
  AdminUserFlagResponse,
  AdminUserSusFlagResponse,
  AdminUserBanResponse,
  AdminUserSlackResponse,
  SlackLookupResponse,
  PriorityUserResponse,
  PriorityQueueEntryResponse,
  ProjectManifestSummaryResponse,
  GlobalSettingsResponse,
  ElevatedUserResponse,
  UpdateUserRoleResponse,
  UpdateUserResponse,
  AdminStatsResponse,
  BackfillResponse,
  StreakBackfillResponse,
  AdminEventStatsResponse,
  ImportCsvResponse,
  ProjectOwnerHackatimeProjectsResponse,
  FraudQueueResponse,
  LedgerResponse,
  FraudReviewQueueResponse,
  FraudGalleryItemResponse,
  PermRejectActionResponse,
  ResetJoeActionResponse,
  TriggerReviewerLeaderboardResponse,
  TriggerAirtableHoursSyncResponse,
} from './dto/admin-response.dto';
import {
  ToggleFraudFlagDto,
  ToggleSusFlagDto,
  ToggleBanDto,
  UpdateSlackIdDto,
  ToggleSubmissionsFrozenDto,
  UpdateUserRoleDto,
  PermRejectProjectDto,
  AdjustUserHoursDto,
} from './dto/admin-request.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateAdminProjectDto } from './dto/update-admin-project.dto';
import { UpdateAdminSubmissionDto } from './dto/update-submission.dto';
import { ApiQuery } from '@nestjs/swagger';

@Controller('api/admin')
export class AdminController {
  constructor(
    private adminService: AdminService,
    private metricsSnapshotService: MetricsSnapshotService,
    private streakService: StreakService,
    private reviewerLeaderboardCron: ReviewerLeaderboardCronService,
    private airtableService: AirtableService,
  ) {}

  @Get('submissions')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiQuery({
    name: 'projectId',
    required: false,
    type: Number,
    description: 'Only return submissions belonging to this project.',
  })
  @ApiOkResponse({ type: [AdminSubmissionResponse] })
  async getAllSubmissions(@Query('projectId') projectId?: string) {
    const parsed = projectId ? parseInt(projectId, 10) : undefined;
    return this.adminService.getAllSubmissions(
      Number.isNaN(parsed) ? undefined : parsed,
    );
  }

  @Get('submissions/:id/audit-logs')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: [SubmissionAuditLogResponse] })
  async getSubmissionAuditLogs(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.getSubmissionAuditLogs(id);
  }

  /**
   * Edit a submission's snapshot fields (description / URLs / hackatime hours
   * captured at submit time). Verdict fields are deliberately excluded — they
   * go through the reviewer review endpoint, which owns the side effects.
   */
  @Patch('submissions/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.Superadmin)
  @ApiOkResponse({ type: AdminSubmissionResponse })
  async updateSubmission(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateAdminSubmissionDto,
    @Req() req: Request,
  ) {
    return this.adminService.updateSubmission(id, body, req.user.userId);
  }

  @Put('projects/:id/unlock')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: AdminProjectResponse })
  async unlockProject(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.adminService.unlockProject(id, req.user.userId);
  }

  @Get('projects/:id/timeline')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: ProjectTimelineResponse })
  async getProjectTimeline(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.getProjectTimeline(id);
  }

  @Get('projects')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: [AdminProjectListItemResponse] })
  async getAllProjects() {
    return this.adminService.getAllProjects();
  }

  @Get('projects/manifest-summary')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiQuery({
    name: 'refresh',
    required: false,
    type: Boolean,
    description: 'Bypass the server-side cache and re-sweep Manifest.',
  })
  @ApiOkResponse({ type: ProjectManifestSummaryResponse })
  async getProjectsManifestSummary(@Query('refresh') refresh?: string) {
    return this.adminService.getProjectsManifestSummary(refresh === 'true');
  }

  @Get('projects/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: AdminProjectResponse })
  async getProject(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.getProject(id);
  }

  @Patch('projects/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.Superadmin)
  @ApiOkResponse({ type: AdminProjectResponse })
  async updateProject(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateAdminProjectDto,
    @Req() req: Request,
  ) {
    return this.adminService.updateProject(id, body, req.user.userId);
  }

  @Get('projects/:id/hackatime-projects')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: ProjectOwnerHackatimeProjectsResponse })
  async listProjectOwnerHackatimeProjects(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.adminService.listProjectOwnerHackatimeProjects(id);
  }

  @Post('projects/:id/recalculate')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiCreatedResponse({ type: RecalculateProjectResponse })
  async recalculateProjectHours(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.recalculateProjectHours(id);
  }

  @Post('projects/recalculate-all')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiCreatedResponse({ type: RecalculateAllResponse })
  async recalculateAllProjects() {
    return this.adminService.recalculateAllProjects();
  }

  @Delete('projects/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: AdminDeleteProjectResponse })
  async deleteProject(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deleteProject(id);
  }

  @Get('users')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Page size (max 200, default 50).' })
  @ApiQuery({ name: 'q', required: false, description: 'Search by name, email, Slack ID, Slack display name, or Hackatime ID.' })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: ['recent', 'streak-desc', 'streak-asc', 'longest-desc'],
  })
  @ApiOkResponse({ type: AdminUserListResponse })
  async getAllUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
    @Query('sort') sort?: string,
  ) {
    const validSorts = [
      'recent',
      'streak-desc',
      'streak-asc',
      'longest-desc',
    ] as const;
    return this.adminService.getAllUsers({
      page: page ? parseInt(page, 10) || 1 : undefined,
      limit: limit ? parseInt(limit, 10) || 50 : undefined,
      q,
      sort: validSorts.includes(sort as (typeof validSorts)[number])
        ? (sort as (typeof validSorts)[number])
        : undefined,
    });
  }

  @Get('metrics')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: AdminMetricsResponse })
  async getTotals() {
    return this.adminService.getTotals();
  }

  @Get('fraud-queue')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: FraudQueueResponse })
  async getFraudQueue() {
    return this.adminService.getFraudQueue();
  }

  @Get('fraud-review/queue')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: FraudReviewQueueResponse })
  async getFraudReviewQueue() {
    return this.adminService.getFraudReviewQueue();
  }

  @Get('fraud-review/gallery')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: [FraudGalleryItemResponse] })
  async getFraudReviewGallery() {
    return this.adminService.getFraudReviewGallery();
  }

  @Post('fraud-review/:projectId/perm-reject')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiCreatedResponse({ type: PermRejectActionResponse })
  async permRejectProject(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: PermRejectProjectDto,
    @Req() req: Request,
  ) {
    return this.adminService.permRejectProject(projectId, req.user.userId, dto);
  }

  @Post('projects/:id/joe-reset')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiCreatedResponse({ type: ResetJoeActionResponse })
  async resetJoeAndRequeue(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.adminService.resetJoeAndRequeue(id, req.user.userId);
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin, Role.EventViewer)
  @ApiQuery({
    name: 'refresh',
    required: false,
    type: Boolean,
    description: 'Bypass the server-side cache and recompute stats.',
  })
  @ApiOkResponse({ type: AdminStatsResponse })
  async getStats(@Query('refresh') refresh?: string) {
    return this.adminService.getStats(refresh === 'true');
  }

  @Post('stats/backfill')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiCreatedResponse({ type: BackfillResponse })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'overwrite', required: false, type: Boolean })
  async backfillStats(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('overwrite') overwrite?: string,
  ) {
    const start = new Date(startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const end = new Date(endDate || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const results = await this.metricsSnapshotService.backfill(start, end, overwrite !== 'true');
    return { results };
  }

  @Post('streaks/backfill')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiCreatedResponse({ type: StreakBackfillResponse })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Days to backfill (default 14, max 365)' })
  async backfillStreaks(@Query('days') days?: string): Promise<StreakBackfillResponse> {
    const requested = Math.max(1, Math.min(365, parseInt(days || '14', 10) || 14));
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - requested);
    start.setUTCHours(0, 0, 0, 0);
    const fromYmd = start.toISOString().slice(0, 10);
    return this.streakService.backfillAllUsers(fromYmd);
  }

  @Get('events/:slug/stats')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin, Role.EventViewer)
  @ApiOkResponse({ type: AdminEventStatsResponse })
  async getEventStats(@Param('slug') slug: string) {
    const stats = await this.adminService.getEventStats(slug);
    if (!stats) throw new NotFoundException('Event not found');
    return stats;
  }

  @Get('events/:slug/export.csv')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin, Role.EventViewer)
  @Header('Content-Type', 'text/csv')
  @ApiProduces('text/csv')
  async exportEventCsv(@Param('slug') slug: string, @Res() res: Response) {
    const csv = await this.adminService.exportEventCsv(slug);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="horizons-event-${slug}.csv"`,
    );
    res.send(csv);
  }

  @Get('transactions')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiQuery({
    name: 'kind',
    required: false,
    enum: ['ShopItem', 'EventTicket', 'AdminAdjustment'],
  })
  @ApiQuery({ name: 'userId', required: false, type: Number })
  @ApiQuery({ name: 'fulfilled', required: false, type: Boolean })
  @ApiQuery({ name: 'refunded', required: false, type: Boolean })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ type: LedgerResponse })
  async getTransactionLedger(
    @Query('kind') kind?: 'ShopItem' | 'EventTicket' | 'AdminAdjustment',
    @Query('userId') userId?: string,
    @Query('fulfilled') fulfilled?: string,
    @Query('refunded') refunded?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getTransactionLedger({
      kind,
      userId: userId ? parseInt(userId, 10) : undefined,
      fulfilled:
        fulfilled === 'true'
          ? true
          : fulfilled === 'false'
            ? false
            : undefined,
      refunded:
        refunded === 'true'
          ? true
          : refunded === 'false'
            ? false
            : undefined,
      limit: limit ? Math.min(parseInt(limit, 10), 2000) : undefined,
    });
  }

  @Get('reviewer-leaderboard')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: [ReviewerLeaderboardEntry] })
  async getReviewerLeaderboard() {
    return this.adminService.getReviewerLeaderboard();
  }

  @Post('reviewer-leaderboard/trigger')
  @UseGuards(RolesGuard)
  @Roles(Role.Superadmin)
  @ApiCreatedResponse({ type: TriggerReviewerLeaderboardResponse })
  async triggerReviewerLeaderboard(): Promise<TriggerReviewerLeaderboardResponse> {
    return this.reviewerLeaderboardCron.triggerNow();
  }

  @Post('airtable/sync-hours')
  @UseGuards(RolesGuard)
  @Roles(Role.Superadmin)
  @ApiCreatedResponse({ type: TriggerAirtableHoursSyncResponse })
  async triggerAirtableHoursSync(): Promise<TriggerAirtableHoursSyncResponse> {
    const result = await this.airtableService.syncAllUserStats();
    return {
      ...result,
      message: `Synced hours for ${result.updated} user${result.updated === 1 ? '' : 's'} (${result.skipped} skipped, ${result.failed} failed).`,
    };
  }

  @Put('users/:id/fraud-flag')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: AdminUserFlagResponse })
  async toggleUserFraudFlag(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ToggleFraudFlagDto,
  ) {
    return this.adminService.toggleUserFraudFlag(id, body.isFraud);
  }

  @Put('users/:id/sus-flag')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: AdminUserSusFlagResponse })
  async toggleUserSusFlag(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ToggleSusFlagDto,
  ) {
    return this.adminService.toggleUserSusFlag(id, body.isSus);
  }

  @Put('users/:id/ban')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: AdminUserBanResponse })
  async setUserBan(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ToggleBanDto,
  ) {
    return this.adminService.setUserBan(id, body.banned, body.reason);
  }

  @Put('users/:id/slack')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: AdminUserSlackResponse })
  async updateUserSlackId(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateSlackIdDto,
  ) {
    return this.adminService.updateUserSlackId(id, body.slackUserId);
  }

  @Get('slack/lookup-by-email')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: SlackLookupResponse })
  async lookupSlackByEmail(@Req() req: Request) {
    const email = req.query.email as string;
    if (!email) {
      return { found: false, message: 'Email parameter required' };
    }
    return this.adminService.lookupSlackByEmail(email);
  }

  @Get('slack/user-info')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: SlackLookupResponse })
  async getSlackInfo(@Req() req: Request) {
    const slackUserId = req.query.slackUserId as string;
    if (!slackUserId) {
      return { found: false, message: 'slackUserId parameter required' };
    }
    return this.adminService.getSlackInfo(slackUserId);
  }

  @Get('priority-users')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: [PriorityUserResponse] })
  async getPriorityUsers() {
    return this.adminService.getPriorityUsers();
  }

  // Reviewer-accessible: the reviewer-facing review queue offers a "Priority
  // queue" sort, and reviewers are exactly who benefits from triaging it. The
  // reasons are benign user-submitted text with no PII.
  @Get('priority-queue')
  @UseGuards(RolesGuard)
  @Roles(Role.Reviewer, Role.Admin)
  @ApiOkResponse({ type: [PriorityQueueEntryResponse] })
  async getPriorityQueue() {
    return this.adminService.getPriorityQueue();
  }

  @Get('settings')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: GlobalSettingsResponse })
  async getGlobalSettings() {
    return this.adminService.getGlobalSettings();
  }

  @Put('settings/submissions-frozen')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: GlobalSettingsResponse })
  async toggleSubmissionsFrozen(
    @Body() body: ToggleSubmissionsFrozenDto,
    @Req() req: Request,
  ) {
    return this.adminService.toggleSubmissionsFrozen(
      body.submissionsFrozen,
      req.user.userId,
    );
  }

  @Get('users/search')
  @UseGuards(RolesGuard)
  @Roles(Role.Superadmin)
  @ApiOkResponse({ type: [ElevatedUserResponse] })
  async searchUsers(@Query('q') query: string) {
    return this.adminService.searchUsers(query);
  }

  @Get('elevated-users')
  @UseGuards(RolesGuard)
  @Roles(Role.Superadmin)
  @ApiOkResponse({ type: [ElevatedUserResponse] })
  async getElevatedUsers() {
    return this.adminService.getElevatedUsers();
  }

  @Put('users/:id/role')
  @UseGuards(RolesGuard)
  @Roles(Role.Superadmin)
  @ApiOkResponse({ type: UpdateUserRoleResponse })
  async updateUserRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserRoleDto,
    @Req() req: Request,
  ) {
    return this.adminService.updateUserRoles(id, body.roles, req.user.userId);
  }

  @Patch('users/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.Superadmin)
  @ApiOkResponse({ type: UpdateUserResponse })
  async updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserDto,
  ) {
    return this.adminService.updateUser(id, body);
  }

  @Post('users/:id/hours-adjustment')
  @UseGuards(RolesGuard)
  @Roles(Role.Superadmin)
  @ApiCreatedResponse({ type: AdjustUserHoursResponse })
  async adjustUserHours(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AdjustUserHoursDto,
    @Req() req: Request,
  ) {
    return this.adminService.adjustUserHours(id, body, req.user.userId);
  }

  @Post('import/csv')
  @UseGuards(RolesGuard)
  @Roles(Role.Superadmin)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse({ type: ImportCsvResponse })
  async importCsv(
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.adminService.importCsv(file.buffer);
  }

  @Get('export/csv')
  @UseGuards(RolesGuard)
  @Roles(Role.Superadmin)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="horizons-users-export.csv"')
  @ApiProduces('text/csv')
  async exportCsv(@Res() res: Response) {
    const csv = await this.adminService.exportCsv();
    res.send(csv);
  }
}
