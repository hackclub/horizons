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
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import {
  AdminSubmissionResponse,
  SubmissionAuditLogResponse,
  AdminProjectResponse,
  ProjectTimelineResponse,
  RecalculateProjectResponse,
  RecalculateAllResponse,
  DeleteProjectResponse,
  AdminUserResponse,
  AdminMetricsResponse,
  ReviewerLeaderboardEntry,
  AdminUserFlagResponse,
  AdminUserSusFlagResponse,
  AdminUserSlackResponse,
  SlackLookupResponse,
  PriorityUserResponse,
  GlobalSettingsResponse,
  ElevatedUserResponse,
  UpdateUserRoleResponse,
  UpdateUserResponse,
  AdminStatsResponse,
  BackfillResponse,
  EventStatsResponse,
  ImportCsvResponse,
  ProjectOwnerHackatimeProjectsResponse,
  FraudQueueResponse,
  LedgerResponse,
} from './dto/admin-response.dto';
import {
  ToggleFraudFlagDto,
  ToggleSusFlagDto,
  UpdateSlackIdDto,
  ToggleSubmissionsFrozenDto,
  UpdateUserRoleDto,
} from './dto/admin-request.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateAdminProjectDto } from './dto/update-admin-project.dto';
import { ApiQuery } from '@nestjs/swagger';

@Controller('api/admin')
export class AdminController {
  constructor(
    private adminService: AdminService,
    private metricsSnapshotService: MetricsSnapshotService,
  ) {}

  @Get('submissions')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: [AdminSubmissionResponse] })
  async getAllSubmissions() {
    return this.adminService.getAllSubmissions();
  }

  @Get('submissions/:id/audit-logs')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: [SubmissionAuditLogResponse] })
  async getSubmissionAuditLogs(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.getSubmissionAuditLogs(id);
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
  @ApiOkResponse({ type: [AdminProjectResponse] })
  async getAllProjects() {
    return this.adminService.getAllProjects();
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
  ) {
    return this.adminService.updateProject(id, body);
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
  @ApiOkResponse({ type: DeleteProjectResponse })
  async deleteProject(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deleteProject(id);
  }

  @Get('users')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: [AdminUserResponse] })
  async getAllUsers() {
    return this.adminService.getAllUsers();
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

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin, Role.EventViewer)
  @ApiOkResponse({ type: AdminStatsResponse })
  async getStats() {
    return this.adminService.getStats();
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
  @ApiCreatedResponse({ type: BackfillResponse })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Days to backfill (default 14, max 30)' })
  async backfillStreaks(@Query('days') days?: string) {
    const requested = Math.max(1, Math.min(30, parseInt(days || '14', 10) || 14));
    const end = new Date();
    end.setUTCDate(end.getUTCDate() - 1);
    end.setUTCHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (requested - 1));
    const results = await this.metricsSnapshotService.backfill(start, end, false);
    return { results };
  }

  @Get('events/:slug/stats')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin, Role.EventViewer)
  @ApiOkResponse({ type: EventStatsResponse })
  async getEventStats(@Param('slug') slug: string) {
    const stats = await this.adminService.getEventStats(slug);
    if (!stats) throw new NotFoundException('Event not found');
    return stats;
  }

  @Get('transactions')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiQuery({ name: 'kind', required: false, enum: ['ShopItem', 'EventRsvp', 'EventTicket'] })
  @ApiQuery({ name: 'userId', required: false, type: Number })
  @ApiQuery({ name: 'fulfilled', required: false, type: Boolean })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ type: LedgerResponse })
  async getTransactionLedger(
    @Query('kind') kind?: 'ShopItem' | 'EventRsvp' | 'EventTicket',
    @Query('userId') userId?: string,
    @Query('fulfilled') fulfilled?: string,
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
    return this.adminService.updateUserRole(id, body.role, req.user.userId);
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
