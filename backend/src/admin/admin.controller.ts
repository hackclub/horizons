import { Controller, Get, Put, Body, Param, UseGuards, Req, ParseIntPipe, Delete, Post } from '@nestjs/common';
import { Request } from 'express';
import { AdminService } from './admin.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

@Controller('api/admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('submissions')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async getAllSubmissions() {
    return this.adminService.getAllSubmissions();
  }

  @Get('submissions/:id/audit-logs')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async getSubmissionAuditLogs(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.getSubmissionAuditLogs(id);
  }

  @Put('projects/:id/unlock')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async unlockProject(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.adminService.unlockProject(id, req.user.userId);
  }

  @Get('projects/:id/timeline')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async getProjectTimeline(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.getProjectTimeline(id);
  }

  @Get('projects')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async getAllProjects() {
    return this.adminService.getAllProjects();
  }

  @Post('projects/:id/recalculate')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async recalculateProjectHours(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.recalculateProjectHours(id);
  }

  @Post('projects/recalculate-all')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async recalculateAllProjects() {
    return this.adminService.recalculateAllProjects();
  }

  @Delete('projects/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async deleteProject(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deleteProject(id);
  }

  @Get('users')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async getAllUsers() {
    return this.adminService.getAllUsers();
  }

  @Get('metrics')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async getTotals() {
    return this.adminService.getTotals();
  }

  @Get('reviewer-leaderboard')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async getReviewerLeaderboard() {
    return this.adminService.getReviewerLeaderboard();
  }

  @Put('projects/:id/fraud-flag')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async toggleFraudFlag(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { isFraud: boolean },
  ) {
    return this.adminService.toggleFraudFlag(id, body.isFraud);
  }

  @Put('users/:id/fraud-flag')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async toggleUserFraudFlag(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { isFraud: boolean },
  ) {
    return this.adminService.toggleUserFraudFlag(id, body.isFraud);
  }

  @Put('users/:id/sus-flag')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async toggleUserSusFlag(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { isSus: boolean },
  ) {
    return this.adminService.toggleUserSusFlag(id, body.isSus);
  }

  @Put('users/:id/slack')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async updateUserSlackId(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { slackUserId: string | null },
  ) {
    return this.adminService.updateUserSlackId(id, body.slackUserId);
  }

  @Get('slack/lookup-by-email')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
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
  async getPriorityUsers() {
    return this.adminService.getPriorityUsers();
  }

  @Get('settings')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async getGlobalSettings() {
    return this.adminService.getGlobalSettings();
  }

  @Put('settings/submissions-frozen')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  async toggleSubmissionsFrozen(
    @Body() body: { submissionsFrozen: boolean },
    @Req() req: Request,
  ) {
    return this.adminService.toggleSubmissionsFrozen(body.submissionsFrozen, req.user.userId);
  }
}
