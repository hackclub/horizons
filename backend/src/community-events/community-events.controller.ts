import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Public } from '../auth/public.decorator';
import { CommunityEventsService } from './community-events.service';
import { CreateCommunityEventDto } from './dto/create-community-event.dto';
import { UpdateCommunityEventDto } from './dto/update-community-event.dto';
import {
  CommunityEventResponse,
  DeleteCommunityEventResponse,
} from './dto/community-events-response.dto';

@Controller('api/community-events')
@Public()
export class CommunityEventsController {
  constructor(private service: CommunityEventsService) {}

  @Get()
  @ApiOkResponse({ type: [CommunityEventResponse] })
  async getActiveEvents() {
    return this.service.getActiveEvents();
  }
}

@Controller('api/community-events/admin')
@UseGuards(RolesGuard)
@Roles(Role.Admin)
export class CommunityEventsAdminController {
  constructor(private service: CommunityEventsService) {}

  @Get()
  @ApiOkResponse({ type: [CommunityEventResponse] })
  async getEvents() {
    return this.service.getEvents();
  }

  @Get(':id')
  @ApiOkResponse({ type: CommunityEventResponse })
  async getEvent(@Param('id') id: string) {
    return this.service.getEvent(id);
  }

  @Post()
  @ApiCreatedResponse({ type: CommunityEventResponse })
  async createEvent(@Body() dto: CreateCommunityEventDto) {
    return this.service.createEvent(dto);
  }

  @Put(':id')
  @ApiOkResponse({ type: CommunityEventResponse })
  async updateEvent(
    @Param('id') id: string,
    @Body() dto: UpdateCommunityEventDto,
  ) {
    return this.service.updateEvent(id, dto);
  }

  @Delete(':id')
  @ApiOkResponse({ type: DeleteCommunityEventResponse })
  async deleteEvent(@Param('id') id: string) {
    return this.service.deleteEvent(id);
  }
}
