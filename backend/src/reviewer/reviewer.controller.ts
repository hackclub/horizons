import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { ReviewerService } from './reviewer.service';
import {
  ReviewSubmissionDto,
  QuickApproveDto,
  SaveNoteDto,
  SaveChecklistDto,
  ClaimSubmissionDto,
} from './dto/review-submission.dto';
import {
  QueueItemResponse,
  SubmissionDetailResponse,
  ReviewResultResponse,
  NoteResponse,
  ChecklistResponse,
  ReviewStatsResponse,
  PastReviewsResponse,
  ManifestLookupResponse,
  ClaimResultResponse,
  HackatimeProjectHours,
} from './dto/reviewer-response.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

@Controller('api/reviewer')
@UseGuards(RolesGuard)
@Roles(Role.Reviewer, Role.Admin)
export class ReviewerController {
  constructor(private reviewerService: ReviewerService) {}

  /** Poll the fraud review platform and update pass/fail status for all pending projects */
  @Post('fraud-review/refresh')
  async refreshFraudStatuses() {
    return this.reviewerService.refreshFraudStatuses();
  }

  /** Reviewer leaderboard and general review timing stats */
  @Get('stats')
  @ApiOkResponse({ type: ReviewStatsResponse })
  async getStats() {
    return this.reviewerService.getReviewStats();
  }

  /** List all finalized reviews; response includes currentReviewerId so the UI can split "mine" vs "all" */
  @Get('past-reviews')
  @ApiOkResponse({ type: PastReviewsResponse })
  async getPastReviews(@Req() req: Request) {
    return this.reviewerService.getPastReviews(req.user.userId);
  }

  /** Get the pending submissions queue with scoped data */
  @Get('queue')
  @ApiOkResponse({ type: [QueueItemResponse] })
  async getQueue(@Req() req: Request) {
    return this.reviewerService.getReviewQueue(req.user.userId);
  }

  /** Get full scoped detail for a single submission */
  @Get('submissions/:id')
  @ApiOkResponse({ type: SubmissionDetailResponse })
  async getSubmissionDetail(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.reviewerService.getSubmissionDetail(id, req.user.userId);
  }

  /**
   * Claim a submission for review. The frontend calls this when opening a
   * review so two reviewers can't grab the same project.
   *
   * - 200 + `{ claimed: true, claim }` when the caller now holds the claim
   *   (no prior claim, stale claim, self-reclaim, or `force=true` takeover).
   * - 200 + `{ claimed: false, claim }` when another reviewer has an active
   *   claim and the caller didn't pass `force` — UI should prompt to override.
   */
  @Post('submissions/:id/claim')
  @ApiOkResponse({ type: ClaimResultResponse })
  async claimSubmission(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ClaimSubmissionDto,
    @Req() req: Request,
  ) {
    return this.reviewerService.claimSubmission(
      id,
      req.user.userId,
      dto.force ?? false,
    );
  }

  /**
   * Heartbeat the claim — the frontend pings this every ~30s while the
   * review page is open so the claim doesn't go stale.
   */
  @Post('submissions/:id/heartbeat')
  @ApiOkResponse({ type: ClaimResultResponse })
  async heartbeatClaim(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.reviewerService.heartbeatClaim(id, req.user.userId);
  }

  /** Release the claim explicitly (e.g. when the reviewer navigates away). */
  @Delete('submissions/:id/claim')
  async releaseClaim(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.reviewerService.releaseClaim(id, req.user.userId);
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
    return this.reviewerService.quickApproveSubmission(
      id,
      req.user.userId,
      dto,
    );
  }

  /** Look up this project's codeUrl in the Manifest registry to see other YSWS submissions */
  @Get('projects/:id/manifest-lookup')
  @ApiOkResponse({ type: ManifestLookupResponse })
  async getProjectManifestLookup(@Param('id', ParseIntPipe) id: number) {
    return this.reviewerService.getProjectManifestLookup(id);
  }

  /** Live per-Hackatime-project hour breakdown for the review UI */
  @Get('projects/:id/hackatime-breakdown')
  @ApiOkResponse({ type: [HackatimeProjectHours] })
  async getProjectHackatimeBreakdown(@Param('id', ParseIntPipe) id: number) {
    return this.reviewerService.getProjectHackatimeBreakdown(id);
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
    @Req() req: Request,
  ) {
    return this.reviewerService.saveNote('project', id, dto, req.user.userId);
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
    @Req() req: Request,
  ) {
    return this.reviewerService.saveNote('user', id, dto, req.user.userId);
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
