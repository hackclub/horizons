import { Controller, Get, Put, Post, Body, Param, UseGuards, Req, ParseIntPipe } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { ReviewerService } from './reviewer.service';
import { ReviewSubmissionDto, QuickApproveDto, SaveNoteDto, SaveChecklistDto } from './dto/review-submission.dto';
import {
  QueueItemResponse,
  SubmissionDetailResponse,
  ReviewResultResponse,
  NoteResponse,
  ChecklistResponse,
} from './dto/reviewer-response.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

@Controller('api/reviewer')
@UseGuards(RolesGuard)
@Roles(Role.Reviewer, Role.Admin)
export class ReviewerController {
  constructor(private reviewerService: ReviewerService) {}

  /** Get the pending submissions queue with scoped data */
  @Get('queue')
  @ApiOkResponse({ type: [QueueItemResponse] })
  async getQueue() {
    return this.reviewerService.getReviewQueue();
  }

  /** Get full scoped detail for a single submission */
  @Get('submissions/:id')
  @ApiOkResponse({ type: SubmissionDetailResponse })
  async getSubmissionDetail(@Param('id', ParseIntPipe) id: number) {
    return this.reviewerService.getSubmissionDetail(id);
  }

  /** Update a submission: change status, hours, feedback, comments */
  @Put('submissions/:id/review')
  @ApiOkResponse({ type: ReviewResultResponse })
  async reviewSubmission(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewSubmissionDto,
    @Req() req: Request,
  ) {
    return this.reviewerService.reviewSubmission(id, dto, req.user.userId);
  }

  /** Quick-approve a submission using hackatime hours */
  @Post('submissions/:id/quick-approve')
  @ApiOkResponse({ type: ReviewResultResponse })
  async quickApproveSubmission(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: QuickApproveDto,
    @Req() req: Request,
  ) {
    return this.reviewerService.quickApproveSubmission(id, req.user.userId, dto);
  }

  /** Get the shared note for a project */
  @Get('projects/:id/notes')
  @ApiOkResponse({ type: NoteResponse })
  async getProjectNote(@Param('id', ParseIntPipe) id: number) {
    return this.reviewerService.getNote('project', id);
  }

  /** Save the shared note for a project */
  @Put('projects/:id/notes')
  @ApiOkResponse({ type: NoteResponse })
  async saveProjectNote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveNoteDto,
  ) {
    return this.reviewerService.saveNote('project', id, dto);
  }

  /** Get the shared note for a user */
  @Get('users/:id/notes')
  @ApiOkResponse({ type: NoteResponse })
  async getUserNote(@Param('id', ParseIntPipe) id: number) {
    return this.reviewerService.getNote('user', id);
  }

  /** Save the shared note for a user */
  @Put('users/:id/notes')
  @ApiOkResponse({ type: NoteResponse })
  async saveUserNote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveNoteDto,
  ) {
    return this.reviewerService.saveNote('user', id, dto);
  }

  /** Get shared checklist state for a submission */
  @Get('submissions/:id/checklist')
  @ApiOkResponse({ type: ChecklistResponse })
  async getChecklist(@Param('id', ParseIntPipe) id: number) {
    return this.reviewerService.getChecklist(id);
  }

  /** Save shared checklist state for a submission */
  @Put('submissions/:id/checklist')
  @ApiOkResponse({ type: ChecklistResponse })
  async saveChecklist(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveChecklistDto,
  ) {
    return this.reviewerService.saveChecklist(id, dto);
  }
}
