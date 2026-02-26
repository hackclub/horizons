import { Controller, Post, Get, Put, Delete, Body, Param, Req, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { UpdateHackatimeProjectsDto } from './dto/update-hackatime-projects.dto';
import { Public } from '../auth/public.decorator';
import {
  CreateProjectResponse,
  ProjectMessageResponse,
  DeleteProjectResponse,
  HackatimeProjectsInfoResponse,
} from './response';

@ApiTags('Projects')
@Controller('api/projects')
@Public()
export class ProjectsController {

  // @Get('approved')
  // @ApiOperation({ summary: 'Get all approved projects' })
  // @ApiOkResponse({ type: [ProjectResponse], description: 'List of approved projects' })
  // async getApprovedProjects() {
  //   return this.projectsService.getApprovedProjects();
  // }

  // @Get('leaderboard')
  // @ApiOperation({ summary: 'Get leaderboard' })
  // @ApiQuery({ name: 'sortBy', required: false, enum: ['hours', 'approved'], description: 'Sort leaderboard by hours or approved hours' })
  // @ApiOkResponse({ type: [LeaderboardEntry], description: 'Top 10 leaderboard entries' })
  // async getLeaderboard(@Query('sortBy') sortBy?: string) {
  //   const sortType = sortBy === 'approved' ? 'approved' : 'hours';
  //   return this.projectsService.getLeaderboard(sortType);
  // }
}

@ApiTags('Projects (Auth)')
@ApiBearerAuth()
@Controller('api/projects/auth')
export class ProjectsAuthController {
  constructor(private projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  @ApiOkResponse({ type: CreateProjectResponse, description: 'Project created successfully' })
  async createProject(
    @Body() createProjectDto: CreateProjectDto,
    @Req() req: Request,
  ) {
    return this.projectsService.createProject(createProjectDto, req.user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get current user projects' })
  @ApiOkResponse({ description: 'List of user projects' })
  async getUserProjects(@Req() req: Request) {
    return this.projectsService.getUserProjects(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific project by ID' })
  @ApiParam({ name: 'id', description: 'Project ID', type: Number })
  @ApiOkResponse({ description: 'Project details' })
  async getProject(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.projectsService.getProject(id, req.user.userId);
  }

  @Post('submissions')
  @ApiOperation({ summary: 'Submit a project for review' })
  @ApiOkResponse({ description: 'Submission created successfully' })
  async createSubmission(
    @Body() createSubmissionDto: CreateSubmissionDto,
    @Req() req: Request,
  ) {
    return this.projectsService.createSubmission(createSubmissionDto, req.user.userId);
  }

  @Get(':id/submissions')
  @ApiOperation({ summary: 'Get submissions for a project' })
  @ApiParam({ name: 'id', description: 'Project ID', type: Number })
  @ApiOkResponse({ description: 'List of project submissions' })
  async getProjectSubmissions(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.projectsService.getProjectSubmissions(id, req.user.userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a project' })
  @ApiParam({ name: 'id', description: 'Project ID', type: Number })
  @ApiOkResponse({ type: ProjectMessageResponse, description: 'Project updated' })
  async updateProject(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProjectDto: UpdateProjectDto,
    @Req() req: Request,
  ) {
    return this.projectsService.updateProject(id, updateProjectDto, req.user.userId);
  }

  @Put(':id/hackatime-projects')
  @ApiOperation({ summary: 'Update linked Hackatime projects' })
  @ApiParam({ name: 'id', description: 'Project ID', type: Number })
  @ApiOkResponse({ type: ProjectMessageResponse, description: 'Hackatime projects updated' })
  async updateHackatimeProjects(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateHackatimeProjectsDto: UpdateHackatimeProjectsDto,
    @Req() req: Request,
  ) {
    return this.projectsService.updateHackatimeProjects(id, updateHackatimeProjectsDto, req.user.userId);
  }

  @Get(':id/hackatime-projects')
  @ApiOperation({ summary: 'Get linked Hackatime projects for a project' })
  @ApiParam({ name: 'id', description: 'Project ID', type: Number })
  @ApiOkResponse({ type: HackatimeProjectsInfoResponse, description: 'Hackatime project info' })
  async getHackatimeProjects(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.projectsService.getHackatimeProjects(id, req.user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a project (only if no submissions)' })
  @ApiParam({ name: 'id', description: 'Project ID', type: Number })
  @ApiOkResponse({ type: DeleteProjectResponse, description: 'Project deleted' })
  async deleteProject(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.projectsService.deleteProject(id, req.user.userId);
  }
}
