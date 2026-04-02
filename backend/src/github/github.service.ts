import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface GitHubCommit {
  sha: string;
  message: string;
  authorName: string;
  authorLogin: string;
  date: string;
  url: string;
  additions: number;
  deletions: number;
}

export interface GitHubRepoInfo {
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  license: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  pullRequests: number;
  createdAt: string;
  pushedAt: string;
  commits: GitHubCommit[];
}

@Injectable()
export class GitHubService implements OnModuleInit {
  private readonly logger = new Logger(GitHubService.name);
  private tokens: string[] = [];
  // Tracks how many requests each token has made in the current window
  private tokenUsage: number[] = [];
  private readonly COMMIT_STATS_BATCH_SIZE = 15;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const tokenString = this.configService.get<string>('GITHUB_TOKENS') ?? '';
    this.tokens = tokenString
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    this.tokenUsage = new Array(this.tokens.length).fill(0);

    if (this.tokens.length === 0) {
      this.logger.warn(
        'No GITHUB_TOKENS configured — GitHub API calls will be unauthenticated (60 req/hr)',
      );
    } else {
      this.logger.log(
        `Loaded ${this.tokens.length} GitHub token(s) (${this.tokens.length * 5000} req/hr combined)`,
      );
    }
  }

  /** Pick the token with the lowest usage count to spread load evenly */
  private getNextToken(): string | null {
    if (this.tokens.length === 0) return null;

    let minIndex = 0;
    for (let i = 1; i < this.tokenUsage.length; i++) {
      if (this.tokenUsage[i] < this.tokenUsage[minIndex]) {
        minIndex = i;
      }
    }

    this.tokenUsage[minIndex]++;
    return this.tokens[minIndex];
  }

  /** Build headers with auth token if available */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Horizons-Review-Bot',
    };

    const token = this.getNextToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  /** Make an authenticated GitHub API request */
  private async githubFetch(url: string): Promise<Response> {
    return fetch(url, { headers: this.buildHeaders() });
  }

  /** Parse owner/repo from a GitHub URL. Returns null if invalid. */
  private parseRepoUrl(
    repoUrl: string,
  ): { owner: string; repo: string } | null {
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
  }

  /**
   * Fetch full repo info including stats, commits, and line diffs.
   * All GitHub API calls go through the token pool.
   */
  async getRepoInfo(
    repoUrl: string,
  ): Promise<{ data: GitHubRepoInfo | null; error?: string }> {
    const parsed = this.parseRepoUrl(repoUrl);
    if (!parsed) return { data: null, error: 'Invalid GitHub URL' };
    const { owner, repo } = parsed;

    try {
      const repoApiUrl = `https://api.github.com/repos/${owner}/${repo}`;
      const [repoRes, pullsRes] = await Promise.all([
        this.githubFetch(repoApiUrl),
        this.githubFetch(`${repoApiUrl}/pulls?state=open&per_page=1`),
      ]);

      const repoData = await repoRes.json();
      if (!repoRes.ok) {
        const errorMsg = this.describeApiError(repoRes, repoData);
        this.logger.error(
          `GitHub repo API error (${repoRes.status}): ${JSON.stringify(repoData)}`,
        );
        return { data: null, error: errorMsg };
      }

      const pullsData = await pullsRes.json();
      if (!pullsRes.ok) {
        this.logger.warn(
          `GitHub pulls API error (${pullsRes.status}): ${JSON.stringify(pullsData)}`,
        );
      }

      const allCommitsRaw = await this.fetchAllCommits(owner, repo);
      const commits = await this.fetchCommitStats(owner, repo, allCommitsRaw);

      return {
        data: {
          name: repoData.name,
          fullName: repoData.full_name,
          description: repoData.description,
          language: repoData.language,
          license: repoData.license?.spdx_id ?? null,
          stars: repoData.stargazers_count ?? 0,
          forks: repoData.forks_count ?? 0,
          openIssues: repoData.open_issues_count ?? 0,
          pullRequests: Array.isArray(pullsData) ? pullsData.length : 0,
          createdAt: repoData.created_at,
          pushedAt: repoData.pushed_at,
          commits,
        },
      };
    } catch (error) {
      this.logger.error(`GitHub repo fetch failed for ${repoUrl}: ${error}`);
      return { data: null, error: 'Failed to reach GitHub API' };
    }
  }

  /** Turn a GitHub API error response into a human-readable message */
  private describeApiError(
    response: Response,
    body: { message?: string },
  ): string {
    if (response.status === 403) {
      const resetHeader = response.headers.get('x-ratelimit-reset');
      if (resetHeader) {
        const resetDate = new Date(Number(resetHeader) * 1000);
        return `GitHub rate limit exceeded — resets at ${resetDate.toLocaleTimeString()}`;
      }
      return 'GitHub rate limit exceeded';
    }
    if (response.status === 404) {
      return 'Repository not found (404)';
    }
    const msg = typeof body.message === 'string' ? body.message : 'unknown';
    return `GitHub API error ${response.status}: ${msg}`;
  }

  /** Paginate through all commits on the default branch */
  private async fetchAllCommits(owner: string, repo: string): Promise<any[]> {
    const allCommits: any[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const response = await this.githubFetch(
        `https://api.github.com/repos/${owner}/${repo}/commits?per_page=${perPage}&page=${page}`,
      );
      if (!response.ok) {
        const errorBody: unknown = await response.json().catch(() => null);
        this.logger.error(
          `GitHub commits API error (${response.status}) for ${owner}/${repo} page ${page}: ${JSON.stringify(errorBody)}`,
        );
        break;
      }

      const pageData = await response.json();
      if (!Array.isArray(pageData) || pageData.length === 0) break;

      allCommits.push(...pageData);
      if (pageData.length < perPage) break;
      page++;
    }

    return allCommits;
  }

  /** Fetch per-commit additions/deletions in parallel batches */
  private async fetchCommitStats(
    owner: string,
    repo: string,
    commits: any[],
  ): Promise<GitHubCommit[]> {
    const results: GitHubCommit[] = [];

    for (
      let batchStart = 0;
      batchStart < commits.length;
      batchStart += this.COMMIT_STATS_BATCH_SIZE
    ) {
      const batch = commits.slice(
        batchStart,
        batchStart + this.COMMIT_STATS_BATCH_SIZE,
      );
      const details = await Promise.all(
        batch.map((c: any) =>
          this.githubFetch(
            `https://api.github.com/repos/${owner}/${repo}/commits/${c.sha}`,
          )
            .then((r) => {
              if (!r.ok) {
                this.logger.warn(
                  `GitHub commit stats error (${r.status}) for ${c.sha}`,
                );
                return null;
              }
              return r.json();
            })
            .catch((err: Error) => {
              this.logger.warn(
                `GitHub commit stats fetch failed: ${err.message}`,
              );
              return null;
            }),
        ),
      );

      for (let i = 0; i < batch.length; i++) {
        const c = batch[i];
        const detail = details[i];
        results.push({
          sha: c.sha,
          message: c.commit?.message?.split('\n')[0] ?? '',
          authorName: c.commit?.author?.name ?? 'Unknown',
          authorLogin: c.author?.login ?? c.commit?.author?.name ?? 'unknown',
          date: c.commit?.author?.date ?? '',
          url: c.html_url ?? '',
          additions: detail?.stats?.additions ?? 0,
          deletions: detail?.stats?.deletions ?? 0,
        });
      }
    }

    return results;
  }

  /**
   * Fetch raw README content from a repo.
   * Uses raw.githubusercontent.com (no API rate limit), falling back through
   * common branch names and filename casings.
   */
  async getReadmeContent(repoUrl: string): Promise<string | null> {
    const parsed = this.parseRepoUrl(repoUrl);
    if (!parsed) return null;
    const { owner, repo } = parsed;

    const branches = ['main', 'master'];
    const filenames = ['README.md', 'readme.md', 'Readme.md'];

    for (const branch of branches) {
      for (const filename of filenames) {
        try {
          const url = `https://raw.githubusercontent.com/${owner}/${repo}/refs/heads/${branch}/${filename}`;
          const response = await fetch(url);
          if (response.ok) return response.text();
        } catch {
          // Try next combination
        }
      }
    }

    return null;
  }
}
