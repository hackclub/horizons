import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
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
  PublicProjectResponse,
  ShipAlertsResponse,
} from './response';

@ApiTags('Projects')
@Controller('api/projects')
@Public()
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  // NOTE: This route is intentionally registered AFTER ProjectsAuthController
  // (see projects.module.ts) so that `/api/projects/auth` and
  // `/api/projects/auth/:id` resolve to the auth controller first. Otherwise
  // Express would match `:id` against the literal "auth" segment.
  @Get(':id')
  @ApiOperation({
    summary: 'Public, read-only view of a shipped project',
  })
  @ApiParam({ name: 'id', description: 'Project ID', type: Number })
  @ApiOkResponse({
    type: PublicProjectResponse,
    description: 'Public project details',
  })
  async getPublicProject(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.getPublicProject(id);
  }
}

@ApiTags('Projects (Auth)')
@ApiBearerAuth()
@Controller('api/projects/auth')
export class ProjectsAuthController {
  constructor(private projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  @ApiOkResponse({
    type: CreateProjectResponse,
    description: 'Project created successfully',
  })
  async createProject(
    @Body() createProjectDto: CreateProjectDto,
    @Req() req: Request,
  ) {
    return this.projectsService.createProject(
      createProjectDto,
      req.user.userId,
    );
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
  async getProject(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.projectsService.getProject(id, req.user.userId);
  }

  @Post('submissions')
  @ApiOperation({ summary: 'Submit a project for review' })
  @ApiOkResponse({ description: 'Submission created successfully' })
  async createSubmission(
    @Body() createSubmissionDto: CreateSubmissionDto,
    @Req() req: Request,
  ) {
    return this.projectsService.createSubmission(
      createSubmissionDto,
      req.user.userId,
    );
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

  @Get(':id/ship-alerts')
  @ApiOperation({
    summary: 'Cross-YSWS and prior-approval signals for the ship form',
  })
  @ApiParam({ name: 'id', description: 'Project ID', type: Number })
  @ApiQuery({
    name: 'codeUrl',
    required: false,
    description:
      'Current code URL from the form; overrides the saved repoUrl for the manifest lookup',
  })
  @ApiOkResponse({ type: ShipAlertsResponse })
  async getShipAlerts(
    @Param('id', ParseIntPipe) id: number,
    @Query('codeUrl') codeUrl: string | undefined,
    @Req() req: Request,
  ) {
    return this.projectsService.getShipAlerts(id, req.user.userId, codeUrl);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a project' })
  @ApiParam({ name: 'id', description: 'Project ID', type: Number })
  @ApiOkResponse({
    type: ProjectMessageResponse,
    description: 'Project updated',
  })
  async updateProject(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProjectDto: UpdateProjectDto,
    @Req() req: Request,
  ) {
    return this.projectsService.updateProject(
      id,
      updateProjectDto,
      req.user.userId,
    );
  }

  @Put(':id/hackatime-projects')
  @ApiOperation({ summary: 'Update linked Hackatime projects' })
  @ApiParam({ name: 'id', description: 'Project ID', type: Number })
  @ApiOkResponse({
    type: ProjectMessageResponse,
    description: 'Hackatime projects updated',
  })
  async updateHackatimeProjects(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateHackatimeProjectsDto: UpdateHackatimeProjectsDto,
    @Req() req: Request,
  ) {
    return this.projectsService.updateHackatimeProjects(
      id,
      updateHackatimeProjectsDto,
      req.user.userId,
    );
  }

  @Get(':id/hackatime-projects')
  @ApiOperation({ summary: 'Get linked Hackatime projects for a project' })
  @ApiParam({ name: 'id', description: 'Project ID', type: Number })
  @ApiOkResponse({
    type: HackatimeProjectsInfoResponse,
    description: 'Hackatime project info',
  })
  async getHackatimeProjects(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.projectsService.getHackatimeProjects(id, req.user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a project (only if no submissions)' })
  @ApiParam({ name: 'id', description: 'Project ID', type: Number })
  @ApiOkResponse({
    type: DeleteProjectResponse,
    description: 'Project deleted',
  })
  async deleteProject(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.projectsService.deleteProject(id, req.user.userId);
  }
}
