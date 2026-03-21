import { env } from '$env/dynamic/public';

const BASE_URL = env.PUBLIC_API_URL || 'http://localhost:3002';

async function reviewerFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Reviewer API error ${response.status}: ${errorBody || response.statusText}`);
  }

  return response.json();
}

// --- Types matching the scoped backend responses ---

export type ScopedUser = {
  userId: number;
  firstName: string;
  lastName: string;
  slackUserId: string | null;
  age: number | null;
  isFraud: boolean;
  isSus: boolean;
};

export type QueueItem = {
  submissionId: number;
  projectId: number;
  hackatimeHours: number | null;
  createdAt: string;
  project: {
    projectId: number;
    projectTitle: string;
    projectType: string;
    repoUrl: string | null;
    playableUrl: string | null;
    nowHackatimeHours: number | null;
    nowHackatimeProjects: string[];
    user: ScopedUser;
  };
};

export type TimelineEntry =
  | { type: 'submitted' | 'resubmitted'; hours: number | null; timestamp: string }
  | {
      type: 'approved' | 'rejected';
      reviewerName: string;
      userFeedback: string | null;
      hoursJustification: string | null;
      timestamp: string;
    };

export type SubmissionDetail = {
  submissionId: number;
  projectId: number;
  approvalStatus: string;
  hackatimeHours: number | null;
  description: string | null;
  playableUrl: string | null;
  repoUrl: string | null;
  screenshotUrl: string | null;
  createdAt: string;
  project: {
    projectId: number;
    projectTitle: string;
    projectType: string;
    description: string | null;
    playableUrl: string | null;
    repoUrl: string | null;
    readmeUrl: string | null;
    nowHackatimeHours: number | null;
    nowHackatimeProjects: string[];
    user: ScopedUser;
  };
  timeline: TimelineEntry[];
};

export type GitHubRepo = {
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
};

export type GitHubCommit = {
  sha: string;
  message: string;
  authorName: string;
  authorLogin: string;
  date: string;
  url: string;
  additions: number;
  deletions: number;
};

// --- API functions ---

/**
 * Fetch the raw README markdown from a GitHub repo via raw.githubusercontent.com.
 * Tries common default branch names (main, master) and README filenames.
 */
export async function fetchReadmeContent(repoUrl: string): Promise<string | null> {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;

  const [, owner, repo] = match;
  const repoName = repo.replace(/\.git$/, '');

  const branches = ['main', 'master'];
  const filenames = ['README.md', 'readme.md', 'Readme.md'];

  for (const branch of branches) {
    for (const filename of filenames) {
      try {
        const url = `https://raw.githubusercontent.com/${owner}/${repoName}/refs/heads/${branch}/${filename}`;
        const response = await fetch(url);
        if (response.ok) return response.text();
      } catch {
        // Try next combination
      }
    }
  }

  return null;
}

export function fetchQueue(): Promise<QueueItem[]> {
  return reviewerFetch('/api/reviewer/queue');
}

export function fetchSubmissionDetail(submissionId: number): Promise<SubmissionDetail> {
  return reviewerFetch(`/api/reviewer/submissions/${submissionId}`);
}

export function reviewSubmission(
  submissionId: number,
  data: {
    approvalStatus: 'approved' | 'rejected';
    approvedHours?: number;
    userFeedback?: string;
    hoursJustification?: string;
  },
): Promise<{ success: boolean }> {
  return reviewerFetch(`/api/reviewer/submissions/${submissionId}/review`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function fetchNote(targetType: 'project' | 'user', targetId: number): Promise<{ content: string }> {
  return reviewerFetch(`/api/reviewer/${targetType}s/${targetId}/notes`);
}

export function saveNote(
  targetType: 'project' | 'user',
  targetId: number,
  content: string,
): Promise<void> {
  return reviewerFetch(`/api/reviewer/${targetType}s/${targetId}/notes`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

export function fetchChecklist(submissionId: number): Promise<{ checkedItems: number[] }> {
  return reviewerFetch(`/api/reviewer/submissions/${submissionId}/checklist`);
}

export function saveChecklist(submissionId: number, checkedItems: number[]): Promise<void> {
  return reviewerFetch(`/api/reviewer/submissions/${submissionId}/checklist`, {
    method: 'PUT',
    body: JSON.stringify({ checkedItems }),
  });
}

/**
 * Fetch all commits from the GitHub API using pagination.
 * Returns the raw commit list objects from every page.
 */
async function fetchAllCommits(owner: string, repo: string): Promise<any[]> {
  const allCommits: any[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits?per_page=${perPage}&page=${page}`,
    );
    if (!response.ok) break;

    const pageData = await response.json();
    if (!Array.isArray(pageData) || pageData.length === 0) break;

    allCommits.push(...pageData);

    // Stop if this page had fewer than perPage results (last page)
    if (pageData.length < perPage) break;
    page++;
  }

  return allCommits;
}

/**
 * Fetch detailed stats (additions/deletions) for a batch of commits.
 * Processes in batches of 15 to respect GitHub rate limits.
 */
async function fetchCommitStats(
  owner: string,
  repo: string,
  commits: any[],
): Promise<GitHubCommit[]> {
  const BATCH_SIZE = 15;
  const results: GitHubCommit[] = [];

  for (let batchStart = 0; batchStart < commits.length; batchStart += BATCH_SIZE) {
    const batch = commits.slice(batchStart, batchStart + BATCH_SIZE);
    const details = await Promise.all(
      batch.map((c: { sha: string }) =>
        fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${c.sha}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
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
 * Fetch GitHub repo info directly from the GitHub API.
 * Extracts owner/repo from a GitHub URL.
 */
export async function fetchGitHubRepo(repoUrl: string): Promise<GitHubRepo | null> {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;

  const [, owner, repo] = match;
  const repoName = repo.replace(/\.git$/, '');

  try {
    const [repoData, allCommitsRaw, pullsData] = await Promise.all([
      fetch(`https://api.github.com/repos/${owner}/${repoName}`).then((r) => r.json()),
      fetchAllCommits(owner, repoName),
      fetch(`https://api.github.com/repos/${owner}/${repoName}/pulls?state=open&per_page=1`).then((r) => r.json()),
    ]);

    if (repoData.message === 'Not Found') return null;

    const commits = await fetchCommitStats(owner, repoName, allCommitsRaw);

    return {
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
    };
  } catch (error) {
    console.error('GitHub API fetch failed:', error);
    return null;
  }
}
