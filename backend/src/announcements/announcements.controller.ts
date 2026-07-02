import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiCreatedResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import {
  AnnouncementResponse,
  UserAnnouncementResponse,
  DeleteAnnouncementResponse,
  MarkReadResponse,
} from './dto/announcements-response.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

// User-facing: any authenticated user. Server scopes results to the caller's
// pinned event, so no event identifier is accepted from the client.
@Controller('api/announcements/auth')
export class AnnouncementsAuthController {
  constructor(private service: AnnouncementsService) {}

  @Get()
  @ApiOkResponse({ type: [UserAnnouncementResponse] })
  async list(@Req() req: Request) {
    return this.service.listForUser(req.user.userId);
  }

  @Post(':id/read')
  @ApiCreatedResponse({ type: MarkReadResponse })
  async markRead(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.service.markRead(req.user.userId, id);
  }
}

// Admin management. Class-level roles cover read + edit; event_viewers can
// manage announcements alongside admins (superadmin inherits admin).
@Controller('api/announcements/admin')
@UseGuards(RolesGuard)
@Roles(Role.Admin, Role.EventViewer)
export class AnnouncementsAdminController {
  constructor(private service: AnnouncementsService) {}

  @Get()
  @ApiOkResponse({ type: [AnnouncementResponse] })
  async list() {
    return this.service.list();
  }

  @Get(':id')
  @ApiOkResponse({ type: AnnouncementResponse })
  async getOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.getOne(id);
  }

  @Post()
  @ApiCreatedResponse({ type: AnnouncementResponse })
  async create(@Body() dto: CreateAnnouncementDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @ApiOkResponse({ type: AnnouncementResponse })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOkResponse({ type: DeleteAnnouncementResponse })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
