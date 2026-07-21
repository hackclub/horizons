import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiOkResponse, ApiCreatedResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { ReviewerPayoutsService } from './reviewer-payouts.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import {
  ExecuteReviewerPayoutDto,
  ExecuteReviewerPayoutResponse,
  ReviewerPayoutFlagsResponse,
  ReviewerPayoutHistoryResponse,
  ReviewerPayoutListResponse,
  UpdateReviewerPayoutFlagsDto,
} from './dto/reviewer-payouts.dto';

@Controller('api/admin/reviewer-payouts')
export class ReviewerPayoutsController {
  constructor(private reviewerPayoutsService: ReviewerPayoutsService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: ReviewerPayoutListResponse })
  async listReviewers() {
    return this.reviewerPayoutsService.listReviewers();
  }

  @Get(':userId/history')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ type: ReviewerPayoutHistoryResponse })
  async getHistory(@Param('userId', ParseIntPipe) userId: number) {
    return this.reviewerPayoutsService.getHistory(userId);
  }

  @Put(':userId/flags')
  @UseGuards(RolesGuard)
  @Roles(Role.Superadmin)
  @ApiOkResponse({ type: ReviewerPayoutFlagsResponse })
  async updateFlags(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: UpdateReviewerPayoutFlagsDto,
    @Req() req: Request,
  ) {
    return this.reviewerPayoutsService.updateFlags(
      userId,
      body,
      req.user.userId,
    );
  }

  @Post(':userId/payout')
  @UseGuards(RolesGuard)
  @Roles(Role.Superadmin)
  @ApiCreatedResponse({ type: ExecuteReviewerPayoutResponse })
  async executePayout(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: ExecuteReviewerPayoutDto,
    @Req() req: Request,
  ) {
    return this.reviewerPayoutsService.executePayout(
      userId,
      body,
      req.user.userId,
    );
  }
}
