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
      approvedHours: number | null;
      submittedHours: number | null;
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

/** Fetch raw README markdown via the backend (which handles auth tokens) */
export async function fetchReadmeContent(repoUrl: string): Promise<string | null> {
  try {
    const result = await reviewerFetch<{ content: string | null }>(
      `/api/github/readme?url=${encodeURIComponent(repoUrl)}`,
    );
    return result.content;
  } catch {
    return null;
  }
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

/** Fetch GitHub repo info via the backend (which handles auth tokens) */
export async function fetchGitHubRepo(repoUrl: string): Promise<GitHubRepo | null> {
  try {
    return await reviewerFetch<GitHubRepo | null>(
      `/api/github/repo?url=${encodeURIComponent(repoUrl)}`,
    );
  } catch {
    return null;
  }
}
