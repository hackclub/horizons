import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { LapseService } from './lapse.service';
import { ProjectLapsesResponse } from './dto/lapse-response.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

@Controller('api/lapse')
@UseGuards(RolesGuard)
@Roles(Role.Reviewer, Role.Admin)
export class LapseController {
  constructor(private lapseService: LapseService) {}

  /** Timelapses the submitter published against this project's linked Hackatime projects */
  @Get('projects/:id')
  @ApiOkResponse({ type: ProjectLapsesResponse })
  async getProjectLapses(@Param('id', ParseIntPipe) projectId: number) {
    return this.lapseService.getProjectLapses(projectId);
  }
}
