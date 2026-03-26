import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GitHubCommitResponse {
  @ApiProperty()
  sha: string;

  @ApiProperty()
  message: string;

  @ApiProperty()
  authorName: string;

  @ApiProperty()
  authorLogin: string;

  @ApiProperty()
  date: string;

  @ApiProperty()
  url: string;

  @ApiProperty()
  additions: number;

  @ApiProperty()
  deletions: number;
}

export class GitHubRepoResponse {
  @ApiProperty()
  name: string;

  @ApiProperty()
  fullName: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  description: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  language: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  license: string | null;

  @ApiProperty()
  stars: number;

  @ApiProperty()
  forks: number;

  @ApiProperty()
  openIssues: number;

  @ApiProperty()
  pullRequests: number;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  pushedAt: string;

  @ApiProperty({ type: [GitHubCommitResponse] })
  commits: GitHubCommitResponse[];
}

export class GitHubRepoInfoResponse {
  @ApiPropertyOptional({ type: GitHubRepoResponse, nullable: true })
  data: GitHubRepoResponse | null;

  @ApiPropertyOptional()
  error?: string;
}

export class ReadmeResponse {
  @ApiPropertyOptional({ type: String, nullable: true })
  content: string | null;
}
