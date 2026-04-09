import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseIntPipe,
  Delete,
  Post,
  NotFoundException,
} from '@nestjs/common';
import { ApiOkResponse, ApiCreatedResponse } from '@nestjs/swagger';
import { Request } from 'express';
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
  AdminFraudFlagResponse,
  AdminUserFlagResponse,
  AdminUserSusFlagResponse,
  AdminUserSlackResponse,
  SlackLookupResponse,
  PriorityUserResponse,
  GlobalSettingsResponse,
  ElevatedUserResponse,
  UpdateUserRoleResponse,
  AdminStatsResponse,
  BackfillResponse,
  EventStatsResponse,
} from './dto/admin-response.dto';
import {
  ToggleFraudFlagDto,
  ToggleSusFlagDto,
  UpdateSlackIdDto,
  ToggleSubmissionsFrozenDto,
  UpdateUserRoleDto,
} from './dto/admin-request.dto';
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

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
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
  async backfillStats(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const start = new Date(startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const end = new Date(endDate || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const results = await this.metricsSnapshotService.backfill(start, end);
    return { results };
  }

  @Get('events/:slug/stats')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: EventStatsResponse })
  async getEventStats(@Param('slug') slug: string) {
    const stats = await this.adminService.getEventStats(slug);
    if (!stats) throw new NotFoundException('Event not found');
    return stats;
  }

  @Get('reviewer-leaderboard')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: [ReviewerLeaderboardEntry] })
  async getReviewerLeaderboard() {
    return this.adminService.getReviewerLeaderboard();
  }

  @Put('projects/:id/fraud-flag')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: AdminFraudFlagResponse })
  async toggleFraudFlag(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ToggleFraudFlagDto,
  ) {
    return this.adminService.toggleFraudFlag(id, body.isFraud);
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
}
