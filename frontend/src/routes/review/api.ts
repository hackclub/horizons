import { api, type components } from '$lib/api';

// Re-export schema types so components can import from this file
export type ScopedUser = components['schemas']['ScopedUserResponse'];
export type QueueItem = components['schemas']['QueueItemResponse'];
export type SubmissionDetail = components['schemas']['SubmissionDetailResponse'];
export type TimelineEntry = components['schemas']['TimelineEntryResponse'];
export type GitHubRepo = components['schemas']['GitHubRepoResponse'];
export type GitHubCommit = components['schemas']['GitHubCommitResponse'];

export async function fetchQueue(): Promise<QueueItem[]> {
  const { data, error } = await api.GET('/api/reviewer/queue');
  if (error) throw new Error('Failed to fetch review queue');
  return data ?? [];
}

export async function fetchSubmissionDetail(submissionId: number): Promise<SubmissionDetail> {
  const { data, error } = await api.GET('/api/reviewer/submissions/{id}', {
    params: { path: { id: submissionId } },
  });
  if (error || !data) throw new Error(`Failed to fetch submission ${submissionId}`);
  return data;
}

export async function reviewSubmission(
  submissionId: number,
  body: {
    approvalStatus?: 'pending' | 'approved' | 'rejected';
    approvedHours?: number;
    userFeedback?: string;
    hoursJustification?: string;
    adminComment?: string;
    sendEmail?: boolean;
  },
): Promise<{ success: boolean }> {
  const { data, error } = await api.PUT('/api/reviewer/submissions/{id}/review', {
    params: { path: { id: submissionId } },
    body,
  });
  if (error) throw new Error(`Failed to review submission ${submissionId}`);
  return data ?? { success: true };
}

export async function quickApproveSubmission(
  submissionId: number,
  body: {
    userFeedback?: string;
    hoursJustification?: string;
    approvedHours?: number;
  },
): Promise<{ success: boolean }> {
  const { data, error } = await api.POST('/api/reviewer/submissions/{id}/quick-approve', {
    params: { path: { id: submissionId } },
    body,
  });
  if (error) throw new Error(`Failed to quick-approve submission ${submissionId}`);
  return data ?? { success: true };
}

export async function fetchNote(
  targetType: 'project' | 'user',
  targetId: number,
): Promise<{ content: string }> {
  const path = targetType === 'project'
    ? '/api/reviewer/projects/{id}/notes' as const
    : '/api/reviewer/users/{id}/notes' as const;

  const { data, error } = await api.GET(path, {
    params: { path: { id: targetId } },
  });
  if (error || !data) throw new Error(`Failed to fetch ${targetType} note`);
  return data;
}

export async function saveNote(
  targetType: 'project' | 'user',
  targetId: number,
  content: string,
): Promise<void> {
  const path = targetType === 'project'
    ? '/api/reviewer/projects/{id}/notes' as const
    : '/api/reviewer/users/{id}/notes' as const;

  const { error } = await api.PUT(path, {
    params: { path: { id: targetId } },
    body: { content },
  });
  if (error) throw new Error(`Failed to save ${targetType} note`);
}

export async function fetchChecklist(
  submissionId: number,
): Promise<{ checkedItems: number[] }> {
  const { data, error } = await api.GET('/api/reviewer/submissions/{id}/checklist', {
    params: { path: { id: submissionId } },
  });
  if (error || !data) throw new Error(`Failed to fetch checklist for submission ${submissionId}`);
  return data;
}

export async function saveChecklist(
  submissionId: number,
  checkedItems: number[],
): Promise<void> {
  const { error } = await api.PUT('/api/reviewer/submissions/{id}/checklist', {
    params: { path: { id: submissionId } },
    body: { checkedItems },
  });
  if (error) throw new Error(`Failed to save checklist for submission ${submissionId}`);
}

/** Fetch raw README markdown via the backend (which handles auth tokens) */
export async function fetchReadmeContent(repoUrl: string): Promise<string | null> {
  try {
    const { data } = await api.GET('/api/github/readme', {
      params: { query: { url: repoUrl } },
    });
    return data?.content ?? null;
  } catch {
    return null;
  }
}

/** Fetch GitHub repo info via the backend (which handles auth tokens) */
export async function fetchGitHubRepo(
  repoUrl: string,
): Promise<{ data: GitHubRepo | null; error?: string }> {
  try {
    const { data, error } = await api.GET('/api/github/repo', {
      params: { query: { url: repoUrl } },
    });
    if (error || !data) return { data: null, error: 'Failed to fetch GitHub repo info' };
    return { data: data.data ?? null, error: data.error };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { data: null, error: message };
  }
}
