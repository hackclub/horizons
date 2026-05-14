import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProjectSubmissionResponse {
  @ApiProperty({ description: 'Submission ID' })
  submissionId: number;

  @ApiProperty({ description: 'Project ID' })
  projectId: number;

  @ApiProperty({
    description:
      'Approval status (silently-rejected submissions are surfaced as "pending")',
    enum: ['pending', 'approved', 'rejected'],
  })
  approvalStatus: 'pending' | 'approved' | 'rejected';

  @ApiProperty({ type: Number, nullable: true })
  approvedHours: number | null;

  @ApiProperty({ type: Number, nullable: true })
  hackatimeHours: number | null;

  @ApiProperty({ type: String, nullable: true })
  hoursJustification: string | null;

  @ApiProperty({ type: String, nullable: true })
  playableUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  screenshotUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: String, nullable: true })
  repoUrl: string | null;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: string;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: string;
}

export class ProjectResponse {
  @ApiProperty({ description: 'Project ID' })
  projectId: number;

  @ApiProperty({ description: 'Owner user ID' })
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

  @ApiPropertyOptional({ description: 'Journal URL' })
  journalUrl: string | null;

  @ApiPropertyOptional({ description: 'Approved hours' })
  approvedHours: number | null;

  @ApiPropertyOptional({ description: 'Current tracked Hackatime hours' })
  nowHackatimeHours: number | null;

  @ApiProperty({ description: 'Linked Hackatime project names', type: [String] })
  nowHackatimeProjects: string[];

  @ApiProperty({ description: 'Whether the project is locked for editing' })
  isLocked: boolean;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: string;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: string;

  @ApiPropertyOptional({
    description:
      'Soft-delete timestamp; user endpoints always return null (deleted projects are hidden)',
    nullable: true,
  })
  deletedAt: string | null;

  @ApiProperty({ type: [ProjectSubmissionResponse] })
  submissions: ProjectSubmissionResponse[];
}

export class ProjectUserResponse {
  @ApiProperty({ description: 'User ID' })
  userId: number;

  @ApiProperty({ description: 'First name' })
  firstName: string;

  @ApiProperty({ description: 'Last name' })
  lastName: string;
}

export class PublicProjectAuthor {
  @ApiPropertyOptional({
    description: 'Author Slack display name (or null if unavailable)',
  })
  displayName: string | null;
}

export class PublicProjectResponse {
  @ApiProperty({ description: 'Project ID' })
  projectId: number;

  @ApiProperty({ description: 'Project title' })
  projectTitle: string;

  @ApiProperty({ description: 'Project type' })
  projectType: string;

  @ApiPropertyOptional({ description: 'Project description' })
  description: string | null;

  @ApiPropertyOptional({ description: 'Screenshot URL' })
  screenshotUrl: string | null;

  @ApiPropertyOptional({ description: 'Playable / demo URL' })
  playableUrl: string | null;

  @ApiPropertyOptional({ description: 'Repository URL' })
  repoUrl: string | null;

  @ApiPropertyOptional({ description: 'README URL' })
  readmeUrl: string | null;

  @ApiPropertyOptional({ description: 'Journal URL' })
  journalUrl: string | null;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: string;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: string;

  @ApiProperty({ description: 'Project author', type: PublicProjectAuthor })
  user: PublicProjectAuthor;
}

export class ShipAlertsResponse {
  @ApiProperty({
    description:
      'True if Manifest reports this project was submitted to a non-Horizons YSWS',
  })
  hasPriorYswsSubmission: boolean;

  @ApiProperty({
    description:
      'Names of the non-Horizons YSWS programs this project was submitted to (deduped)',
    type: [String],
  })
  priorYswsNames: string[];

  @ApiProperty({
    description:
      'True if this project has an approved Horizons submission (current ship is a reship)',
  })
  hasApprovedSubmission: boolean;
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

  @ApiPropertyOptional({ description: 'Journal URL' })
  journalUrl: string | null;

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
