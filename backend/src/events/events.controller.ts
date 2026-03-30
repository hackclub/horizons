import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { Public } from '../auth/public.decorator';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';

@Controller('api/events')
@Public()
export class EventsController {
  constructor(private eventsService: EventsService) {}

  @Get()
  async getActiveEvents() {
    return this.eventsService.getActiveEvents();
  }
}

@Controller('api/events/auth')
export class EventsAuthController {
  constructor(private eventsService: EventsService) {}

  @Get('pinned-event')
  async getPinnedEvent(@Req() req: Request) {
    return this.eventsService.getPinnedEvent(req.user.userId);
  }

  @Post('pinned-event')
  async setPinnedEvent(@Body('slug') slug: string, @Req() req: Request) {
    return this.eventsService.setPinnedEvent(req.user.userId, slug);
  }

  @Delete('pinned-event')
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
  async getEvents() {
    return this.eventsService.getEvents();
  }

  @Get(':slug')
  async getEvent(@Param('slug') slug: string) {
    return this.eventsService.getEvent(slug);
  }

  @Post()
  async createEvent(@Body() dto: CreateEventDto) {
    return this.eventsService.createEvent(dto);
  }

  @Put(':slug')
  async updateEvent(@Param('slug') slug: string, @Body() dto: UpdateEventDto) {
    return this.eventsService.updateEvent(slug, dto);
  }

  @Delete(':slug')
  async deleteEvent(@Param('slug') slug: string) {
    return this.eventsService.deleteEvent(slug);
  }
}
