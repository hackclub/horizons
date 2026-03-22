import { Controller, Get, Put, Body, Param, UseGuards, Req, ParseIntPipe } from '@nestjs/common';
import { Request } from 'express';
import { ReviewerService } from './reviewer.service';
import { ReviewSubmissionDto, SaveNoteDto, SaveChecklistDto } from './dto/review-submission.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

@Controller('api/reviewer')
@UseGuards(RolesGuard)
@Roles(Role.Reviewer, Role.Admin) // Admins can also access reviewer endpoints
export class ReviewerController {
  constructor(private reviewerService: ReviewerService) {}

  /** Get the pending submissions queue with scoped data */
  @Get('queue')
  async getQueue() {
    return this.reviewerService.getReviewQueue();
  }

  /** Get full scoped detail for a single submission */
  @Get('submissions/:id')
  async getSubmissionDetail(@Param('id', ParseIntPipe) id: number) {
    return this.reviewerService.getSubmissionDetail(id);
  }

  /** Approve or reject a submission */
  @Put('submissions/:id/review')
  async reviewSubmission(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewSubmissionDto,
    @Req() req: Request,
  ) {
    return this.reviewerService.reviewSubmission(id, dto, req.user.userId);
  }

  /** Get the shared note for a project */
  @Get('projects/:id/notes')
  async getProjectNote(@Param('id', ParseIntPipe) id: number) {
    return this.reviewerService.getNote('project', id);
  }

  /** Save the shared note for a project */
  @Put('projects/:id/notes')
  async saveProjectNote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveNoteDto,
  ) {
    return this.reviewerService.saveNote('project', id, dto);
  }

  /** Get the shared note for a user */
  @Get('users/:id/notes')
  async getUserNote(@Param('id', ParseIntPipe) id: number) {
    return this.reviewerService.getNote('user', id);
  }

  /** Save the shared note for a user */
  @Put('users/:id/notes')
  async saveUserNote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveNoteDto,
  ) {
    return this.reviewerService.saveNote('user', id, dto);
  }

  /** Get shared checklist state for a submission */
  @Get('submissions/:id/checklist')
  async getChecklist(@Param('id', ParseIntPipe) id: number) {
    return this.reviewerService.getChecklist(id);
  }

  /** Save shared checklist state for a submission */
  @Put('submissions/:id/checklist')
  async saveChecklist(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveChecklistDto,
  ) {
    return this.reviewerService.saveChecklist(id, dto);
  }
}
