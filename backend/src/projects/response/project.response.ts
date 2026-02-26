import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProjectResponse {
  @ApiProperty({ description: 'Project ID' })
  projectId: number;

  @ApiProperty({ description: 'Project title' })
  projectTitle: string;

  @ApiPropertyOptional({ description: 'Project description' })
  description: string;

  @ApiPropertyOptional({ description: 'Screenshot URL' })
  screenshotUrl: string | null;

  @ApiPropertyOptional({ description: 'Playable URL' })
  playableUrl: string | null;

  @ApiPropertyOptional({ description: 'Repository URL' })
  repoUrl: string | null;

  @ApiPropertyOptional({ description: 'README URL' })
  readmeUrl: string | null;

  @ApiPropertyOptional({ description: 'Approved hours' })
  approvedHours: number | null;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: string;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: string;
}

export class ProjectUserResponse {
  @ApiProperty({ description: 'User ID' })
  userId: number;

  @ApiProperty({ description: 'First name' })
  firstName: string;

  @ApiProperty({ description: 'Last name' })
  lastName: string;
}

export class CreateProjectResponse {
  @ApiProperty({ description: 'Project ID' })
  projectId: number;

  @ApiProperty({ description: 'User ID' })
  userId: number;

  @ApiProperty({ description: 'Project title' })
  projectTitle: string;

  @ApiProperty({ description: 'Project type' })
  projectType: string;

  @ApiPropertyOptional({ description: 'Project description' })
  description: string | null;

  @ApiPropertyOptional({ description: 'Screenshot URL' })
  screenshotUrl: string | null;

  @ApiPropertyOptional({ description: 'Playable URL' })
  playableUrl: string | null;

  @ApiPropertyOptional({ description: 'Repository URL' })
  repoUrl: string | null;

  @ApiPropertyOptional({ description: 'README URL' })
  readmeUrl: string | null;

  @ApiPropertyOptional({ description: 'Approved hours' })
  approvedHours: number | null;

  @ApiPropertyOptional({ description: 'Hackatime hours' })
  nowHackatimeHours: number | null;

  @ApiProperty({ description: 'Hackatime project names', type: [String] })
  nowHackatimeProjects: string[];

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;

  @ApiProperty({ description: 'Project owner', type: ProjectUserResponse })
  user: ProjectUserResponse;
}

export class ProjectMessageResponse {
  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiProperty({ description: 'Updated project' })
  project: object;
}

export class DeleteProjectResponse {
  @ApiProperty({ description: 'Whether the project was deleted' })
  deleted: boolean;

  @ApiProperty({ description: 'Deleted project ID' })
  projectId: number;
}
