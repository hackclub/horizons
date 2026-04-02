import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiCreatedResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import {
  EventResponse,
  AdminEventResponse,
  DeleteEventResponse,
  PinnedEventResponse,
  RemovedEventResponse,
} from './dto/events-response.dto';
import { Public } from '../auth/public.decorator';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';

@Controller('api/events')
@Public()
export class EventsController {
  constructor(private eventsService: EventsService) {}

  @Get()
  @ApiOkResponse({ type: [EventResponse] })
  async getActiveEvents() {
    return this.eventsService.getActiveEvents();
  }
}

@Controller('api/events/auth')
export class EventsAuthController {
  constructor(private eventsService: EventsService) {}

  @Get('pinned-event')
  @ApiOkResponse({ type: PinnedEventResponse })
  async getPinnedEvent(@Req() req: Request) {
    return this.eventsService.getPinnedEvent(req.user.userId);
  }

  @Post('pinned-event')
  @ApiCreatedResponse({ type: PinnedEventResponse })
  async setPinnedEvent(@Body('slug') slug: string, @Req() req: Request) {
    return this.eventsService.setPinnedEvent(req.user.userId, slug);
  }

  @Delete('pinned-event')
  @ApiOkResponse({ type: RemovedEventResponse })
  async removePinnedEvent(@Req() req: Request) {
    return this.eventsService.removePinnedEvent(req.user.userId);
  }
}

@Controller('api/events/admin')
@UseGuards(RolesGuard)
@Roles(Role.Admin)
export class EventsAdminController {
  constructor(private eventsService: EventsService) {}

  @Get()
  @ApiOkResponse({ type: [AdminEventResponse] })
  async getEvents() {
    return this.eventsService.getEvents();
  }

  @Get(':slug')
  @ApiOkResponse({ type: AdminEventResponse })
  async getEvent(@Param('slug') slug: string) {
    return this.eventsService.getEvent(slug);
  }

  @Post()
  @ApiCreatedResponse({ type: EventResponse })
  async createEvent(@Body() dto: CreateEventDto) {
    return this.eventsService.createEvent(dto);
  }

  @Put(':slug')
  @ApiOkResponse({ type: EventResponse })
  async updateEvent(@Param('slug') slug: string, @Body() dto: UpdateEventDto) {
    return this.eventsService.updateEvent(slug, dto);
  }

  @Delete(':slug')
  @ApiOkResponse({ type: DeleteEventResponse })
  async deleteEvent(@Param('slug') slug: string) {
    return this.eventsService.deleteEvent(slug);
  }
}
