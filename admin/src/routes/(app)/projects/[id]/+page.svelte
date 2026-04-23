<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { base } from '$app/paths';
    import { goto } from '$app/navigation';
    import { env } from '$env/dynamic/public';
    import { api, type components } from '$lib/api';
    import { Button, TextField, Card, Checkbox, Select, FilterTag } from '$lib/components';

    type AdminProject = components['schemas']['AdminProjectResponse'];
    type AdminSubmission = components['schemas']['AdminSubmissionResponse'];
    type UpdateAdminProjectDto = components['schemas']['UpdateAdminProjectDto'];
    type HackatimeListResponse = components['schemas']['ProjectOwnerHackatimeProjectsResponse'];
    type HackatimeProjectRow = HackatimeListResponse['projects'][number];
    type ProjectTimelineResponse = components['schemas']['ProjectTimelineResponse'];
    type ProjectType = NonNullable<UpdateAdminProjectDto['projectType']>;

    const projectTypes: ProjectType[] = [
        'windows_playable',
        'mac_playable',
        'linux_playable',
        'web_playable',
        'cross_platform_playable',
        'hardware',
        'mobile_app',
    ];
    const statusOptions = ['pending', 'approved', 'rejected'] as const;

    let projectId = $derived(parseInt($page.params.id ?? '', 10));

    // --- Auth ---
    let me = $state<{ role: string } | null>(null);
    let isSuperadmin = $derived(me?.role === 'superadmin');

    // --- Project ---
    let project = $state<AdminProject | null>(null);
    let loading = $state(true);
    let loadError = $state('');

    // --- Submissions (full data for review) ---
    let submissions = $state<AdminSubmission[]>([]);
    let submissionsLoading = $state(false);
    let selectedSubmissionId = $state<number | null>(null);
    let selectedSubmission = $derived(
        submissions.find((s) => s.submissionId === selectedSubmissionId) ?? submissions[0] ?? null,
    );

    // --- Review draft state ---
    type SubmissionDraft = {
        approvalStatus: string;
        approvedHours: string;
        userFeedback: string;
        hoursJustification: string;
        adminComment: string;
        sendEmailNotification: boolean;
    };
    let submissionDrafts = $state<Record<number, SubmissionDraft>>({});
    let submissionSaving = $state<Record<number, boolean>>({});
    let submissionErrors = $state<Record<number, string>>({});
    let submissionSuccess = $state<Record<number, string>>({});
    let submissionRecalculating = $state<Record<number, boolean>>({});
    let addressExpanded = $state(false);

    // --- Billy date range (persisted) ---
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

    const defaultDateRange = loadDateRangeFromStorage();
    let dateRangeStart = $state(defaultDateRange.startDate);
    let dateRangeEnd = $state(defaultDateRange.endDate);

    $effect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(
                'admin-submissions-date-range',
                JSON.stringify({ startDate: dateRangeStart, endDate: dateRangeEnd }),
            );
        }
    });

    function generateBillyLink(hackatimeAccount: string | null): string | null {
        if (!hackatimeAccount || hackatimeAccount.trim() === '') return null;
        return `https://billy.3kh0.net/?u=${hackatimeAccount}&d=${dateRangeStart}-${dateRangeEnd}`;
    }

    // --- Timeline ---
    let timeline = $state<ProjectTimelineResponse | null>(null);
    let timelineLoading = $state(false);
    let timelineOpen = $state(false);

    // --- Edit form state ---
    let saving = $state(false);
    let saveError = $state('');
    let saveSuccess = $state('');
    let editOpen = $state(false);

    let projectTitle = $state('');
    let projectType = $state<ProjectType>('web_playable');
    let description = $state('');
    let playableUrl = $state('');
    let repoUrl = $state('');
    let readmeUrl = $state('');
    let journalUrl = $state('');
    let screenshotUrl = $state('');
    let adminCommentEdit = $state('');
    let hoursJustificationEdit = $state('');
    let approvedHoursText = $state('');
    let isLocked = $state(false);
    let linkedProjects = $state<string[]>([]);

    // --- Hackatime attach UI ---
    let hackatimeLoading = $state(false);
    let hackatimeError = $state('');
    let hackatimeProjects = $state<HackatimeProjectRow[]>([]);
    let hackatimeOwnerAccount = $state<string | null>(null);
    let hackatimeOwnerStartDate = $state<string | null>(null);
    let manualHackatimeInput = $state('');

    // --- Per-project action state ---
    let projectBusy = $state(false);
    let projectError = $state('');
    let projectSuccess = $state('');

    // --- Helpers ---
    function formatDate(value: string) {
        return new Date(value).toLocaleString();
    }

    function formatHours(value: number | null | undefined) {
        if (value === null || value === undefined) return '—';
        return value.toFixed(1);
    }

    function fullName(user: { firstName: string | null; lastName: string | null }): string {
        const first = user.firstName ?? '';
        const last = user.lastName ?? '';
        const name = `${first} ${last}`.trim();
        return name || 'Unknown';
    }

    function normalizeUrl(url: string | null): string | null {
        if (!url) return null;
        const trimmed = url.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
        return `https://${trimmed}`;
    }

    function toDateInputValue(value: string | Date | null | undefined): string {
        if (!value) return '';
        const d = typeof value === 'string' ? new Date(value) : value;
        if (isNaN(d.getTime())) return '';
        return d.toISOString().split('T')[0];
    }

    function errorMessage(error: unknown, fallback: string): string {
        if (error && typeof error === 'object' && 'message' in error) {
            const msg = (error as { message?: unknown }).message;
            if (typeof msg === 'string') return msg;
        }
        return fallback;
    }

    function toSubmissionDraft(s: AdminSubmission): SubmissionDraft {
        return {
            approvalStatus: s.approvalStatus,
            approvedHours:
                s.project.approvedHours !== null
                    ? s.project.approvedHours.toString()
                    : s.project.nowHackatimeHours !== null
                      ? s.project.nowHackatimeHours.toFixed(1)
                      : '',
            userFeedback: s.hoursJustification ?? '',
            hoursJustification: s.project.hoursJustification ?? '',
            adminComment: s.project.adminComment ?? '',
            sendEmailNotification: false,
        };
    }

    function hydrateForm(p: AdminProject) {
        project = p;
        projectTitle = p.projectTitle ?? '';
        projectType = p.projectType as ProjectType;
        description = p.description ?? '';
        playableUrl = p.playableUrl ?? '';
        repoUrl = p.repoUrl ?? '';
        readmeUrl = p.readmeUrl ?? '';
        journalUrl = p.journalUrl ?? '';
        screenshotUrl = p.screenshotUrl ?? '';
        adminCommentEdit = p.adminComment ?? '';
        hoursJustificationEdit = p.hoursJustification ?? '';
        approvedHoursText =
            p.approvedHours === null || p.approvedHours === undefined ? '' : String(p.approvedHours);
        isLocked = p.isLocked ?? false;
        linkedProjects = [...(p.nowHackatimeProjects ?? [])];
    }

    function statusBadgeClass(status: string): string {
        switch (status) {
            case 'approved':
                return 'bg-green-500/20 border-green-400 text-green-700';
            case 'rejected':
                return 'bg-red-500/20 border-red-400 text-red-600';
            case 'pending':
                return 'bg-yellow-500/20 border-yellow-400 text-yellow-600';
            default:
                return 'bg-ds-surface-inactive border-ds-border text-ds-text-secondary';
        }
    }

    function timelineEventLabel(type: string): string {
        switch (type) {
            case 'project_created': return 'Project Created';
            case 'submission': return 'Submitted';
            case 'resubmission': return 'Resubmitted';
            case 'project_updated': return 'Project Updated';
            case 'admin_review': return 'Admin Reviewed';
            case 'admin_update': return 'Admin Updated';
            default: return type;
        }
    }

    function timelineEventColor(type: string): string {
        switch (type) {
            case 'project_created': return 'border-blue-500 bg-blue-500/10';
            case 'submission': return 'border-green-500 bg-green-500/10';
            case 'resubmission': return 'border-yellow-500 bg-yellow-500/10';
            case 'project_updated': return 'border-cyan-500 bg-cyan-500/10';
            case 'admin_review': return 'border-ds-accent bg-purple-500/10';
            case 'admin_update': return 'border-orange-500 bg-orange-500/10';
            default: return 'border-ds-border bg-ds-surface2';
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
            default: return 'bg-ds-surface-inactive';
        }
    }

    // --- API ---
    async function loadMe() {
        const { data } = await api.GET('/api/user/auth/me');
        if (data) me = { role: data.role };
    }

    async function loadProject() {
        loading = true;
        loadError = '';
        try {
            const { data, error } = await api.GET('/api/admin/projects/{id}', {
                params: { path: { id: projectId } },
            });
            if (error) {
                loadError = errorMessage(error, 'Failed to load project');
                return;
            }
            if (data) hydrateForm(data);
        } catch (e) {
            loadError = e instanceof Error ? e.message : 'Failed to load project';
        } finally {
            loading = false;
        }
    }

    async function loadSubmissions() {
        submissionsLoading = true;
        try {
            const { data, error } = await api.GET('/api/admin/submissions');
            if (error || !data) return;
            const mine = data
                .filter((s) => s.project.projectId === projectId)
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            submissions = mine;
            const drafts: Record<number, SubmissionDraft> = {};
            for (const s of mine) drafts[s.submissionId] = toSubmissionDraft(s);
            submissionDrafts = drafts;
            if (mine.length > 0 && selectedSubmissionId == null) {
                selectedSubmissionId = mine[0].submissionId;
            }
        } finally {
            submissionsLoading = false;
        }
    }

    async function loadHackatime() {
        hackatimeLoading = true;
        hackatimeError = '';
        try {
            const { data, error } = await api.GET('/api/admin/projects/{id}/hackatime-projects', {
                params: { path: { id: projectId } },
            });
            if (error) {
                hackatimeError = errorMessage(error, 'Failed to load Hackatime projects');
                return;
            }
            if (!data) return;
            hackatimeProjects = data.projects ?? [];
            hackatimeOwnerAccount = data.hackatimeAccount;
            hackatimeOwnerStartDate = data.hackatimeStartDate;
        } catch (e) {
            hackatimeError = e instanceof Error ? e.message : 'Failed to load Hackatime projects';
        } finally {
            hackatimeLoading = false;
        }
    }

    async function loadTimeline() {
        if (timeline) {
            timelineOpen = !timelineOpen;
            return;
        }
        timelineLoading = true;
        try {
            const { data, error } = await api.GET('/api/admin/projects/{id}/timeline', {
                params: { path: { id: projectId } },
            });
            if (!error && data) {
                timeline = data;
                timelineOpen = true;
            }
        } finally {
            timelineLoading = false;
        }
    }

    function invalidateTimeline() {
        timeline = null;
    }

    // --- Review actions ---
    async function saveSubmission(submissionId: number, sendEmail?: boolean) {
        const draft = submissionDrafts[submissionId];
        if (!draft) return;

        submissionSaving = { ...submissionSaving, [submissionId]: true };
        submissionErrors = { ...submissionErrors, [submissionId]: '' };
        submissionSuccess = { ...submissionSuccess, [submissionId]: '' };

        const shouldSendEmail = sendEmail !== undefined ? sendEmail : draft.sendEmailNotification;

        try {
            const { error } = await api.PUT('/api/reviewer/submissions/{id}/review', {
                params: { path: { id: submissionId } },
                body: {
                    approvalStatus: draft.approvalStatus as 'pending' | 'approved' | 'rejected',
                    approvedHours: draft.approvedHours === '' ? undefined : parseFloat(draft.approvedHours),
                    userFeedback: draft.userFeedback === '' ? undefined : draft.userFeedback,
                    hoursJustification: draft.hoursJustification === '' ? undefined : draft.hoursJustification,
                    adminComment: draft.adminComment === '' ? undefined : draft.adminComment,
                    sendEmail: shouldSendEmail,
                },
            });
            if (error) {
                submissionErrors = { ...submissionErrors, [submissionId]: 'Failed to update submission' };
                return;
            }
            submissionSuccess = { ...submissionSuccess, [submissionId]: 'Submission updated' };
            invalidateTimeline();
            await Promise.all([loadProject(), loadSubmissions()]);
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
        const id = submission.submissionId;
        submissionSaving = { ...submissionSaving, [id]: true };
        submissionErrors = { ...submissionErrors, [id]: '' };
        submissionSuccess = { ...submissionSuccess, [id]: '' };
        const draft = submissionDrafts[id];

        try {
            const { error } = await api.POST('/api/reviewer/submissions/{id}/quick-approve', {
                params: { path: { id } },
                body: {
                    userFeedback: draft?.userFeedback || undefined,
                    hoursJustification: draft?.hoursJustification || undefined,
                    approvedHours: draft?.approvedHours ? parseFloat(draft.approvedHours) : undefined,
                },
            });
            if (error) {
                submissionErrors = { ...submissionErrors, [id]: 'Failed to quick approve' };
                return;
            }
            submissionSuccess = { ...submissionSuccess, [id]: 'Quick approved and synced to Airtable' };
            invalidateTimeline();
            await Promise.all([loadProject(), loadSubmissions()]);
        } catch (err) {
            submissionErrors = {
                ...submissionErrors,
                [id]: err instanceof Error ? err.message : 'Failed to quick approve',
            };
        } finally {
            submissionSaving = { ...submissionSaving, [id]: false };
        }
    }

    async function quickDeny(submissionId: number) {
        submissionDrafts[submissionId] = {
            ...submissionDrafts[submissionId],
            approvalStatus: 'rejected',
            approvedHours: '0',
        };
        await saveSubmission(submissionId, submissionDrafts[submissionId].sendEmailNotification);
    }

    async function recalculateSubmissionHours(submissionId: number) {
        submissionRecalculating = { ...submissionRecalculating, [submissionId]: true };
        try {
            const { data, error } = await api.POST('/api/admin/projects/{id}/recalculate', {
                params: { path: { id: projectId } },
            });
            if (!error && data?.project) {
                await Promise.all([loadProject(), loadSubmissions()]);
            }
        } finally {
            submissionRecalculating = { ...submissionRecalculating, [submissionId]: false };
        }
    }

    async function resetDraft(submission: AdminSubmission) {
        submissionDrafts = {
            ...submissionDrafts,
            [submission.submissionId]: toSubmissionDraft(submission),
        };
    }

    // --- Project-level actions ---
    async function toggleSusFlag() {
        if (!project) return;
        try {
            const { error } = await api.PUT('/api/admin/users/{id}/sus-flag', {
                params: { path: { id: project.user.userId } },
                body: { isSus: !project.user.isSus },
            });
            if (!error) await loadProject();
        } catch (err) {
            console.error('Failed to toggle sus flag:', err);
        }
    }

    async function unlockProject() {
        projectBusy = true;
        projectError = '';
        projectSuccess = '';
        try {
            const { error } = await api.PUT('/api/admin/projects/{id}/unlock', {
                params: { path: { id: projectId } },
            });
            if (error) {
                projectError = errorMessage(error, 'Failed to unlock project');
                return;
            }
            projectSuccess = 'Project unlocked';
            await loadProject();
        } catch (e) {
            projectError = e instanceof Error ? e.message : 'Failed to unlock project';
        } finally {
            projectBusy = false;
        }
    }

    async function deleteProject() {
        if (typeof window !== 'undefined' && !window.confirm('Delete this project? This cannot be undone.')) {
            return;
        }
        projectBusy = true;
        projectError = '';
        projectSuccess = '';
        try {
            const { error } = await api.DELETE('/api/admin/projects/{id}', {
                params: { path: { id: projectId } },
            });
            if (error) {
                projectError = errorMessage(error, 'Failed to delete project');
                return;
            }
            goto(`${base}/projects`);
        } catch (e) {
            projectError = e instanceof Error ? e.message : 'Failed to delete project';
        } finally {
            projectBusy = false;
        }
    }

    async function recalculate() {
        projectError = '';
        projectSuccess = '';
        try {
            const { error } = await api.POST('/api/admin/projects/{id}/recalculate', {
                params: { path: { id: projectId } },
            });
            if (error) {
                projectError = errorMessage(error, 'Failed to recalculate hours');
                return;
            }
            await Promise.all([loadProject(), loadSubmissions()]);
            invalidateTimeline();
            projectSuccess = 'Hours recalculated';
        } catch (e) {
            projectError = e instanceof Error ? e.message : 'Failed to recalculate hours';
        }
    }

    // --- Edit form ---
    function toggleLinked(name: string) {
        if (linkedProjects.includes(name)) {
            linkedProjects = linkedProjects.filter((n) => n !== name);
        } else {
            linkedProjects = [...linkedProjects, name];
        }
    }

    function addManualHackatime() {
        const name = manualHackatimeInput.trim();
        if (!name) return;
        if (!linkedProjects.includes(name)) linkedProjects = [...linkedProjects, name];
        manualHackatimeInput = '';
    }

    async function saveEdit() {
        saving = true;
        saveError = '';
        saveSuccess = '';

        let approvedHours: number | null = null;
        if (approvedHoursText.trim() !== '') {
            const parsed = Number(approvedHoursText);
            if (isNaN(parsed) || parsed < 0) {
                saveError = 'Approved hours must be a non-negative number';
                saving = false;
                return;
            }
            approvedHours = parsed;
        }

        const body: UpdateAdminProjectDto = {
            projectTitle: projectTitle.trim(),
            projectType,
            description: description.trim() || null,
            playableUrl: playableUrl.trim() || null,
            repoUrl: repoUrl.trim() || null,
            readmeUrl: readmeUrl.trim() || null,
            journalUrl: journalUrl.trim() || null,
            screenshotUrl: screenshotUrl.trim() || null,
            adminComment: adminCommentEdit.trim() || null,
            hoursJustification: hoursJustificationEdit.trim() || null,
            nowHackatimeProjects: linkedProjects,
            isLocked,
            approvedHours,
        };

        try {
            const { data, error } = await api.PATCH('/api/admin/projects/{id}', {
                params: { path: { id: projectId } },
                body,
            });
            if (error) {
                saveError = errorMessage(error, 'Failed to save');
                return;
            }
            if (data) hydrateForm(data);
            saveSuccess = 'Saved';
            invalidateTimeline();
            await loadSubmissions();
        } catch (e) {
            saveError = e instanceof Error ? e.message : 'Failed to save';
        } finally {
            saving = false;
        }
    }

    onMount(async () => {
        await loadMe();
        if (!isNaN(projectId)) {
            await Promise.all([loadProject(), loadSubmissions(), loadHackatime()]);
        }
    });
</script>

<svelte:head>
    <title>Project #{projectId} - Admin Panel</title>
</svelte:head>

<div class="p-6">
    <div class="mx-auto max-w-5xl space-y-6">
        <div class="flex items-center justify-between gap-4">
            <div>
                <a href="{base}/projects" class="text-sm text-ds-link hover:underline">← Back to projects</a>
                <h2 class="mt-2 text-2xl font-semibold">
                    Project {isNaN(projectId) ? '' : `#${projectId}`}
                </h2>
            </div>
        </div>

        {#if loading}
            <div class="py-12 text-center text-ds-text-secondary">Loading...</div>
        {:else if loadError}
            <Card class="p-4 border border-red-500 bg-red-600/10 text-red-600">{loadError}</Card>
        {:else if project}
            <!-- ═══ Header card: flags + status + actions ═══ -->
            <Card
                class={`p-6 space-y-4 backdrop-blur ${
                    project.user.isSus
                        ? 'border-yellow-500'
                        : (project as any).joeFraudPassed === false
                          ? 'border-red-500'
                          : 'border-ds-border'
                }`}
            >
                {#if (project as any).joeFraudPassed === false}
                    <div class="bg-red-600/20 border-2 border-red-500 rounded-lg p-3">
                        <p class="text-red-600 font-bold text-center uppercase tracking-wide">⚠️ FRAUD (JOE)</p>
                    </div>
                {/if}
                {#if project.user.isSus}
                    <div class="bg-yellow-600/20 border-2 border-yellow-500 rounded-lg p-3">
                        <p class="text-yellow-600 font-bold text-center uppercase tracking-wide">⚠️ SUS FLAGGED</p>
                    </div>
                {/if}

                <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div class="min-w-0">
                        <h3 class="text-2xl font-semibold break-words">{project.projectTitle}</h3>
                        <p class="text-sm text-ds-text-secondary">
                            Owner: <span class="font-medium">{fullName(project.user)}</span>
                            <span class="text-ds-text-placeholder">#{project.user.userId}</span>
                        </p>
                        <p class="text-sm text-ds-text-secondary">{project.user.email}</p>
                        {#if project.user.hackatimeStartDate}
                            <div class="mt-2 rounded-md border border-yellow-600 bg-yellow-100 px-3 py-2 text-xs text-yellow-900">
                                <p class="font-semibold">
                                    ⚠ Custom Hackatime start date: {toDateInputValue(project.user.hackatimeStartDate)}
                                </p>
                            </div>
                        {/if}
                    </div>
                    <div class="flex flex-wrap gap-2 text-sm">
                        <span class="rounded-full border border-ds-border px-3 py-1">
                            Hackatime: {formatHours(project.nowHackatimeHours)}
                        </span>
                        {#if project.approvedHours !== null}
                            <span class="rounded-full border border-green-500 bg-green-500/10 text-green-700 px-3 py-1">
                                Approved: {formatHours(project.approvedHours)}
                            </span>
                        {/if}
                        <span class="rounded-full border border-ds-border px-3 py-1">
                            {project.isLocked ? 'Locked' : 'Unlocked'}
                        </span>
                    </div>
                </div>

                {#if project.user.hackatimeAccount}
                    <p class="text-sm text-purple-600">
                        Hackatime account: <span class="font-mono">{project.user.hackatimeAccount}</span>
                    </p>
                {/if}

                <div class="flex flex-wrap gap-2">
                    <Button
                        variant="ghost"
                        class={project.user.isSus ? 'bg-yellow-600/20 border-yellow-500 text-yellow-600 hover:bg-yellow-600/30' : ''}
                        onclick={toggleSusFlag}
                    >
                        {project.user.isSus ? '⚠️ Sus Flagged' : 'Flag as Sus'}
                    </Button>
                    <Button variant="ghost" onclick={recalculate}>Recalculate hours</Button>
                    {#if project.isLocked}
                        <Button variant="ghost" onclick={unlockProject} disabled={projectBusy}>Unlock project</Button>
                    {/if}
                </div>

                {#if projectError}
                    <p class="text-sm text-red-600">{projectError}</p>
                {:else if projectSuccess}
                    <p class="text-sm text-green-700">{projectSuccess}</p>
                {/if}

                <!-- Address (expandable) -->
                <div>
                    <Button
                        variant="ghost"
                        class="text-xs text-left text-blue-600 hover:text-blue-700 border-none"
                        onclick={() => (addressExpanded = !addressExpanded)}
                    >
                        {addressExpanded ? '▼' : '▶'} Address / Birthday
                    </Button>
                    {#if addressExpanded}
                        <div class="mt-2 p-3 bg-ds-surface2/50 rounded-lg border border-ds-border text-xs text-ds-text-secondary space-y-1">
                            {#if project.user.addressLine1}<p>{project.user.addressLine1}</p>{/if}
                            {#if project.user.addressLine2}<p>{project.user.addressLine2}</p>{/if}
                            <p>
                                {[project.user.city, project.user.state, project.user.zipCode].filter(Boolean).join(', ')}
                            </p>
                            {#if project.user.country}<p>{project.user.country}</p>{/if}
                            {#if project.user.birthday}
                                <p class="pt-2 border-t border-ds-border">Birthday: {formatDate(project.user.birthday)}</p>
                            {/if}
                        </div>
                    {/if}
                </div>
            </Card>

            <!-- ═══ Submissions review ═══ -->
            {#if submissionsLoading}
                <Card class="p-6"><p class="text-sm text-ds-text-secondary">Loading submissions...</p></Card>
            {:else if submissions.length === 0}
                <Card class="p-6"><p class="text-sm text-ds-text-secondary">No submissions yet.</p></Card>
            {:else if selectedSubmission}
                {@const sub = selectedSubmission}
                {@const draft = submissionDrafts[sub.submissionId]}
                {@const selectedIndex = submissions.indexOf(sub)}
                {@const previousSubmission = selectedIndex < submissions.length - 1 ? submissions[selectedIndex + 1] : null}
                {@const deltaHours = sub.approvedHours != null && previousSubmission?.approvedHours != null
                    ? sub.approvedHours - previousSubmission.approvedHours
                    : null}

                <Card class="p-6 space-y-4 backdrop-blur">
                    <!-- Submission selector -->
                    {#if submissions.length > 1}
                        <div>
                            <h4 class="text-sm font-semibold uppercase tracking-wide text-ds-text-secondary mb-3">
                                Submissions ({submissions.length})
                            </h4>
                            <div class="flex flex-wrap gap-2">
                                {#each submissions as s}
                                    <FilterTag
                                        active={selectedSubmissionId === s.submissionId}
                                        onclick={() => (selectedSubmissionId = s.submissionId)}
                                    >
                                        {formatDate(s.createdAt)}
                                        <span class={`ml-2 px-1.5 py-0.5 rounded text-xs ${statusBadgeClass(s.approvalStatus)}`}>
                                            {s.approvalStatus}
                                        </span>
                                    </FilterTag>
                                {/each}
                            </div>
                        </div>
                    {/if}

                    <!-- Submission overview -->
                    <div class="flex flex-col gap-4 md:flex-row md:gap-6">
                        {#if sub.screenshotUrl || sub.project.screenshotUrl}
                            <div class="w-full md:w-64 flex-shrink-0">
                                <h4 class="text-sm font-semibold uppercase tracking-wide text-ds-text-secondary mb-2">Screenshot</h4>
                                <a href={sub.screenshotUrl || sub.project.screenshotUrl} target="_blank" rel="noreferrer">
                                    <img
                                        src={sub.screenshotUrl || sub.project.screenshotUrl}
                                        alt="Project screenshot"
                                        loading="lazy"
                                        class="w-full h-48 object-cover rounded-lg border border-ds-border hover:border-ds-accent transition-colors"
                                    />
                                </a>
                            </div>
                        {/if}

                        <div class="flex-1 space-y-3 min-w-0">
                            <div class="flex items-start justify-between gap-3">
                                <div>
                                    <p class="text-sm text-ds-text-secondary">Submitted {formatDate(sub.createdAt)}</p>
                                    <p class="text-sm text-ds-text-secondary">
                                        Hackatime: <span class="font-semibold text-purple-600">{formatHours(sub.project.nowHackatimeHours)}</span>
                                        <Button
                                            variant="default"
                                            class="ml-2 bg-ds-accent border-ds-accent hover:bg-ds-accent/80"
                                            onclick={() => recalculateSubmissionHours(sub.submissionId)}
                                            disabled={submissionRecalculating[sub.submissionId]}
                                        >
                                            {submissionRecalculating[sub.submissionId] ? '⟳ Calculating...' : '⟳ Recalc'}
                                        </Button>
                                    </p>
                                    {#if deltaHours != null}
                                        <p class="text-sm text-blue-700">
                                            Additional (this submission): <span class="font-semibold">+{formatHours(deltaHours)}</span>
                                        </p>
                                    {/if}
                                </div>
                                <span class={`px-3 py-1 rounded-full text-sm border ${statusBadgeClass(sub.approvalStatus)}`}>
                                    {sub.approvalStatus.toUpperCase()}
                                </span>
                            </div>

                            {#if sub.description || sub.project.description}
                                <div class="space-y-1">
                                    <h4 class="text-sm font-semibold uppercase tracking-wide text-ds-text-secondary">Description</h4>
                                    <p class="text-sm text-ds-text-secondary break-words">
                                        {sub.description || sub.project.description}
                                    </p>
                                </div>
                            {/if}

                            {#if sub.hoursJustification}
                                <div class="bg-blue-950/10 border border-blue-800/40 rounded-lg p-3">
                                    <h4 class="text-xs font-semibold uppercase tracking-wide text-blue-700 mb-1">User Feedback</h4>
                                    <p class="text-sm text-ds-text-secondary break-words">{sub.hoursJustification}</p>
                                </div>
                            {/if}
                            {#if sub.project.hoursJustification}
                                <div class="bg-purple-950/10 border border-purple-800/40 rounded-lg p-3">
                                    <h4 class="text-xs font-semibold uppercase tracking-wide text-purple-600 mb-1">Hours Justification (admin only)</h4>
                                    <p class="text-sm text-ds-text-secondary break-words">{sub.project.hoursJustification}</p>
                                </div>
                            {/if}
                            {#if sub.project.adminComment}
                                <div class="bg-orange-950/10 border border-orange-800/40 rounded-lg p-3">
                                    <h4 class="text-xs font-semibold uppercase tracking-wide text-orange-600 mb-1">Admin Comment</h4>
                                    <p class="text-sm text-ds-text-secondary break-words">{sub.project.adminComment}</p>
                                </div>
                            {/if}

                            <!-- Quick action links -->
                            <div class="flex flex-wrap gap-2">
                                {#if sub.playableUrl || sub.project.playableUrl}
                                    {@const url = normalizeUrl(sub.playableUrl || sub.project.playableUrl)}
                                    {#if url}
                                        <a href={url} target="_blank" rel="noreferrer" class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 border border-blue-400 text-white text-sm transition-colors">
                                            View Live Demo
                                        </a>
                                    {/if}
                                {/if}
                                {#if sub.repoUrl || sub.project.repoUrl}
                                    <a href={sub.repoUrl || sub.project.repoUrl} target="_blank" rel="noreferrer" class="px-4 py-2 rounded-lg bg-ds-surface-inactive hover:bg-ds-surface-inactive border border-ds-border text-ds-text text-sm transition-colors">
                                        View Repository
                                    </a>
                                    <a href={`https://airlock.hackclub.com/?r=${sub.repoUrl || sub.project.repoUrl}`} target="_blank" rel="noreferrer" class="px-4 py-2 rounded-lg bg-orange-700 hover:bg-orange-600 border border-orange-500 text-white text-sm transition-colors">
                                        Open in Airlock
                                    </a>
                                {/if}
                                {#if generateBillyLink(project.user.hackatimeAccount)}
                                    <a href={generateBillyLink(project.user.hackatimeAccount)} target="_blank" rel="noreferrer" class="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 border border-green-400 text-white text-sm transition-colors">
                                        Billy
                                    </a>
                                {/if}
                            </div>

                            <!-- Billy date range -->
                            <div class="grid gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end pt-2">
                                <div>
                                    <label for="billy-start" class="block text-xs text-ds-text-secondary mb-1">Billy start</label>
                                    <TextField id="billy-start" type="date" bind:value={dateRangeStart} />
                                </div>
                                <div>
                                    <label for="billy-end" class="block text-xs text-ds-text-secondary mb-1">Billy end</label>
                                    <TextField id="billy-end" type="date" bind:value={dateRangeEnd} />
                                </div>
                                <Button
                                    variant="default"
                                    onclick={() => {
                                        const r = getDefaultDateRange();
                                        dateRangeStart = r.startDate;
                                        dateRangeEnd = r.endDate;
                                    }}
                                >
                                    Reset
                                </Button>
                            </div>
                        </div>
                    </div>

                    <!-- Review controls -->
                    {#if draft}
                        <div class="border-t border-ds-border pt-4 space-y-4">
                            <h4 class="text-sm font-semibold uppercase tracking-wide text-ds-text-secondary">Review Controls</h4>

                            <div class="grid gap-4 md:grid-cols-3">
                                <div class="space-y-2">
                                    <label class="text-sm font-medium text-ds-text-secondary" for="rv-status">Status</label>
                                    <Select id="rv-status" class="w-full" bind:value={draft.approvalStatus}>
                                        {#each statusOptions as option}
                                            <option value={option}>{option}</option>
                                        {/each}
                                    </Select>
                                </div>
                                <div class="space-y-2">
                                    <label class="text-sm font-medium text-ds-text-secondary" for="rv-hours">Approved Hours</label>
                                    <TextField id="rv-hours" type="number" step="0.1" min="0" bind:value={draft.approvedHours} />
                                </div>
                                <div class="space-y-2">
                                    <label class="text-sm font-medium text-ds-text-secondary" for="rv-feedback">User Feedback (emailed)</label>
                                    <TextField
                                        id="rv-feedback"
                                        multiline
                                        class="min-w-0 border-blue-600 focus:border-blue-500 resize-y"
                                        rows={2}
                                        placeholder="Feedback to send to the user..."
                                        bind:value={draft.userFeedback}
                                    />
                                </div>
                                <div class="space-y-2">
                                    <label class="text-sm font-medium text-ds-text-secondary" for="rv-justify">Hours Justification (admin only, Airtable)</label>
                                    <TextField
                                        id="rv-justify"
                                        multiline
                                        class="min-w-0 border-purple-600 resize-y"
                                        rows={2}
                                        placeholder="Internal justification..."
                                        bind:value={draft.hoursJustification}
                                    />
                                </div>
                                <div class="space-y-2">
                                    <label class="text-sm font-medium text-ds-text-secondary" for="rv-admin-comment">Admin Comment (internal)</label>
                                    <TextField
                                        id="rv-admin-comment"
                                        multiline
                                        class="min-w-0 border-orange-600 focus:border-orange-500 resize-y"
                                        rows={2}
                                        placeholder="Internal comment..."
                                        bind:value={draft.adminComment}
                                    />
                                </div>
                            </div>

                            <div class="flex items-center gap-3">
                                <label class="flex items-center gap-2 cursor-pointer">
                                    <Checkbox bind:checked={draft.sendEmailNotification} />
                                    <span class="text-sm font-medium text-ds-text-secondary">Send email on status change</span>
                                </label>
                            </div>

                            <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div class="flex flex-wrap gap-2">
                                    {#if sub.approvalStatus !== 'approved'}
                                        <Button variant="approve" onclick={() => quickApprove(sub)} disabled={submissionSaving[sub.submissionId]}>
                                            Quick Approve
                                        </Button>
                                    {/if}
                                    {#if sub.approvalStatus !== 'rejected'}
                                        <Button variant="reject" onclick={() => quickDeny(sub.submissionId)} disabled={submissionSaving[sub.submissionId]}>
                                            Quick Deny
                                        </Button>
                                    {/if}
                                    <Button
                                        variant="default"
                                        class="bg-ds-accent border-ds-accent hover:bg-ds-accent/80"
                                        onclick={() => saveSubmission(sub.submissionId)}
                                        disabled={submissionSaving[sub.submissionId]}
                                    >
                                        {submissionSaving[sub.submissionId] ? 'Saving...' : 'Save Changes'}
                                    </Button>
                                    <Button variant="default" onclick={() => resetDraft(sub)}>Reset</Button>
                                </div>
                                <div class="text-sm">
                                    {#if submissionErrors[sub.submissionId]}
                                        <span class="text-red-600">{submissionErrors[sub.submissionId]}</span>
                                    {:else if submissionSuccess[sub.submissionId]}
                                        <span class="text-green-700">{submissionSuccess[sub.submissionId]}</span>
                                    {/if}
                                </div>
                            </div>
                        </div>
                    {/if}
                </Card>
            {/if}

            <!-- ═══ Timeline ═══ -->
            <Card class="p-6 backdrop-blur">
                <Button
                    variant="ghost"
                    class="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ds-text-secondary hover:text-ds-text border-none"
                    onclick={loadTimeline}
                    disabled={timelineLoading}
                >
                    {#if timelineLoading}
                        <span class="animate-spin">⟳</span> Loading Timeline...
                    {:else}
                        <span>{timelineOpen ? '▼' : '▶'}</span> Project Timeline
                    {/if}
                </Button>

                {#if timelineOpen && timeline}
                    <div class="mt-4 relative ml-3">
                        <div class="absolute left-1 top-0 bottom-0 w-0.5 bg-ds-surface-inactive"></div>
                        <div class="space-y-3">
                            {#each timeline.timeline as event}
                                <div class="relative pl-6">
                                    <div class="absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full {timelineDotColor(event.type)} ring-2 ring-ds-surface"></div>
                                    <div class="rounded-lg border p-3 {timelineEventColor(event.type)}">
                                        <div class="flex flex-wrap items-center gap-2 mb-1">
                                            <span class="text-xs font-bold uppercase tracking-wide text-ds-text">{timelineEventLabel(event.type)}</span>
                                            <span class="text-xs text-ds-text-secondary">{formatDate(event.timestamp)}</span>
                                            {#if event.actor}
                                                <span class="text-xs text-ds-text-secondary">
                                                    by {event.actor.firstName ?? ''} {event.actor.lastName ?? ''} ({event.actor.email})
                                                </span>
                                            {/if}
                                        </div>
                                        {#if event.details && Object.keys(event.details).length > 0}
                                            <pre class="text-xs text-ds-text-secondary mt-1 whitespace-pre-wrap break-words">{JSON.stringify(event.details, null, 2)}</pre>
                                        {/if}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
            </Card>

            <!-- ═══ Edit form (collapsible, superadmin only) ═══ -->
            <Card class="p-6 space-y-4 backdrop-blur">
                <div class="flex items-center justify-between">
                    <h3 class="text-lg font-semibold">Edit Project Metadata</h3>
                    <Button variant="ghost" onclick={() => (editOpen = !editOpen)}>
                        {editOpen ? 'Hide' : 'Show'}
                    </Button>
                </div>

                {#if !isSuperadmin && me && editOpen}
                    <div class="p-3 border border-yellow-500 bg-yellow-100 text-yellow-900 rounded-md text-sm">
                        This section is read-only. Editing requires superadmin role.
                    </div>
                {/if}

                {#if editOpen}
                    <fieldset disabled={!isSuperadmin} class="space-y-5">
                        <div class="grid gap-4 md:grid-cols-2">
                            <label class="space-y-1">
                                <span class="text-xs uppercase tracking-wide text-ds-text-secondary">Project Title</span>
                                <TextField bind:value={projectTitle} maxlength={30} />
                            </label>
                            <label class="space-y-1">
                                <span class="text-xs uppercase tracking-wide text-ds-text-secondary">Project Type</span>
                                <select
                                    bind:value={projectType}
                                    class="w-full rounded-lg border border-ds-border bg-white px-3 py-2 font-dm text-sm text-black"
                                >
                                    {#each projectTypes as t}
                                        <option value={t}>{t}</option>
                                    {/each}
                                </select>
                            </label>
                        </div>

                        <label class="space-y-1 block">
                            <span class="text-xs uppercase tracking-wide text-ds-text-secondary">Description</span>
                            <TextField bind:value={description} multiline maxlength={500} />
                        </label>

                        <div class="grid gap-4 md:grid-cols-2">
                            <label class="space-y-1">
                                <span class="text-xs uppercase tracking-wide text-ds-text-secondary">Playable URL</span>
                                <TextField bind:value={playableUrl} />
                            </label>
                            <label class="space-y-1">
                                <span class="text-xs uppercase tracking-wide text-ds-text-secondary">Repo URL</span>
                                <TextField bind:value={repoUrl} />
                            </label>
                            <label class="space-y-1">
                                <span class="text-xs uppercase tracking-wide text-ds-text-secondary">README URL</span>
                                <TextField bind:value={readmeUrl} />
                            </label>
                            <label class="space-y-1">
                                <span class="text-xs uppercase tracking-wide text-ds-text-secondary">Journal URL</span>
                                <TextField bind:value={journalUrl} />
                            </label>
                            <label class="space-y-1 md:col-span-2">
                                <span class="text-xs uppercase tracking-wide text-ds-text-secondary">Screenshot URL</span>
                                <TextField bind:value={screenshotUrl} />
                            </label>
                        </div>

                        <div class="grid gap-4 md:grid-cols-2">
                            <label class="space-y-1">
                                <span class="text-xs uppercase tracking-wide text-ds-text-secondary">Approved hours (blank to clear)</span>
                                <TextField type="number" min="0" step="0.1" bind:value={approvedHoursText} />
                            </label>
                            <label class="flex items-end gap-2 pb-2">
                                <Checkbox bind:checked={isLocked} />
                                <span class="text-sm text-ds-text-secondary">Lock project (prevents owner edits)</span>
                            </label>
                        </div>

                        <label class="space-y-1 block">
                            <span class="text-xs uppercase tracking-wide text-ds-text-secondary">Hours justification</span>
                            <TextField bind:value={hoursJustificationEdit} multiline />
                        </label>

                        <label class="space-y-1 block">
                            <span class="text-xs uppercase tracking-wide text-ds-text-secondary">Admin comment (max 1000 chars)</span>
                            <TextField bind:value={adminCommentEdit} multiline maxlength={1000} />
                        </label>

                        <div class="space-y-3 border-t border-ds-border pt-5">
                            <div class="flex items-center justify-between gap-2">
                                <div>
                                    <h4 class="text-sm font-semibold uppercase tracking-wide text-ds-text-secondary">Linked Hackatime Projects</h4>
                                    {#if hackatimeOwnerAccount}
                                        <p class="text-xs text-ds-text-secondary">
                                            Owner: {hackatimeOwnerAccount}
                                            {#if hackatimeOwnerStartDate}
                                                • start date {toDateInputValue(hackatimeOwnerStartDate)}
                                            {/if}
                                        </p>
                                    {:else}
                                        <p class="text-xs text-ds-text-placeholder">Owner has no Hackatime account linked.</p>
                                    {/if}
                                </div>
                                <Button variant="ghost" onclick={loadHackatime} disabled={hackatimeLoading}>
                                    {hackatimeLoading ? 'Loading…' : 'Refresh list'}
                                </Button>
                            </div>

                            {#if linkedProjects.length > 0}
                                <div class="flex flex-wrap gap-2">
                                    {#each linkedProjects as name}
                                        <span class="inline-flex items-center gap-2 rounded-full border border-ds-border bg-ds-surface2 px-3 py-1 text-sm">
                                            {name}
                                            <button
                                                type="button"
                                                class="text-ds-text-placeholder hover:text-red-600"
                                                onclick={() => toggleLinked(name)}
                                                aria-label={`Remove ${name}`}
                                            >×</button>
                                        </span>
                                    {/each}
                                </div>
                            {:else}
                                <p class="text-sm text-ds-text-placeholder">No Hackatime projects linked.</p>
                            {/if}

                            {#if hackatimeError}
                                <p class="text-xs text-red-600">{hackatimeError}</p>
                            {/if}

                            {#if hackatimeProjects.length > 0}
                                <div class="rounded-lg border border-ds-border bg-ds-surface2/50">
                                    <p class="border-b border-ds-border px-3 py-2 text-xs text-ds-text-secondary">
                                        Available Hackatime projects (hours shown are post-start-date)
                                    </p>
                                    <ul class="max-h-72 overflow-y-auto divide-y divide-ds-border text-sm">
                                        {#each hackatimeProjects as p}
                                            {@const linked = linkedProjects.includes(p.name)}
                                            <li class="flex items-center justify-between gap-3 px-3 py-2">
                                                <label class="flex flex-1 items-center gap-2 cursor-pointer">
                                                    <Checkbox checked={linked} onchange={() => toggleLinked(p.name)} />
                                                    <span class="font-medium">{p.name}</span>
                                                </label>
                                                <span class="text-xs text-ds-text-secondary">{p.totalHours.toFixed(1)}h</span>
                                            </li>
                                        {/each}
                                    </ul>
                                </div>
                            {/if}

                            <div class="flex gap-2">
                                <TextField placeholder="Add Hackatime project name manually" bind:value={manualHackatimeInput} />
                                <Button variant="ghost" onclick={addManualHackatime} disabled={!manualHackatimeInput.trim()}>
                                    Add
                                </Button>
                            </div>
                        </div>
                    </fieldset>

                    <div class="flex items-center justify-between border-t border-ds-border pt-4">
                        <div class="text-sm">
                            {#if saveError}
                                <span class="text-red-600">{saveError}</span>
                            {:else if saveSuccess}
                                <span class="text-green-700">{saveSuccess}</span>
                            {/if}
                        </div>
                        <Button variant="approve" onclick={saveEdit} disabled={saving || !isSuperadmin}>
                            {saving ? 'Saving…' : 'Save changes'}
                        </Button>
                    </div>
                {/if}
            </Card>

            <!-- ═══ Danger zone ═══ -->
            <Card class="p-6 border border-red-500 bg-red-600/5 backdrop-blur">
                <div class="flex items-center justify-between gap-4">
                    <div>
                        <h3 class="text-lg font-semibold text-red-600">Danger zone</h3>
                        <p class="text-sm text-ds-text-secondary">Permanently delete this project. This cannot be undone.</p>
                    </div>
                    <Button variant="reject" onclick={deleteProject} disabled={projectBusy}>
                        Delete project
                    </Button>
                </div>
            </Card>
        {/if}
    </div>
</div>
