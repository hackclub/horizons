<script lang="ts">
    import { onMount } from 'svelte';
    import { invalidateAll } from '$app/navigation';
    import { api, type components } from '$lib/api';
    import { env } from '$env/dynamic/public';

    type AdminSubmission = components['schemas']['AdminSubmissionResponse'];
    type AdminSubmissionUser = components['schemas']['AdminSubmissionProjectUserResponse'];
    type GlobalSettingsResponse = components['schemas']['GlobalSettingsResponse'];
    type ReviewerLeaderboardEntry = components['schemas']['ReviewerLeaderboardEntry'];
    type PriorityUserResponse = components['schemas']['PriorityUserResponse'];
    type ProjectTimelineResponse = components['schemas']['ProjectTimelineResponse'];
    type TimelineEventResponse = components['schemas']['TimelineEventResponse'];

    type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';
    type SortField =
        | 'createdAt'
        | 'projectTitle'
        | 'userName'
        | 'approvalStatus'
        | 'nowHackatimeHours'
        | 'approvedHours';
    type SortDirection = 'asc' | 'desc';

    const projectTypes = [
        'personal_website',
        'platformer_game',
        'website',
        'game',
        'terminal_cli',
        'desktop_app',
        'mobile_app',
        'wildcard',
    ] as const;
    const statusOptions = ['pending', 'approved', 'rejected'] as const;

    // --- Draft helpers ---

    const toSubmissionDraft = (submission: AdminSubmission) => ({
        approvalStatus: submission.approvalStatus,
        approvedHours:
            submission.project.approvedHours !== null
                ? submission.project.approvedHours.toString()
                : submission.project.nowHackatimeHours !== null
                  ? submission.project.nowHackatimeHours.toFixed(1)
                  : '',
        userFeedback: submission.hoursJustification ?? '',
        hoursJustification: submission.project.hoursJustification ?? '',
        adminComment: submission.project.adminComment ?? '',
        sendEmailNotification: false,
    });

    const buildSubmissionDrafts = (list: AdminSubmission[]) => {
        const drafts: Record<
            number,
            {
                approvalStatus: string;
                approvedHours: string;
                userFeedback: string;
                hoursJustification: string;
                adminComment: string;
                sendEmailNotification: boolean;
            }
        > = {};
        for (const submission of list) {
            drafts[submission.submissionId] = toSubmissionDraft(submission);
        }
        return drafts;
    };

    // --- State ---

    let submissions = $state<AdminSubmission[]>([]);
    let submissionsLoading = $state(false);
    let submissionsLoaded = $state(false);

    let searchQuery = $state('');
    let selectedStatuses = $state<Set<string>>(new Set(['pending']));
    let selectedProjectTypes = $state<Set<string>>(new Set());
    let sortField = $state<SortField>('createdAt');
    let sortDirection = $state<SortDirection>('asc');

    let showFraudSubmissions = $state(true);
    let showSusSubmissions = $state(true);

    // Date range
    function getDefaultDateRange() {
        const today = new Date();
        const defaultStart = new Date(env.PUBLIC_HACKATIME_CUTOFF_DATE || '2025-10-10');
        return {
            startDate: defaultStart.toISOString().split('T')[0],
            endDate: today.toISOString().split('T')[0],
        };
    }

    function loadDateRangeFromStorage() {
        if (typeof window === 'undefined') return getDefaultDateRange();
        const stored = localStorage.getItem('admin-submissions-date-range');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                return {
                    startDate: parsed.startDate || getDefaultDateRange().startDate,
                    endDate: parsed.endDate || getDefaultDateRange().endDate,
                };
            } catch {
                return getDefaultDateRange();
            }
        }
        return getDefaultDateRange();
    }

    function saveDateRangeToStorage(startDate: string, endDate: string) {
        if (typeof window !== 'undefined') {
            localStorage.setItem(
                'admin-submissions-date-range',
                JSON.stringify({ startDate, endDate }),
            );
        }
    }

    const defaultDateRange = loadDateRangeFromStorage();
    let dateRangeStart = $state(defaultDateRange.startDate);
    let dateRangeEnd = $state(defaultDateRange.endDate);

    $effect(() => {
        saveDateRangeToStorage(dateRangeStart, dateRangeEnd);
    });

    // Billy link helper
    function generateBillyLink(hackatimeAccount: string | null): string | null {
        if (!hackatimeAccount || hackatimeAccount.trim() === '') return null;
        const start = dateRangeStart || getDefaultDateRange().startDate;
        const end = dateRangeEnd || getDefaultDateRange().endDate;
        return `https://billy.3kh0.net/?u=${hackatimeAccount}&d=${start}-${end}`;
    }

    // ID helpers
    const statusIdFor = (submissionId: number) => `submission-${submissionId}-status`;
    const hoursIdFor = (submissionId: number) => `submission-${submissionId}-hours`;
    const userFeedbackIdFor = (submissionId: number) => `submission-${submissionId}-user-feedback`;
    const justificationIdFor = (submissionId: number) => `submission-${submissionId}-justification`;

    // Draft / saving state
    let submissionDrafts = $state<
        Record<
            number,
            {
                approvalStatus: string;
                approvedHours: string;
                userFeedback: string;
                hoursJustification: string;
                adminComment: string;
                sendEmailNotification: boolean;
            }
        >
    >({});
    let submissionSaving = $state<Record<number, boolean>>({});
    let submissionErrors = $state<Record<number, string>>({});
    let submissionSuccess = $state<Record<number, string>>({});
    let submissionRecalculating = $state<Record<number, boolean>>({});
    let addressExpanded = $state<Record<number, boolean>>({});
    let selectedSubmissionByProject = $state<Record<number, number>>({});
    let submissionCountFilter = $state<string>('all');

    // Global settings
    let globalSettings = $state<GlobalSettingsResponse | null>(null);
    let globalSettingsLoading = $state(false);

    // Reviewer leaderboard
    let reviewerLeaderboard = $state<ReviewerLeaderboardEntry[]>([]);
    let leaderboardLoading = $state(false);
    let leaderboardLoaded = $state(false);

    // Priority users
    let priorityUsers = $state<PriorityUserResponse[]>([]);
    let priorityUsersLoading = $state(false);
    let priorityUsersLoaded = $state(false);
    let priorityFilterEnabled = $state(false);

    // Timeline
    let timelineByProject = $state<Record<number, ProjectTimelineResponse>>({});
    let timelineLoading = $state<Record<number, boolean>>({});
    let timelineOpen = $state<Record<number, boolean>>({});

    // --- Utility functions ---

    function setSubmissionDraft(entry: AdminSubmission, force = false) {
        if (!force && submissionDrafts[entry.submissionId]) {
            return;
        }
        submissionDrafts = {
            ...submissionDrafts,
            [entry.submissionId]: toSubmissionDraft(entry),
        };
    }

    function formatDate(value: string) {
        return new Date(value).toLocaleString();
    }

    function formatHours(value: number | null) {
        if (value === null || value === undefined) {
            return '\u2014';
        }
        return value.toFixed(1);
    }

    function fullName(user: AdminSubmissionUser) {
        const first = user.firstName ?? '';
        const last = user.lastName ?? '';
        const name = `${first} ${last}`.trim();
        return name || 'Unknown';
    }

    function normalizeUrl(url: string | null): string | null {
        if (!url) return null;
        const trimmed = url.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            return trimmed;
        }
        return `https://${trimmed}`;
    }

    function formatProjectType(type: string): string {
        return type
            .split('_')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    // Timeline helpers
    function timelineEventLabel(type: string): string {
        switch (type) {
            case 'project_created': return 'Project Created';
            case 'submission': return 'Submitted';
            case 'resubmission': return 'Resubmitted';
            case 'project_updated': return 'Project Updated';
            case 'admin_review': return 'Admin Reviewed Project';
            case 'admin_update': return 'Admin Updated Project Review';
            default: return type;
        }
    }

    function timelineEventColor(type: string): string {
        switch (type) {
            case 'project_created': return 'border-blue-500 bg-blue-500/10';
            case 'submission': return 'border-green-500 bg-green-500/10';
            case 'resubmission': return 'border-yellow-500 bg-yellow-500/10';
            case 'project_updated': return 'border-cyan-500 bg-cyan-500/10';
            case 'admin_review': return 'border-purple-500 bg-purple-500/10';
            case 'admin_update': return 'border-orange-500 bg-orange-500/10';
            default: return 'border-gray-500 bg-gray-500/10';
        }
    }

    function timelineDotColor(type: string): string {
        switch (type) {
            case 'project_created': return 'bg-blue-500';
            case 'submission': return 'bg-green-500';
            case 'resubmission': return 'bg-yellow-500';
            case 'project_updated': return 'bg-cyan-500';
            case 'admin_review': return 'bg-purple-500';
            case 'admin_update': return 'bg-orange-500';
            default: return 'bg-gray-500';
        }
    }

    // --- API functions ---

    let submissionsLoadPromise: Promise<void> | null = null;
    async function loadSubmissions(autoRecalculate = false) {
        if (submissionsLoading && submissionsLoadPromise) {
            return submissionsLoadPromise;
        }
        submissionsLoading = true;
        submissionsLoadPromise = (async () => {
            try {
                const { data, error } = await api.GET('/api/admin/submissions');
                if (error) {
                    console.error('Failed to load submissions:', error);
                    return;
                }
                const next = data;
                submissions = next;
                submissionDrafts = buildSubmissionDrafts(next);
                submissionErrors = {};
                submissionSuccess = {};
                submissionsLoaded = true;

                if (autoRecalculate) {
                    const pendingSubmissions = next.filter(
                        (s) => s.approvalStatus === 'pending',
                    );
                    for (const submission of pendingSubmissions) {
                        recalculateSubmissionHours(
                            submission.submissionId,
                            submission.project.projectId,
                        );
                    }
                }
            } finally {
                submissionsLoading = false;
                submissionsLoadPromise = null;
            }
        })();
        return submissionsLoadPromise;
    }

    async function loadGlobalSettings() {
        globalSettingsLoading = true;
        try {
            const { data, error } = await api.GET('/api/admin/settings');
            if (error) {
                console.error('Failed to load global settings:', error);
                return;
            }
            globalSettings = data;
        } catch (err) {
            console.error('Failed to load global settings:', err);
        } finally {
            globalSettingsLoading = false;
        }
    }

    async function toggleGlobalSubmissionsFrozen() {
        if (!globalSettings) return;
        globalSettingsLoading = true;
        try {
            const { data, error } = await api.PUT('/api/admin/settings/submissions-frozen', {
                body: { submissionsFrozen: !globalSettings.submissionsFrozen }
            });
            if (error) {
                console.error('Failed to toggle submissions frozen:', error);
                return;
            }
            globalSettings = data;
        } catch (err) {
            console.error('Failed to toggle submissions frozen:', err);
        } finally {
            globalSettingsLoading = false;
        }
    }

    async function saveSubmission(submissionId: number, sendEmail?: boolean) {
        const draft = submissionDrafts[submissionId];
        if (!draft) return;

        submissionSaving = { ...submissionSaving, [submissionId]: true };
        submissionErrors = { ...submissionErrors, [submissionId]: '' };
        submissionSuccess = { ...submissionSuccess, [submissionId]: '' };

        const shouldSendEmail = sendEmail !== undefined ? sendEmail : draft.sendEmailNotification;

        const payload: {
            approvalStatus: 'pending' | 'approved' | 'rejected';
            approvedHours?: number;
            userFeedback?: string;
            hoursJustification?: string;
            adminComment?: string;
            sendEmail?: boolean;
        } = {
            approvalStatus: draft.approvalStatus as 'pending' | 'approved' | 'rejected',
            approvedHours: draft.approvedHours === '' ? undefined : parseFloat(draft.approvedHours),
            userFeedback: draft.userFeedback === '' ? undefined : draft.userFeedback,
            hoursJustification: draft.hoursJustification === '' ? undefined : draft.hoursJustification,
            adminComment: draft.adminComment === '' ? undefined : draft.adminComment,
            sendEmail: shouldSendEmail,
        };

        try {
            const { error } = await api.PUT('/api/reviewer/submissions/{id}/review', {
                params: { path: { id: submissionId } },
                body: payload,
            });

            if (error) {
                submissionErrors = {
                    ...submissionErrors,
                    [submissionId]: 'Failed to update submission',
                };
                return;
            }

            submissionSuccess = {
                ...submissionSuccess,
                [submissionId]: 'Submission updated',
            };

            // Invalidate timeline cache for the project
            const sub = submissions.find((s) => s.submissionId === submissionId);
            if (sub) {
                const { [sub.project.projectId]: _, ...rest } = timelineByProject;
                timelineByProject = rest;
            }

            await loadSubmissions();
            invalidateAll();
        } catch (err) {
            submissionErrors = {
                ...submissionErrors,
                [submissionId]: err instanceof Error ? err.message : 'Failed to update submission',
            };
        } finally {
            submissionSaving = { ...submissionSaving, [submissionId]: false };
        }
    }

    async function quickApprove(submission: AdminSubmission) {
        submissionSaving = { ...submissionSaving, [submission.submissionId]: true };
        submissionErrors = { ...submissionErrors, [submission.submissionId]: '' };
        submissionSuccess = { ...submissionSuccess, [submission.submissionId]: '' };

        const draft = submissionDrafts[submission.submissionId];
        const userFeedback = draft?.userFeedback || '';
        const hoursJustification = draft?.hoursJustification || '';
        const approvedHours = draft?.approvedHours ? parseFloat(draft.approvedHours) : undefined;

        try {
            const { error } = await api.POST('/api/reviewer/submissions/{id}/quick-approve', {
                params: { path: { id: submission.submissionId } },
                body: {
                    userFeedback: userFeedback || undefined,
                    hoursJustification: hoursJustification || undefined,
                    approvedHours,
                },
            });

            if (error) {
                submissionErrors = {
                    ...submissionErrors,
                    [submission.submissionId]: 'Failed to quick approve submission',
                };
                return;
            }

            submissionSuccess = {
                ...submissionSuccess,
                [submission.submissionId]: 'Submission quick approved and synced to Airtable',
            };

            // Invalidate timeline cache
            const { [submission.project.projectId]: _, ...restTimeline } = timelineByProject;
            timelineByProject = restTimeline;

            const currentSubmissionId = submission.submissionId;
            await loadSubmissions();
            invalidateAll();
            advanceToNextSubmission(currentSubmissionId);
        } catch (err) {
            submissionErrors = {
                ...submissionErrors,
                [submission.submissionId]: err instanceof Error ? err.message : 'Failed to quick approve submission',
            };
        } finally {
            submissionSaving = { ...submissionSaving, [submission.submissionId]: false };
        }
    }

    async function quickDeny(submissionId: number) {
        submissionDrafts[submissionId] = {
            ...submissionDrafts[submissionId],
            approvalStatus: 'rejected',
            approvedHours: '0',
        };
        const shouldSendEmail = submissionDrafts[submissionId].sendEmailNotification;
        await saveSubmission(submissionId, shouldSendEmail);
        advanceToNextSubmission(submissionId);
    }

    async function recalculateSubmissionHours(submissionId: number, projectId: number) {
        submissionRecalculating = { ...submissionRecalculating, [submissionId]: true };

        try {
            const { data, error } = await api.POST('/api/admin/projects/{id}/recalculate', {
                params: { path: { id: projectId } },
            });

            if (!error && data) {
                const updatedProject = data.project;
                if (updatedProject) {
                    const submission = submissions.find((s) => s.submissionId === submissionId);
                    if (submission) {
                        submission.project.nowHackatimeHours = updatedProject.nowHackatimeHours;
                        submissionDrafts[submissionId] = {
                            ...submissionDrafts[submissionId],
                            approvedHours: updatedProject.nowHackatimeHours?.toFixed(1) ?? '',
                        };
                    }
                }
            }
        } catch (err) {
            console.error('Failed to recalculate hours:', err);
        } finally {
            submissionRecalculating = { ...submissionRecalculating, [submissionId]: false };
        }
    }

    async function toggleFraudFlag(projectId: number, currentValue: boolean) {
        try {
            const { error } = await api.PUT('/api/admin/projects/{id}/fraud-flag', {
                params: { path: { id: projectId } },
                body: { isFraud: !currentValue },
            });
            if (!error) {
                await loadSubmissions();
            }
        } catch (err) {
            console.error('Failed to toggle fraud flag:', err);
        }
    }

    async function toggleSusFlag(userId: number, currentValue: boolean) {
        try {
            const { error } = await api.PUT('/api/admin/users/{id}/sus-flag', {
                params: { path: { id: userId } },
                body: { isSus: !currentValue },
            });
            if (!error) {
                await loadSubmissions();
            }
        } catch (err) {
            console.error('Failed to toggle sus flag:', err);
        }
    }

    async function loadReviewerLeaderboard() {
        leaderboardLoading = true;
        try {
            const { data, error } = await api.GET('/api/admin/reviewer-leaderboard');
            if (!error && data) {
                reviewerLeaderboard = data;
                leaderboardLoaded = true;
            }
        } catch (err) {
            console.error('Failed to load reviewer leaderboard:', err);
        } finally {
            leaderboardLoading = false;
        }
    }

    async function loadPriorityUsers() {
        if (priorityUsersLoaded && priorityUsers.length > 0) return;
        priorityUsersLoading = true;
        try {
            const { data, error } = await api.GET('/api/admin/priority-users');
            if (!error && data) {
                priorityUsers = data;
                priorityUsersLoaded = true;
            }
        } catch (err) {
            console.error('Failed to load priority users:', err);
        } finally {
            priorityUsersLoading = false;
        }
    }

    async function togglePriorityFilter() {
        priorityFilterEnabled = !priorityFilterEnabled;
        if (priorityFilterEnabled && !priorityUsersLoaded) {
            await loadPriorityUsers();
        }
    }

    async function loadTimeline(projectId: number) {
        if (timelineByProject[projectId]) {
            timelineOpen = { ...timelineOpen, [projectId]: !timelineOpen[projectId] };
            return;
        }
        timelineLoading = { ...timelineLoading, [projectId]: true };
        try {
            const { data, error } = await api.GET('/api/admin/projects/{id}/timeline', {
                params: { path: { id: projectId } },
            });
            if (!error && data) {
                timelineByProject = { ...timelineByProject, [projectId]: data };
                timelineOpen = { ...timelineOpen, [projectId]: true };
            }
        } catch (e) {
            console.error('Failed to load timeline', e);
        } finally {
            timelineLoading = { ...timelineLoading, [projectId]: false };
        }
    }

    // --- Filter / sort / derived ---

    function matchesSearch(submission: AdminSubmission, query: string): boolean {
        if (!query.trim()) return true;
        const lowerQuery = query.toLowerCase();
        const name = `${submission.project.user.firstName ?? ''} ${submission.project.user.lastName ?? ''}`.trim().toLowerCase();
        return (
            submission.project.projectTitle.toLowerCase().includes(lowerQuery) ||
            name.includes(lowerQuery) ||
            submission.project.user.email.toLowerCase().includes(lowerQuery) ||
            (submission.project.description?.toLowerCase().includes(lowerQuery) ?? false) ||
            (submission.description?.toLowerCase().includes(lowerQuery) ?? false)
        );
    }

    function matchesStatusFilters(submission: AdminSubmission): boolean {
        if (selectedStatuses.size === 0) return true;
        return selectedStatuses.has(submission.approvalStatus);
    }

    function matchesProjectTypeFilters(submission: AdminSubmission): boolean {
        if (selectedProjectTypes.size === 0) return true;
        return selectedProjectTypes.has(submission.project.projectType);
    }

    function matchesPriorityFilter(submission: AdminSubmission): boolean {
        if (!priorityFilterEnabled || !priorityUsersLoaded) return true;
        const priorityUserIds = new Set(priorityUsers.map((u) => u.userId));
        return priorityUserIds.has(submission.project.user.userId);
    }

    function matchesFraudFilter(submission: AdminSubmission): boolean {
        if (showFraudSubmissions) return true;
        return !submission.project.isFraud;
    }

    function matchesSusFilter(submission: AdminSubmission): boolean {
        if (showSusSubmissions) return true;
        return !submission.project.user.isSus;
    }

    function compareSubmissions(a: AdminSubmission, b: AdminSubmission): number {
        let comparison = 0;

        switch (sortField) {
            case 'createdAt':
                comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                break;
            case 'projectTitle':
                comparison = a.project.projectTitle.localeCompare(b.project.projectTitle);
                break;
            case 'userName': {
                const nameA = `${a.project.user.firstName ?? ''} ${a.project.user.lastName ?? ''}`.trim();
                const nameB = `${b.project.user.firstName ?? ''} ${b.project.user.lastName ?? ''}`.trim();
                comparison = nameA.localeCompare(nameB);
                break;
            }
            case 'approvalStatus':
                comparison = a.approvalStatus.localeCompare(b.approvalStatus);
                break;
            case 'nowHackatimeHours':
                comparison = (a.project.nowHackatimeHours ?? 0) - (b.project.nowHackatimeHours ?? 0);
                break;
            case 'approvedHours':
                comparison = (a.project.approvedHours ?? 0) - (b.project.approvedHours ?? 0);
                break;
        }

        return sortDirection === 'asc' ? comparison : -comparison;
    }

    let groupedSubmissions = $derived.by(() => {
        const groups: Record<number, AdminSubmission[]> = {};

        for (const submission of submissions) {
            if (!groups[submission.project.projectId]) {
                groups[submission.project.projectId] = [];
            }
            groups[submission.project.projectId].push(submission);
        }

        for (const projectId in groups) {
            groups[Number(projectId)].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            );
        }

        return groups;
    });

    let filteredGroupedSubmissions = $derived.by(() => {
        const filtered: Record<number, AdminSubmission[]> = {};
        const groups = groupedSubmissions;

        for (const projectId in groups) {
            const projectIdNum = Number(projectId);
            const projectSubmissions = groups[projectIdNum].filter(
                (s: AdminSubmission) =>
                    matchesSearch(s, searchQuery) &&
                    matchesStatusFilters(s) &&
                    matchesProjectTypeFilters(s) &&
                    matchesPriorityFilter(s) &&
                    matchesFraudFilter(s) &&
                    matchesSusFilter(s),
            );

            if (projectSubmissions.length > 0) {
                const count = projectSubmissions.length;
                if (
                    submissionCountFilter === 'all' ||
                    (submissionCountFilter === 'single' && count === 1) ||
                    (submissionCountFilter === 'multiple' && count > 1)
                ) {
                    filtered[projectIdNum] = projectSubmissions;
                }
            }
        }

        return filtered;
    });

    let sortedGroupedSubmissionsEntries = $derived.by(() => {
        const entries = Object.entries(filteredGroupedSubmissions);
        return entries.sort(
            ([_projectIdA, submissionsA], [_projectIdB, submissionsB]) => {
                const firstSubmissionA = submissionsA[0];
                const firstSubmissionB = submissionsB[0];
                return compareSubmissions(firstSubmissionA, firstSubmissionB);
            },
        );
    });

    let statusCounts = $derived({
        all: submissions.length,
        pending: submissions.filter((s) => s.approvalStatus === 'pending').length,
        approved: submissions.filter((s) => s.approvalStatus === 'approved').length,
        rejected: submissions.filter((s) => s.approvalStatus === 'rejected').length,
    });

    function toggleStatus(status: string) {
        const newSet = new Set(selectedStatuses);
        if (newSet.has(status)) {
            newSet.delete(status);
        } else {
            newSet.add(status);
        }
        selectedStatuses = newSet;
    }

    function toggleProjectType(projectType: string) {
        const newSet = new Set(selectedProjectTypes);
        if (newSet.has(projectType)) {
            newSet.delete(projectType);
        } else {
            newSet.add(projectType);
        }
        selectedProjectTypes = newSet;
    }

    // Navigation helpers
    function getNextPendingSubmission(
        currentSubmissionId: number,
    ): { projectId: number; submissionId: number } | null {
        const projectIds = Object.keys(filteredGroupedSubmissions).map(Number);

        for (const projectId of projectIds) {
            const projectSubmissions = filteredGroupedSubmissions[projectId];
            for (const submission of projectSubmissions) {
                if (
                    submission.submissionId !== currentSubmissionId &&
                    submission.approvalStatus === 'pending'
                ) {
                    return { projectId, submissionId: submission.submissionId };
                }
            }
        }
        return null;
    }

    function advanceToNextSubmission(currentSubmissionId: number) {
        const next = getNextPendingSubmission(currentSubmissionId);
        if (next) {
            selectedSubmissionByProject = {
                ...selectedSubmissionByProject,
                [next.projectId]: next.submissionId,
            };
            const element = document.getElementById(`submission-card-${next.projectId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }

    // --- Effects ---

    $effect(() => {
        if (submissions.length === 0) return;

        submissionsLoaded = true;

        let updated = false;
        const drafts = { ...submissionDrafts };
        const selected = { ...selectedSubmissionByProject };

        const groups = groupedSubmissions;
        for (const projectId in groups) {
            const projectIdNum = Number(projectId);
            if (!selected[projectIdNum] && groups[projectIdNum]?.length > 0) {
                selected[projectIdNum] = groups[projectIdNum][0].submissionId;
                updated = true;
            }
        }

        for (const submission of submissions) {
            if (!drafts[submission.submissionId]) {
                drafts[submission.submissionId] = toSubmissionDraft(submission);
                updated = true;
            }
        }

        if (updated) {
            submissionDrafts = drafts;
            selectedSubmissionByProject = selected;
        }
    });

    // --- Mount ---

    onMount(() => {
        Promise.all([loadSubmissions(false), loadGlobalSettings()]);
    });
</script>

<svelte:head>
    <title>Submissions - Admin Panel</title>
</svelte:head>

<section class="space-y-4">
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 class="text-2xl font-semibold">Submission Review Platform</h2>
        <div class="flex items-center gap-3">
            {#if globalSettings}
                <button
                    class={`px-4 py-2 rounded-lg border transition-colors flex items-center gap-2 ${
                        globalSettings.submissionsFrozen
                            ? 'bg-blue-600/20 border-blue-500 text-blue-300 hover:bg-blue-600/30'
                            : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                    }`}
                    onclick={toggleGlobalSubmissionsFrozen}
                    disabled={globalSettingsLoading}
                >
                    {#if globalSettingsLoading}
                        <span class="animate-spin">&#10227;</span>
                    {:else}
                        <span>{globalSettings.submissionsFrozen ? '&#129482;' : '&#9654;&#65039;'}</span>
                    {/if}
                    {globalSettings.submissionsFrozen ? 'Submissions Frozen' : 'Freeze All Submissions'}
                </button>
            {/if}
            <button
                class="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 transition-colors"
                onclick={() => loadSubmissions(false)}
            >
                Refresh
            </button>
        </div>
    </div>

    {#if globalSettings?.submissionsFrozen}
        <div class="rounded-xl border border-blue-500 bg-blue-600/10 p-4 flex items-center gap-3">
            <span class="text-2xl">&#129482;</span>
            <div>
                <p class="font-semibold text-blue-300">Submissions are currently frozen</p>
                <p class="text-sm text-blue-400">Users cannot submit or resubmit projects until unfrozen.</p>
            </div>
        </div>
    {/if}

    <div class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-6">
        <div class="grid gap-4 md:grid-cols-2">
            <div>
                <div class="text-sm font-medium text-gray-300 mb-2">Date Range for Billy Links</div>
                <div class="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
                    <div class="flex-1">
                        <label for="date-range-start" class="block text-xs text-gray-400 mb-1">Start Date</label>
                        <input
                            id="date-range-start"
                            type="date"
                            class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                            bind:value={dateRangeStart}
                        />
                    </div>
                    <div class="flex-1">
                        <label for="date-range-end" class="block text-xs text-gray-400 mb-1">End Date</label>
                        <input
                            id="date-range-end"
                            type="date"
                            class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                            bind:value={dateRangeEnd}
                        />
                    </div>
                    <div>
                        <button
                            class="px-4 py-2 rounded-lg border border-gray-600 bg-gray-800 text-gray-400 text-sm hover:bg-gray-700 transition-colors whitespace-nowrap"
                            onclick={() => {
                                const defaultRange = getDefaultDateRange();
                                dateRangeStart = defaultRange.startDate;
                                dateRangeEnd = defaultRange.endDate;
                            }}
                        >
                            Reset
                        </button>
                    </div>
                </div>
            </div>

            <div>
                <label for="search-submissions" class="block text-sm font-medium text-gray-300 mb-2">Search</label>
                <input
                    id="search-submissions"
                    type="text"
                    placeholder="Search by project title, user name, email, or description..."
                    class="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    bind:value={searchQuery}
                />
            </div>
        </div>

        <div class="grid gap-4 md:grid-cols-6">
            <div>
                <div class="block text-sm font-medium text-gray-300 mb-2">Priority Filter</div>
                <div class="flex flex-wrap gap-2">
                    <button
                        class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                            priorityFilterEnabled
                                ? 'bg-yellow-600 border-yellow-400 text-white'
                                : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                        }`}
                        onclick={togglePriorityFilter}
                        disabled={priorityUsersLoading}
                    >
                        {priorityUsersLoading ? 'Loading...' : 'Priority (50+ hrs)'}
                        {#if priorityFilterEnabled}
                            <span class="ml-1">&#10003;</span>
                        {/if}
                    </button>
                    {#if priorityFilterEnabled && priorityUsersLoaded}
                        <span class="px-2 py-1.5 text-xs text-gray-400 self-center">
                            ({priorityUsers.length} users)
                        </span>
                    {/if}
                </div>
            </div>
            <div>
                <div class="block text-sm font-medium text-gray-300 mb-2">Filter by Submission Count</div>
                <div class="flex flex-wrap gap-2">
                    <button
                        class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                            submissionCountFilter === 'all'
                                ? 'bg-purple-600 border-purple-400 text-white'
                                : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                        }`}
                        onclick={() => (submissionCountFilter = 'all')}
                    >
                        All
                    </button>
                    <button
                        class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                            submissionCountFilter === 'single'
                                ? 'bg-purple-600 border-purple-400 text-white'
                                : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                        }`}
                        onclick={() => (submissionCountFilter = 'single')}
                    >
                        Single
                    </button>
                    <button
                        class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                            submissionCountFilter === 'multiple'
                                ? 'bg-purple-600 border-purple-400 text-white'
                                : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                        }`}
                        onclick={() => (submissionCountFilter = 'multiple')}
                    >
                        Multiple
                    </button>
                </div>
            </div>
            <div>
                <div class="block text-sm font-medium text-gray-300 mb-2">Filter by Status</div>
                <div class="flex flex-wrap gap-2">
                    {#each statusOptions as status}
                        <button
                            class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                                selectedStatuses.has(status)
                                    ? status === 'pending'
                                        ? 'bg-yellow-600 border-yellow-400 text-white'
                                        : status === 'approved'
                                          ? 'bg-green-600 border-green-400 text-white'
                                          : 'bg-red-600 border-red-400 text-white'
                                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                            }`}
                            onclick={() => toggleStatus(status)}
                        >
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                            {#if selectedStatuses.has(status)}
                                <span class="ml-1">&#10003;</span>
                            {/if}
                        </button>
                    {/each}
                    {#if selectedStatuses.size > 0}
                        <button
                            class="px-3 py-1.5 rounded-lg border border-gray-600 bg-gray-800 text-gray-400 text-sm hover:bg-gray-700 transition-colors"
                            onclick={() => (selectedStatuses = new Set())}
                        >
                            Clear
                        </button>
                    {/if}
                </div>
            </div>

            <div>
                <div class="block text-sm font-medium text-gray-300 mb-2">Filter by Project Type</div>
                <div class="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                    {#each projectTypes as projectType}
                        <button
                            class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                                selectedProjectTypes.has(projectType)
                                    ? 'bg-purple-600 border-purple-400 text-white'
                                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                            }`}
                            onclick={() => toggleProjectType(projectType)}
                        >
                            {formatProjectType(projectType)}
                            {#if selectedProjectTypes.has(projectType)}
                                <span class="ml-1">&#10003;</span>
                            {/if}
                        </button>
                    {/each}
                    {#if selectedProjectTypes.size > 0}
                        <button
                            class="px-3 py-1.5 rounded-lg border border-gray-600 bg-gray-800 text-gray-400 text-sm hover:bg-gray-700 transition-colors"
                            onclick={() => (selectedProjectTypes = new Set())}
                        >
                            Clear
                        </button>
                    {/if}
                </div>
            </div>

            <div>
                <div class="block text-sm font-medium text-gray-300 mb-2">Filter Fraud/Sus</div>
                <div class="flex flex-col gap-2">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            bind:checked={showFraudSubmissions}
                            class="w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500 focus:ring-2"
                        />
                        <span class="text-sm text-gray-300">Show fraud</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            bind:checked={showSusSubmissions}
                            class="w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500 focus:ring-2"
                        />
                        <span class="text-sm text-gray-300">Show sus</span>
                    </label>
                </div>
            </div>

            <div>
                <div class="block text-sm font-medium text-gray-300 mb-2">Sort By</div>
                <div class="flex gap-2">
                    <select
                        class="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        bind:value={sortField}
                    >
                        <option value="createdAt">Date Created</option>
                        <option value="projectTitle">Project Title</option>
                        <option value="userName">User Name</option>
                        <option value="approvalStatus">Status</option>
                        <option value="nowHackatimeHours">Hackatime Hours</option>
                        <option value="approvedHours">Approved Hours</option>
                    </select>
                    <button
                        class="px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-white transition-colors"
                        onclick={() => (sortDirection = sortDirection === 'asc' ? 'desc' : 'asc')}
                        title={sortDirection === 'asc' ? 'Sort ascending' : 'Sort descending'}
                    >
                        {sortDirection === 'asc' ? '\u2191' : '\u2193'}
                    </button>
                </div>
            </div>
        </div>

        <div class="text-sm text-gray-400">
            Showing {Object.keys(filteredGroupedSubmissions).length}
            project{Object.keys(filteredGroupedSubmissions).length === 1 ? '' : 's'} with {Object.values(filteredGroupedSubmissions).reduce((sum, subs) => sum + subs.length, 0)} submission{Object.values(filteredGroupedSubmissions).reduce((sum, subs) => sum + subs.length, 0) === 1 ? '' : 's'} of {submissions.length} total
        </div>
    </div>

    <!-- Reviewer Leaderboard -->
    <div class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-4">
        <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold flex items-center gap-2">
                Reviewer Leaderboard
            </h3>
            <button
                class="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 transition-colors text-sm"
                onclick={loadReviewerLeaderboard}
                disabled={leaderboardLoading}
            >
                {leaderboardLoading ? 'Loading...' : leaderboardLoaded ? 'Refresh' : 'Load Leaderboard'}
            </button>
        </div>

        {#if leaderboardLoaded && reviewerLeaderboard.length > 0}
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-gray-800/50">
                        <tr>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-gray-300">#</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-gray-300">Reviewer</th>
                            <th class="px-4 py-3 text-center text-sm font-semibold text-green-400">Approved</th>
                            <th class="px-4 py-3 text-center text-sm font-semibold text-red-400">Rejected</th>
                            <th class="px-4 py-3 text-center text-sm font-semibold text-purple-400">Total</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-gray-300">Last Review</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-700">
                        {#each reviewerLeaderboard as reviewer, index}
                            <tr
                                class="hover:bg-gray-800/30 {index === 0
                                    ? 'bg-yellow-500/10'
                                    : index === 1
                                      ? 'bg-gray-400/10'
                                      : index === 2
                                        ? 'bg-amber-600/10'
                                        : ''}"
                            >
                                <td
                                    class="px-4 py-3 text-sm font-bold {index === 0
                                        ? 'text-yellow-400'
                                        : index === 1
                                          ? 'text-gray-300'
                                          : index === 2
                                            ? 'text-amber-500'
                                            : 'text-gray-400'}"
                                >
                                    {#if index === 0}1st{:else if index === 1}2nd{:else if index === 2}3rd{:else}{index + 1}{/if}
                                </td>
                                <td class="px-4 py-3">
                                    <p class="text-sm font-medium text-white">
                                        {reviewer.firstName || ''} {reviewer.lastName || ''}
                                    </p>
                                    <p class="text-xs text-gray-400">
                                        {reviewer.email || `ID: ${reviewer.reviewerId}`}
                                    </p>
                                </td>
                                <td class="px-4 py-3 text-center text-sm font-semibold text-green-400">{reviewer.approved}</td>
                                <td class="px-4 py-3 text-center text-sm font-semibold text-red-400">{reviewer.rejected}</td>
                                <td class="px-4 py-3 text-center text-sm font-bold text-purple-400">{reviewer.total}</td>
                                <td class="px-4 py-3 text-sm text-gray-400">
                                    {reviewer.lastReviewedAt ? formatDate(reviewer.lastReviewedAt) : '\u2014'}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {:else if leaderboardLoaded}
            <p class="text-gray-400 text-sm">No reviews recorded yet.</p>
        {:else}
            <p class="text-gray-500 text-sm">Click "Load Leaderboard" to see reviewer stats.</p>
        {/if}
    </div>

    <!-- Submissions List -->
    {#if submissionsLoading}
        <div class="py-12 text-center text-gray-300">Loading submissions...</div>
    {:else if Object.keys(filteredGroupedSubmissions).length === 0}
        <div class="py-12 text-center text-gray-300">No submissions match your filters.</div>
    {:else}
        <div class="grid gap-6">
            {#each sortedGroupedSubmissionsEntries as [projectIdStr, projectSubmissions]}
                {@const projectId = Number(projectIdStr)}
                {@const selectedSubmissionId = selectedSubmissionByProject[projectId] ?? projectSubmissions[0].submissionId}
                {@const selectedSubmission = projectSubmissions.find((s: AdminSubmission) => s.submissionId === selectedSubmissionId) ?? projectSubmissions[0]}
                {@const selectedIndex = projectSubmissions.indexOf(selectedSubmission)}
                {@const previousSubmission = selectedIndex < projectSubmissions.length - 1 ? projectSubmissions[selectedIndex + 1] : null}
                {@const deltaHours = selectedSubmission.approvedHours != null && previousSubmission?.approvedHours != null ? selectedSubmission.approvedHours - previousSubmission.approvedHours : null}
                <div
                    id="submission-card-{projectId}"
                    class={`rounded-2xl border bg-gray-900/70 backdrop-blur p-4 md:p-6 space-y-4 min-w-0 max-w-full overflow-hidden ${
                        selectedSubmission.project.user.isSus
                            ? 'border-yellow-500'
                            : selectedSubmission.project.isFraud
                              ? 'border-red-500'
                              : 'border-gray-700'
                    }`}
                >
                    {#if selectedSubmission.project.isFraud}
                        <div class="bg-red-600/20 border-2 border-red-500 rounded-lg p-3 mb-4">
                            <p class="text-red-300 font-bold text-center uppercase tracking-wide">
                                FRAUD FLAGGED
                            </p>
                        </div>
                    {/if}
                    {#if selectedSubmission.project.user.isSus}
                        <div class="bg-yellow-600/20 border-2 border-yellow-500 rounded-lg p-3 mb-4">
                            <p class="text-yellow-300 font-bold text-center uppercase tracking-wide">
                                SUS FLAGGED
                            </p>
                        </div>
                    {/if}
                    {#if projectSubmissions.length > 1}
                        <div class="mb-4 pb-4 border-b border-gray-700">
                            <h4 class="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">
                                Submissions ({projectSubmissions.length})
                            </h4>
                            <div class="flex flex-wrap gap-2">
                                {#each projectSubmissions as sub}
                                    <button
                                        class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                                            selectedSubmissionId === sub.submissionId
                                                ? selectedSubmission.project.user.isSus
                                                    ? 'bg-yellow-600 border-yellow-400 text-white'
                                                    : 'bg-purple-600 border-purple-400 text-white'
                                                : selectedSubmission.project.user.isSus
                                                  ? 'bg-yellow-600/20 border-yellow-500 text-yellow-300 hover:bg-yellow-600/30'
                                                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                                        }`}
                                        onclick={() =>
                                            (selectedSubmissionByProject = {
                                                ...selectedSubmissionByProject,
                                                [projectId]: sub.submissionId,
                                            })}
                                    >
                                        {formatDate(sub.createdAt)}
                                        <span
                                            class={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                                                sub.approvalStatus === 'approved'
                                                    ? 'bg-green-500/20 text-green-300'
                                                    : sub.approvalStatus === 'rejected'
                                                      ? 'bg-red-500/20 text-red-300'
                                                      : 'bg-yellow-500/20 text-yellow-300'
                                            }`}
                                        >
                                            {sub.approvalStatus}
                                        </span>
                                    </button>
                                {/each}
                            </div>
                        </div>
                    {/if}
                    <div class="flex flex-col gap-4 md:flex-row md:gap-6">
                        {#if selectedSubmission.screenshotUrl || selectedSubmission.project.screenshotUrl}
                            <div class="w-full md:w-64 flex-shrink-0">
                                <h4 class="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-2">
                                    Screenshot Preview
                                </h4>
                                <a
                                    href={selectedSubmission.screenshotUrl || selectedSubmission.project.screenshotUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    <img
                                        src={selectedSubmission.screenshotUrl || selectedSubmission.project.screenshotUrl}
                                        alt="Project screenshot"
                                        loading="lazy"
                                        decoding="async"
                                        class="w-full h-48 object-cover rounded-lg border border-gray-700 hover:border-purple-500 transition-colors cursor-pointer"
                                    />
                                </a>
                            </div>
                        {/if}

                        <div class="flex-1 space-y-4 min-w-0">
                            <div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                <div>
                                    <h3 class="text-2xl font-semibold">
                                        {selectedSubmission.project.projectTitle}
                                    </h3>
                                    <p class="text-sm text-gray-400">
                                        Submitted {formatDate(selectedSubmission.createdAt)}
                                    </p>
                                </div>
                                <span
                                    class={`px-3 py-1 rounded-full text-sm border self-start ${
                                        selectedSubmission.project.user.isSus
                                            ? 'bg-yellow-500/20 border-yellow-400 text-yellow-300'
                                            : selectedSubmission.approvalStatus === 'approved'
                                              ? 'bg-green-500/20 border-green-400 text-green-300'
                                              : selectedSubmission.approvalStatus === 'rejected'
                                                ? 'bg-red-500/20 border-red-400 text-red-300'
                                                : 'bg-yellow-500/20 border-yellow-400 text-yellow-200'
                                    }`}
                                >
                                    {selectedSubmission.project.user.isSus
                                        ? 'SUS'
                                        : selectedSubmission.approvalStatus.toUpperCase()}
                                </span>
                            </div>

                            <div class="grid gap-4 md:grid-cols-2">
                                <div class="space-y-2">
                                    <h4 class="text-sm font-semibold uppercase tracking-wide text-gray-400">User Info</h4>
                                    <p class="text-lg font-medium">
                                        {fullName(selectedSubmission.project.user)}
                                    </p>
                                    <p class="text-sm text-gray-300">
                                        {selectedSubmission.project.user.email}
                                    </p>
                                    <div class="flex items-center gap-2 mb-2">
                                        <button
                                            class={`px-3 py-1 text-xs rounded border transition-colors ${
                                                selectedSubmission.project.user.isSus
                                                    ? 'bg-yellow-600/20 border-yellow-500 text-yellow-300 hover:bg-yellow-600/30'
                                                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                                            }`}
                                            onclick={() => toggleSusFlag(selectedSubmission.project.user.userId, selectedSubmission.project.user.isSus)}
                                        >
                                            {selectedSubmission.project.user.isSus ? 'Sus Flagged' : 'Flag as Sus'}
                                        </button>
                                    </div>
                                    {#if selectedSubmission.project.user.hackatimeAccount}
                                        <p class="text-sm text-purple-300">
                                            Hackatime: <span class="font-mono">{selectedSubmission.project.user.hackatimeAccount}</span>
                                        </p>
                                    {/if}
                                    <p class="text-sm {selectedSubmission.project.user.slackUserId ? 'text-green-300' : 'text-gray-500'}">
                                        Slack: {selectedSubmission.project.user.slackUserId ? selectedSubmission.project.user.slackUserId : 'Not linked'}
                                    </p>
                                    <p class="text-sm text-gray-400">
                                        {selectedSubmission.project.user.city ? `${selectedSubmission.project.user.city}, ` : ''}{selectedSubmission.project.user.state}
                                    </p>
                                    <button
                                        class="text-xs text-left text-blue-400 hover:text-blue-300 transition-colors"
                                        onclick={() => (addressExpanded[selectedSubmission.submissionId] = !addressExpanded[selectedSubmission.submissionId])}
                                    >
                                        {addressExpanded[selectedSubmission.submissionId] ? '\u25BC' : '\u25B6'} Full Address
                                    </button>
                                    {#if addressExpanded[selectedSubmission.submissionId]}
                                        <div class="mt-2 p-3 bg-gray-800/50 rounded-lg border border-gray-700 text-xs text-gray-300 space-y-1">
                                            {#if selectedSubmission.project.user.addressLine1}
                                                <p>{selectedSubmission.project.user.addressLine1}</p>
                                            {/if}
                                            {#if selectedSubmission.project.user.addressLine2}
                                                <p>{selectedSubmission.project.user.addressLine2}</p>
                                            {/if}
                                            <p>
                                                {[
                                                    selectedSubmission.project.user.city,
                                                    selectedSubmission.project.user.state,
                                                    selectedSubmission.project.user.zipCode,
                                                ]
                                                    .filter(Boolean)
                                                    .join(', ')}
                                            </p>
                                            {#if selectedSubmission.project.user.country}
                                                <p>{selectedSubmission.project.user.country}</p>
                                            {/if}
                                            {#if selectedSubmission.project.user.birthday}
                                                <p class="pt-2 border-t border-gray-700">
                                                    Birthday: {formatDate(selectedSubmission.project.user.birthday)}
                                                </p>
                                            {/if}
                                        </div>
                                    {/if}
                                </div>
                                <div class="space-y-2">
                                    <h4 class="text-sm font-semibold uppercase tracking-wide text-gray-400">Project Info</h4>
                                    <div class="flex items-center gap-2 mb-2">
                                        <button
                                            class={`px-3 py-1 text-xs rounded border transition-colors ${
                                                selectedSubmission.project.isFraud
                                                    ? 'bg-red-600/20 border-red-500 text-red-300 hover:bg-red-600/30'
                                                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                                            }`}
                                            onclick={() => toggleFraudFlag(selectedSubmission.project.projectId, selectedSubmission.project.isFraud)}
                                        >
                                            {selectedSubmission.project.isFraud ? 'Fraud Flagged' : 'Flag as Fraud'}
                                        </button>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <p class="text-sm text-gray-300">
                                            Hackatime hours: <span class="font-semibold text-purple-300">{formatHours(selectedSubmission.project.nowHackatimeHours)}</span>
                                        </p>
                                        <button
                                            class="px-2 py-1 text-xs rounded bg-purple-700 hover:bg-purple-600 border border-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            onclick={() => recalculateSubmissionHours(selectedSubmission.submissionId, selectedSubmission.project.projectId)}
                                            disabled={submissionRecalculating[selectedSubmission.submissionId]}
                                        >
                                            {submissionRecalculating[selectedSubmission.submissionId] ? '\u27F3 Calculating...' : '\u27F3 Recalc'}
                                        </button>
                                    </div>
                                    {#if selectedSubmission.project.nowHackatimeProjects?.length}
                                        <p class="text-sm text-gray-400">
                                            Projects: {selectedSubmission.project.nowHackatimeProjects.join(', ')}
                                        </p>
                                    {/if}
                                    {#if selectedSubmission.project.approvedHours !== null}
                                        <p class="text-sm text-green-300">
                                            Approved hours (total): <span class="font-semibold">{formatHours(selectedSubmission.project.approvedHours)}</span>
                                        </p>
                                    {/if}
                                    {#if deltaHours != null}
                                        <p class="text-sm text-blue-300">
                                            Additional hours (this submission): <span class="font-semibold">+{formatHours(deltaHours)}</span>
                                        </p>
                                    {/if}
                                </div>
                            </div>

                            {#if selectedSubmission.description || selectedSubmission.project.description}
                                <div class="space-y-2">
                                    <h4 class="text-sm font-semibold uppercase tracking-wide text-gray-400">Description</h4>
                                    <p class="text-sm text-gray-300 break-words">
                                        {selectedSubmission.description || selectedSubmission.project.description}
                                    </p>
                                </div>
                            {/if}

                            {#if selectedSubmission.hoursJustification}
                                <div class="space-y-2 bg-blue-950/30 border border-blue-800 rounded-lg p-4">
                                    <h4 class="text-sm font-semibold uppercase tracking-wide text-blue-300">User Feedback</h4>
                                    <p class="text-sm text-gray-300 break-words">{selectedSubmission.hoursJustification}</p>
                                </div>
                            {/if}

                            {#if selectedSubmission.project.hoursJustification}
                                <div class="space-y-2 bg-purple-950/30 border border-purple-800 rounded-lg p-4">
                                    <h4 class="text-sm font-semibold uppercase tracking-wide text-purple-300">Hours Justification (Admin Only)</h4>
                                    <p class="text-sm text-gray-300 break-words">{selectedSubmission.project.hoursJustification}</p>
                                </div>
                            {/if}

                            {#if selectedSubmission.project.adminComment}
                                <div class="space-y-2 bg-orange-950/30 border border-orange-800 rounded-lg p-4">
                                    <h4 class="text-sm font-semibold uppercase tracking-wide text-orange-300">Admin Comment</h4>
                                    <p class="text-sm text-gray-300 break-words">{selectedSubmission.project.adminComment}</p>
                                </div>
                            {/if}

                            <div class="flex flex-wrap gap-2">
                                <h4 class="text-sm font-semibold uppercase tracking-wide text-gray-400 w-full">Quick Actions</h4>
                                {#if selectedSubmission.playableUrl || selectedSubmission.project.playableUrl}
                                    {@const normalizedPlayableUrl = normalizeUrl(selectedSubmission.playableUrl || selectedSubmission.project.playableUrl)}
                                    {#if normalizedPlayableUrl}
                                        <a
                                            href={normalizedPlayableUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 border border-blue-400 text-white text-sm transition-colors"
                                        >
                                            View Live Demo
                                        </a>
                                    {/if}
                                {/if}
                                {#if selectedSubmission.repoUrl || selectedSubmission.project.repoUrl}
                                    <a
                                        href={selectedSubmission.repoUrl || selectedSubmission.project.repoUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        class="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 border border-gray-500 text-white text-sm transition-colors"
                                    >
                                        View Repository
                                    </a>
                                    <a
                                        href={`https://airlock.hackclub.com/?r=${selectedSubmission.repoUrl || selectedSubmission.project.repoUrl}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        class="px-4 py-2 rounded-lg bg-orange-700 hover:bg-orange-600 border border-orange-500 text-white text-sm transition-colors"
                                    >
                                        Open in Airlock
                                    </a>
                                {/if}
                                {#if selectedSubmission.screenshotUrl || selectedSubmission.project.screenshotUrl}
                                    <a
                                        href={selectedSubmission.screenshotUrl || selectedSubmission.project.screenshotUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        class="px-4 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 border border-purple-500 text-white text-sm transition-colors"
                                    >
                                        Full Screenshot
                                    </a>
                                {/if}
                                {#if generateBillyLink(selectedSubmission.project.user.hackatimeAccount)}
                                    {@const billyLinkResult = generateBillyLink(selectedSubmission.project.user.hackatimeAccount)}
                                    <a
                                        href={billyLinkResult}
                                        target="_blank"
                                        rel="noreferrer"
                                        class="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 border border-green-400 text-white text-sm transition-colors"
                                    >
                                        Billy
                                    </a>
                                {:else}
                                    <span
                                        class="px-4 py-2 rounded-lg bg-gray-600 border border-gray-500 text-gray-400 text-sm cursor-not-allowed"
                                        title="Hackatime account not available"
                                    >
                                        Billy
                                    </span>
                                {/if}
                            </div>
                        </div>
                    </div>

                    <!-- Review Controls -->
                    <div class="border-t border-gray-700 pt-4 space-y-4">
                        <h4 class="text-sm font-semibold uppercase tracking-wide text-gray-400">Review Controls</h4>

                        <div class="grid gap-4 md:grid-cols-3">
                            <div class="space-y-2">
                                <label class="text-sm font-medium text-gray-300" for={statusIdFor(selectedSubmission.submissionId)}>Status</label>
                                <select
                                    id={statusIdFor(selectedSubmission.submissionId)}
                                    class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    bind:value={submissionDrafts[selectedSubmission.submissionId].approvalStatus}
                                >
                                    {#each statusOptions as option}
                                        <option value={option}>{option}</option>
                                    {/each}
                                </select>
                            </div>
                            <div class="space-y-2">
                                <label class="text-sm font-medium text-gray-300" for={hoursIdFor(selectedSubmission.submissionId)}>Approved Hours</label>
                                <input
                                    id={hoursIdFor(selectedSubmission.submissionId)}
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    bind:value={submissionDrafts[selectedSubmission.submissionId].approvedHours}
                                />
                            </div>
                            <div class="space-y-2">
                                <label class="text-sm font-medium text-gray-300" for={userFeedbackIdFor(selectedSubmission.submissionId)}>User Feedback (sent via email)</label>
                                <textarea
                                    id={userFeedbackIdFor(selectedSubmission.submissionId)}
                                    class="w-full min-w-0 rounded-lg border border-blue-600 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                                    rows="2"
                                    placeholder="Feedback to send to the user..."
                                    bind:value={submissionDrafts[selectedSubmission.submissionId].userFeedback}
                                ></textarea>
                            </div>
                            <div class="space-y-2">
                                <label class="text-sm font-medium text-gray-300" for={justificationIdFor(selectedSubmission.submissionId)}>Hours Justification (admin only, synced to Airtable)</label>
                                <textarea
                                    id={justificationIdFor(selectedSubmission.submissionId)}
                                    class="w-full min-w-0 rounded-lg border border-purple-600 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
                                    rows="2"
                                    placeholder="Internal justification for Airtable..."
                                    bind:value={submissionDrafts[selectedSubmission.submissionId].hoursJustification}
                                ></textarea>
                            </div>
                            <div class="space-y-2">
                                <label class="text-sm font-medium text-gray-300" for="submission-{selectedSubmission.submissionId}-admin-comment">Admin Comment (internal, logged in timeline)</label>
                                <textarea
                                    id="submission-{selectedSubmission.submissionId}-admin-comment"
                                    class="w-full min-w-0 rounded-lg border border-orange-600 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-y"
                                    rows="2"
                                    placeholder="Internal comment (visible to admins only)..."
                                    bind:value={submissionDrafts[selectedSubmission.submissionId].adminComment}
                                ></textarea>
                            </div>
                        </div>

                        <div class="flex items-center gap-3 py-3">
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    class="w-4 h-4 rounded border-gray-700 bg-gray-800 text-purple-600 focus:ring-2 focus:ring-purple-500 focus:ring-offset-gray-900"
                                    bind:checked={submissionDrafts[selectedSubmission.submissionId].sendEmailNotification}
                                />
                                <span class="text-sm font-medium text-gray-300">Send email notification on status change</span>
                            </label>
                        </div>

                        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div class="flex flex-wrap gap-2">
                                {#if selectedSubmission.approvalStatus !== 'approved'}
                                    <button
                                        class="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 border border-green-400 transition-colors disabled:bg-gray-700 disabled:cursor-not-allowed"
                                        onclick={() => quickApprove(selectedSubmission)}
                                        disabled={submissionSaving[selectedSubmission.submissionId]}
                                    >
                                        Quick Approve
                                    </button>
                                {/if}
                                {#if selectedSubmission.approvalStatus !== 'rejected'}
                                    <button
                                        class="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 border border-red-400 transition-colors disabled:bg-gray-700 disabled:cursor-not-allowed"
                                        onclick={() => quickDeny(selectedSubmission.submissionId)}
                                        disabled={submissionSaving[selectedSubmission.submissionId]}
                                    >
                                        Quick Deny
                                    </button>
                                {/if}
                                <button
                                    class="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 transition-colors disabled:bg-gray-700 disabled:cursor-not-allowed"
                                    onclick={() => saveSubmission(selectedSubmission.submissionId)}
                                    disabled={submissionSaving[selectedSubmission.submissionId]}
                                >
                                    {submissionSaving[selectedSubmission.submissionId] ? 'Saving...' : 'Save Changes'}
                                </button>
                                <button
                                    class="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
                                    onclick={() => setSubmissionDraft(selectedSubmission, true)}
                                >
                                    Reset
                                </button>
                            </div>
                            <div class="text-sm">
                                {#if submissionErrors[selectedSubmission.submissionId]}
                                    <span class="text-red-400">{submissionErrors[selectedSubmission.submissionId]}</span>
                                {:else if submissionSuccess[selectedSubmission.submissionId]}
                                    <span class="text-green-400">{submissionSuccess[selectedSubmission.submissionId]}</span>
                                {/if}
                            </div>
                        </div>
                    </div>

                    <!-- Timeline Section -->
                    <div class="border-t border-gray-700 pt-4">
                        <button
                            class="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-200 transition-colors"
                            onclick={() => loadTimeline(selectedSubmission.project.projectId)}
                        >
                            {#if timelineLoading[selectedSubmission.project.projectId]}
                                <span class="animate-spin">&#8635;</span> Loading Timeline...
                            {:else}
                                <span>{timelineOpen[selectedSubmission.project.projectId] ? '\u25BC' : '\u25B6'}</span>
                                Project Timeline
                            {/if}
                        </button>

                        {#if timelineOpen[selectedSubmission.project.projectId] && timelineByProject[selectedSubmission.project.projectId]}
                            {@const timeline = timelineByProject[selectedSubmission.project.projectId].timeline}
                            <div class="mt-4 relative ml-3">
                                <!-- Vertical line -->
                                <div class="absolute left-1 top-0 bottom-0 w-0.5 bg-gray-700"></div>

                                <div class="space-y-3">
                                    {#each timeline as event, i}
                                        <div class="relative pl-6">
                                            <!-- Dot -->
                                            <div class="absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full {timelineDotColor(event.type)} ring-2 ring-gray-900"></div>

                                            <div class="rounded-lg border p-3 {timelineEventColor(event.type)}">
                                                <div class="flex flex-wrap items-center gap-2 mb-1">
                                                    <span class="text-xs font-bold uppercase tracking-wide text-gray-200">
                                                        {timelineEventLabel(event.type)}
                                                    </span>
                                                    <span class="text-xs text-gray-400">
                                                        {formatDate(event.timestamp)}
                                                    </span>
                                                    {#if event.actor}
                                                        <span class="text-xs text-gray-400">
                                                            by {event.actor.firstName ?? ''} {event.actor.lastName ?? ''} ({event.actor.email})
                                                        </span>
                                                    {/if}
                                                </div>

                                                {#if event.type === 'admin_review' && (event.details as any).newStatus}
                                                    <div class="flex items-center gap-2 text-xs">
                                                        {#if (event.details as any).changes?.previousStatus}
                                                            <span class="px-1.5 py-0.5 rounded {(event.details as any).changes.previousStatus === 'approved' ? 'bg-green-500/20 text-green-300' : (event.details as any).changes.previousStatus === 'rejected' ? 'bg-red-500/20 text-red-300' : 'bg-yellow-500/20 text-yellow-300'}">
                                                                {(event.details as any).changes.previousStatus}
                                                            </span>
                                                            <span class="text-gray-500">&rarr;</span>
                                                        {/if}
                                                        <span class="px-1.5 py-0.5 rounded {(event.details as any).newStatus === 'approved' ? 'bg-green-500/20 text-green-300' : (event.details as any).newStatus === 'rejected' ? 'bg-red-500/20 text-red-300' : 'bg-yellow-500/20 text-yellow-300'}">
                                                            {(event.details as any).newStatus}
                                                        </span>
                                                        {#if (event.details as any).approvedHours != null}
                                                            <span class="text-gray-400">({(event.details as any).approvedHours}h)</span>
                                                        {/if}
                                                        {#if (event.details as any).changes?.quickApprove}
                                                            <span class="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-600 text-[10px]">Quick Approve</span>
                                                        {/if}
                                                    </div>
                                                {/if}

                                                {#if event.type === 'admin_update' && (event.details as any).changes}
                                                    <div class="text-xs text-gray-300 space-y-0.5">
                                                        {#if (event.details as any).changes.adminComment !== undefined}
                                                            <p>Comment: <span class="text-gray-100">"{(event.details as any).changes.adminComment}"</span></p>
                                                        {/if}
                                                        {#if (event.details as any).changes.approvedHours !== undefined}
                                                            <p>Approved hours set to <span class="font-semibold text-gray-100">{(event.details as any).changes.approvedHours}</span></p>
                                                        {/if}
                                                        {#if (event.details as any).changes.userFeedback !== undefined}
                                                            <p>User feedback updated</p>
                                                        {/if}
                                                        {#if (event.details as any).changes.hoursJustification !== undefined}
                                                            <p>Hours justification updated</p>
                                                        {/if}
                                                    </div>
                                                {/if}

                                                {#if (event.details as any).changes?.adminComment !== undefined && event.type === 'admin_review'}
                                                    <p class="text-xs text-gray-300 mt-1">Comment: <span class="text-gray-100">"{(event.details as any).changes.adminComment}"</span></p>
                                                {/if}

                                                {#if event.type === 'project_updated' && (event.details as any).changedFields}
                                                    <div class="text-xs text-gray-300 space-y-0.5">
                                                        {#each Object.entries((event.details as any).changedFields) as [field, change]}
                                                            <p><span class="text-gray-400">{field}:</span> changed</p>
                                                        {/each}
                                                    </div>
                                                {/if}

                                                {#if (event.type === 'submission' || event.type === 'resubmission') && (event.details as any).hackatimeHours != null}
                                                    <p class="text-xs text-gray-400">Hackatime hours at submission: <span class="text-gray-200 font-semibold">{(event.details as any).hackatimeHours}</span></p>
                                                {/if}
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</section>
