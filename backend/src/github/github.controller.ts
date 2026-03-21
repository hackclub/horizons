import { Controller, Get, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { GitHubService } from './github.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

@Controller('api/github')
@UseGuards(RolesGuard)
@Roles(Role.Reviewer, Role.Admin)
export class GitHubController {
  constructor(private githubService: GitHubService) {}

  /** Fetch repo info (stats, commits, diffs) for a GitHub URL */
  @Get('repo')
  async getRepoInfo(@Query('url') repoUrl: string) {
    if (!repoUrl) {
      throw new BadRequestException('Missing required query parameter: url');
    }
    return this.githubService.getRepoInfo(repoUrl);
  }

  /** Fetch raw README markdown for a GitHub URL */
  @Get('readme')
  async getReadme(@Query('url') repoUrl: string) {
    if (!repoUrl) {
      throw new BadRequestException('Missing required query parameter: url');
    }
    const content = await this.githubService.getReadmeContent(repoUrl);
    return { content };
  }
}
