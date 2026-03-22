import { writable, derived } from 'svelte/store';
import type { QueueItem, SubmissionDetail, GitHubRepo } from './api';
import {
  fetchQueue,
  fetchSubmissionDetail,
  fetchGitHubRepo,
  fetchReadmeContent,
  fetchNote,
  fetchChecklist,
} from './api';

// --- Queue state ---
export const queue = writable<QueueItem[]>([]);
export const queueLoading = writable(true);
export const queueError = writable<string | null>(null);

// --- Current position in queue ---
export const currentIndex = writable(0);

// --- Current submission detail ---
export const currentSubmission = writable<SubmissionDetail | null>(null);
export const submissionLoading = writable(false);

// --- GitHub data for current project ---
export const githubRepo = writable<GitHubRepo | null>(null);
export const githubLoading = writable(false);

// --- README (raw markdown, rendered + sanitized in ReadmeDrawer) ---
export const readmeMarkdown = writable('');

// --- Notes ---
export const projectNote = writable('');
export const userNote = writable('');

// --- Checklist ---
export const checkedItems = writable<number[]>([]);

// --- Derived: current queue item ---
export const currentQueueItem = derived(
  [queue, currentIndex],
  ([$queue, $currentIndex]) => $queue[$currentIndex] ?? null,
);

export const queueLength = derived(queue, ($queue) => $queue.length);

// --- Actions ---

export async function loadQueue() {
  queueLoading.set(true);
  queueError.set(null);
  try {
    const items = await fetchQueue();
    queue.set(items);
    currentIndex.set(0);
    if (items.length > 0) {
      await loadSubmissionDetail(items[0].submissionId);
    }
  } catch (error) {
    queueError.set(error instanceof Error ? error.message : 'Failed to load review queue');
  } finally {
    queueLoading.set(false);
  }
}

export async function loadSubmissionDetail(submissionId: number) {
  submissionLoading.set(true);
  currentSubmission.set(null);
  githubRepo.set(null);
  readmeMarkdown.set('');

  try {
    const detail = await fetchSubmissionDetail(submissionId);
    currentSubmission.set(detail);

    // Load GitHub data, readme, notes, and checklist in parallel
    const repoUrl = detail.project.repoUrl || detail.repoUrl;
    const promises: Promise<void>[] = [];

    if (repoUrl) {
      promises.push(loadGitHubData(repoUrl));
      promises.push(loadReadme(repoUrl));
    }

    promises.push(loadNotes(detail.project.projectId, detail.project.user.userId));
    promises.push(loadChecklist(submissionId));

    await Promise.all(promises);
  } catch (error) {
    console.error('Failed to load submission detail:', error);
  } finally {
    submissionLoading.set(false);
  }
}

async function loadReadme(repoUrl: string) {
  try {
    const raw = await fetchReadmeContent(repoUrl);
    readmeMarkdown.set(raw ?? '');
  } catch (error) {
    console.error('README fetch failed:', error);
    readmeMarkdown.set('');
  }
}

async function loadGitHubData(repoUrl: string) {
  githubLoading.set(true);
  try {
    const repo = await fetchGitHubRepo(repoUrl);
    githubRepo.set(repo);
  } catch (error) {
    console.error('GitHub data fetch failed:', error);
  } finally {
    githubLoading.set(false);
  }
}

async function loadNotes(projectId: number, userId: number) {
  try {
    const [projNote, usrNote] = await Promise.all([
      fetchNote('project', projectId),
      fetchNote('user', userId),
    ]);
    projectNote.set(projNote.content);
    userNote.set(usrNote.content);
  } catch (error) {
    console.error('Notes fetch failed:', error);
    projectNote.set('');
    userNote.set('');
  }
}

async function loadChecklist(submissionId: number) {
  try {
    const result = await fetchChecklist(submissionId);
    checkedItems.set(result.checkedItems);
  } catch (error) {
    console.error('Checklist fetch failed:', error);
    checkedItems.set([]);
  }
}

export async function navigateTo(index: number) {
  let queueItems: QueueItem[] = [];
  queue.subscribe((q) => (queueItems = q))();

  if (index < 0 || index >= queueItems.length) return;

  currentIndex.set(index);
  await loadSubmissionDetail(queueItems[index].submissionId);
}

export async function navigateNext() {
  let idx = 0;
  let len = 0;
  currentIndex.subscribe((i) => (idx = i))();
  queueLength.subscribe((l) => (len = l))();
  if (idx < len - 1) {
    await navigateTo(idx + 1);
  }
}

export async function navigatePrev() {
  let idx = 0;
  currentIndex.subscribe((i) => (idx = i))();
  if (idx > 0) {
    await navigateTo(idx - 1);
  }
}
