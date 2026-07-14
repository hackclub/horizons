<script lang="ts">
    import { page } from '$app/state';
    import { base } from '$app/paths';
    import { afterNavigate, goto } from '$app/navigation';
    import { env } from '$env/dynamic/public';
    import { api, type components } from '$lib/api';
    import { ensureUser } from '$lib/auth';
    import { addToast } from '$lib/toastStore';
    import { Skeleton } from '$lib/components';
    import TabBar, { type Tab } from '../../review/components/TabBar.svelte';
    import NotesSection from '../../review/components/NotesSection.svelte';
    import { timeAgo } from '../../review/utils';

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

    let projectId = $derived(parseInt(page.params.id ?? '', 10));

    // --- Auth ---
    let me = $state<{ role: string } | null>(null);
    let isSuperadmin = $derived(me?.role === 'superadmin');

    // --- Project ---
    let project = $state<AdminProject | null>(null);
    let loading = $state(true);
    let loadError = $state('');

    // --- Submissions (viewer only — verdicts live in the review dash) ---
    let submissions = $state<AdminSubmission[]>([]);
    let submissionsLoading = $state(false);
    let selectedSubmissionId = $state<number | null>(null);
    let selectedSubmission = $derived(
        submissions.find((s) => s.submissionId === selectedSubmissionId) ?? submissions[0] ?? null,
    );

    // --- Center tabs ---
    const centerTabs: Tab[] = [
        { id: 'overview', label: 'Overview' },
        { id: 'submission', label: 'Submission' },
        { id: 'timeline', label: 'Timeline' },
    ];
    let activeTab = $state('overview');

    // --- Timeline (lazy-loaded when the tab first opens) ---
    let timeline = $state<ProjectTimelineResponse | null>(null);
    let timelineLoading = $state(false);

    // --- Notes (shared with the review dash via the reviewer notes endpoints) ---
    let projectNote = $state('');
    let userNote = $state('');
    let notesLoading = $state(false);

    // --- Edit form state (right rail) ---
    let saving = $state(false);
    let saveError = $state('');

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
    let permReject = $state(false);
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
    let recalculating = $state(false);
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

    let billyUrl = $derived.by(() => {
        const account = project?.user.hackatimeAccount;
        if (!account || account.trim() === '') return null;
        return `https://billy.3kh0.net/?u=${account}&d=${dateRangeStart}-${dateRangeEnd}`;
    });

    // --- Derived link targets ---
    let joeUrl = $derived(
        project?.joeProjectId
            ? `https://joe.fraud.hackclub.com/ysws/horizons/projects/${project.joeProjectId}`
            : null,
    );
    let slackDmUrl = $derived(
        project?.user.slackUserId
            ? `https://hackclub.slack.com/team/${project.user.slackUserId}`
            : null,
    );
    let latestSubmission = $derived(submissions[0] ?? null);
    let effectiveScreenshot = $derived(
        project?.screenshotUrl || latestSubmission?.screenshotUrl || null,
    );

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

    function typeLabel(type: string): string {
        return type.replace(/_/g, ' ');
    }

    function statusLabel(status: string): string {
        return status.charAt(0).toUpperCase() + status.slice(1);
    }

    function statusPillClass(status: string): string {
        if (status === 'approved') return 'bg-rv-green-bg text-rv-green';
        if (status === 'rejected') return 'bg-rv-red-bg text-rv-red';
        return 'bg-rv-surface2 text-rv-dim';
    }

    // --- Copy to clipboard ---
    let copiedKey = $state<string | null>(null);
    let copyTimer: ReturnType<typeof setTimeout> | null = null;
    async function copyText(key: string, value: string | null | undefined) {
        if (!value) return;
        try {
            await navigator.clipboard.writeText(value);
            copiedKey = key;
            if (copyTimer) clearTimeout(copyTimer);
            copyTimer = setTimeout(() => (copiedKey = null), 1200);
        } catch {
            // clipboard unavailable — silent
        }
    }

    // --- Timeline styling ---
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

    function timelineDotColor(type: string): string {
        switch (type) {
            case 'project_created': return 'bg-blue-500';
            case 'submission': return 'bg-rv-green';
            case 'resubmission': return 'bg-yellow-500';
            case 'project_updated': return 'bg-cyan-500';
            case 'admin_review': return 'bg-purple-500';
            case 'admin_update': return 'bg-orange-500';
            default: return 'bg-rv-surface2';
        }
    }

    // --- API ---
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
        permReject = p.permReject ?? false;
        linkedProjects = [...(p.nowHackatimeProjects ?? [])];
    }

    async function loadMe() {
        const data = await ensureUser();
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
            const { data, error } = await api.GET('/api/admin/submissions', {
                params: { query: { projectId } },
            });
            if (error || !data) return;
            submissions = [...data].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            );
            if (submissions.length > 0 && selectedSubmissionId == null) {
                selectedSubmissionId = submissions[0].submissionId;
            }
        } finally {
            submissionsLoading = false;
        }
    }

    async function loadNotes(pid: number, userId: number) {
        notesLoading = true;
        try {
            const [projRes, userRes] = await Promise.all([
                api.GET('/api/reviewer/projects/{id}/notes', { params: { path: { id: pid } } }),
                api.GET('/api/reviewer/users/{id}/notes', { params: { path: { id: userId } } }),
            ]);
            projectNote = projRes.data?.content ?? '';
            userNote = userRes.data?.content ?? '';
        } catch {
            projectNote = '';
            userNote = '';
        } finally {
            notesLoading = false;
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
        if (timeline || timelineLoading) return;
        timelineLoading = true;
        try {
            const { data, error } = await api.GET('/api/admin/projects/{id}/timeline', {
                params: { path: { id: projectId } },
            });
            if (!error && data) timeline = data;
        } finally {
            timelineLoading = false;
        }
    }

    function invalidateTimeline() {
        timeline = null;
        if (activeTab === 'timeline') void loadTimeline();
    }

    function handleTabChange(id: string) {
        activeTab = id;
        if (id === 'timeline') void loadTimeline();
    }

    function selectSubmission(submissionId: number) {
        selectedSubmissionId = submissionId;
        activeTab = 'submission';
    }

    // --- Project-level actions ---
    async function toggleSusFlag() {
        if (!project) return;
        try {
            const { error } = await api.PUT('/api/admin/users/{id}/sus-flag', {
                params: { path: { id: project.user.userId } },
                body: { isSus: !project.user.isSus },
            });
            if (error) {
                addToast('Failed to toggle sus flag', 'error');
                return;
            }
            addToast(project.user.isSus ? 'Sus flag removed' : 'User flagged as sus', 'success');
            await loadProject();
        } catch {
            addToast('Failed to toggle sus flag', 'error');
        }
    }

    async function recalculate() {
        recalculating = true;
        try {
            const { error } = await api.POST('/api/admin/projects/{id}/recalculate', {
                params: { path: { id: projectId } },
            });
            if (error) {
                addToast(errorMessage(error, 'Failed to recalculate hours'), 'error');
                return;
            }
            await Promise.all([loadProject(), loadSubmissions()]);
            invalidateTimeline();
            addToast('Hours recalculated', 'success');
        } catch {
            addToast('Failed to recalculate hours', 'error');
        } finally {
            recalculating = false;
        }
    }

    async function unlockProject() {
        projectBusy = true;
        try {
            const { error } = await api.PUT('/api/admin/projects/{id}/unlock', {
                params: { path: { id: projectId } },
            });
            if (error) {
                addToast(errorMessage(error, 'Failed to unlock project'), 'error');
                return;
            }
            addToast('Project unlocked', 'success');
            await loadProject();
        } catch {
            addToast('Failed to unlock project', 'error');
        } finally {
            projectBusy = false;
        }
    }

    async function resetJoeAndRequeue() {
        if (!project) return;
        if (
            typeof window !== 'undefined' &&
            !window.confirm(
                'Reset Joe state, clear perm-reject and silent-reject flags, and resubmit to the fraud queue?',
            )
        ) {
            return;
        }
        projectBusy = true;
        try {
            const { error } = await api.POST('/api/admin/projects/{id}/joe-reset', {
                params: { path: { id: projectId } },
            });
            if (error) {
                addToast(errorMessage(error, 'Failed to reset Joe state'), 'error');
                return;
            }
            addToast('Joe state reset — project re-enqueued for fraud review', 'success');
            await Promise.all([loadProject(), loadSubmissions()]);
            invalidateTimeline();
        } catch {
            addToast('Failed to reset Joe state', 'error');
        } finally {
            projectBusy = false;
        }
    }

    async function deleteProject() {
        if (typeof window !== 'undefined' && !window.confirm('Delete this project? This cannot be undone.')) {
            return;
        }
        projectBusy = true;
        try {
            const { error } = await api.DELETE('/api/admin/projects/{id}', {
                params: { path: { id: projectId } },
            });
            if (error) {
                addToast(errorMessage(error, 'Failed to delete project'), 'error');
                return;
            }
            goto(`${base}/projects`);
        } catch {
            addToast('Failed to delete project', 'error');
        } finally {
            projectBusy = false;
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

        const body: UpdateAdminProjectDto & { permReject?: boolean } = {
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
            permReject,
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
            addToast('Project saved', 'success');
            invalidateTimeline();
            await loadSubmissions();
        } catch (e) {
            saveError = e instanceof Error ? e.message : 'Failed to save';
        } finally {
            saving = false;
        }
    }

    async function loadPage() {
        await loadMe();
        if (!isNaN(projectId)) {
            await Promise.all([loadProject(), loadSubmissions(), loadHackatime()]);
            if (project) void loadNotes(projectId, project.user.userId);
        } else {
            loading = false;
            loadError = 'Invalid project id';
        }
    }

    // afterNavigate fires on mount AND on same-route navigations between
    // project ids (e.g. via the command palette), which reuse this component
    // — an onMount-only load would leave the previous project on screen.
    // Per-project state is reset here so lazy-load guards (timeline,
    // selectedSubmissionId) don't pin stale data.
    let loadedProjectId: number | null = null;
    afterNavigate(() => {
        if (projectId === loadedProjectId) return;
        loadedProjectId = projectId;
        loading = true;
        submissions = [];
        selectedSubmissionId = null;
        timeline = null;
        activeTab = 'overview';
        void loadPage();
    });

    // --- Shared class strings (rv design language, matching the review dash) ---
    const btn =
        'bg-rv-surface2 border border-rv-border text-rv-text px-3 py-1.5 rounded-md text-[12px] font-medium cursor-pointer transition-all duration-150 hover:border-rv-accent disabled:opacity-50 disabled:cursor-not-allowed';
    const btnSm =
        'bg-rv-surface2 border border-rv-border text-rv-dim px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer transition-all duration-150 hover:text-rv-text hover:border-rv-accent disabled:opacity-50 disabled:cursor-not-allowed';
    const input =
        'w-full bg-rv-bg border border-rv-border rounded-md px-2.5 py-2 text-rv-text text-[13px] focus:outline-none focus:border-rv-accent disabled:opacity-60 disabled:cursor-not-allowed';
    const label = 'block text-[11px] uppercase tracking-[0.8px] text-rv-dim font-semibold mb-1';
    const sectionTitle = 'text-[11px] uppercase tracking-wider text-rv-dim font-semibold';
</script>

<svelte:head>
    <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
    />
    <title>Project #{projectId} - Admin Panel</title>
</svelte:head>

<div class="font-[Inter,sans-serif] bg-rv-bg text-rv-text h-screen flex flex-col overflow-hidden">
    {#if loading}
        <!-- Skeleton chrome: same top bar + three-panel grid as the loaded page,
             so navigation feels instant instead of flashing a blank screen. -->
        <div class="flex items-center justify-between gap-4 px-4 py-2.5 bg-rv-surface border-b border-rv-border shrink-0">
            <div class="flex items-center gap-3">
                <Skeleton class="h-6 w-20" />
                <Skeleton class="h-5 w-48" />
                <Skeleton class="h-4 w-16 rounded-xl" />
            </div>
            <div class="flex items-center gap-2">
                <Skeleton class="h-7 w-32" />
                <Skeleton class="h-7 w-24" />
            </div>
        </div>
        <div class="grid grid-cols-[300px_1fr_380px] flex-1 overflow-hidden">
            <div class="bg-rv-surface border-r border-rv-border overflow-hidden">
                <div class="p-4 flex flex-col gap-2.5">
                    <Skeleton class="h-3 w-14" />
                    <Skeleton class="h-5 w-36" />
                    <Skeleton class="h-3.5 w-full" />
                    <Skeleton class="h-3.5 w-3/4" />
                    <Skeleton class="h-3.5 w-2/3" />
                    <Skeleton class="h-6 w-24" />
                </div>
                <hr class="border-none border-t border-rv-border m-0" />
                <div class="p-4 flex flex-col gap-2">
                    <div class="flex items-center justify-between">
                        <Skeleton class="h-3 w-12" />
                        <Skeleton class="h-5 w-24" />
                    </div>
                    <Skeleton class="h-3.5 w-full" />
                    <Skeleton class="h-3.5 w-full" />
                    <Skeleton class="h-3.5 w-full" />
                </div>
                <hr class="border-none border-t border-rv-border m-0" />
                <div class="flex items-center justify-between px-4 py-2.5">
                    <Skeleton class="h-3 w-32" />
                    <Skeleton class="h-5.5 w-5.5" />
                </div>
                <hr class="border-none border-t border-rv-border m-0" />
                <div class="flex items-center justify-between px-4 py-2.5">
                    <Skeleton class="h-3 w-28" />
                    <Skeleton class="h-5.5 w-5.5" />
                </div>
                <hr class="border-none border-t border-rv-border m-0" />
                <div class="p-4 flex flex-col gap-1.5">
                    <Skeleton class="h-3 w-24 mb-1" />
                    <Skeleton class="h-12 w-full" />
                    <Skeleton class="h-12 w-full" />
                </div>
            </div>
            <div class="flex flex-col overflow-hidden">
                <div class="flex items-end gap-1 bg-rv-surface border-b border-rv-border px-2 pt-1.5 pb-0 shrink-0">
                    <Skeleton class="h-8 w-24 rounded-t-lg rounded-b-none" />
                    <Skeleton class="h-8 w-24 rounded-t-lg rounded-b-none" />
                    <Skeleton class="h-8 w-24 rounded-t-lg rounded-b-none" />
                </div>
                <div class="max-w-[860px] w-full mx-auto p-5 flex flex-col gap-5">
                    <Skeleton class="h-64 w-full" />
                    <div class="flex items-start justify-between gap-4">
                        <Skeleton class="h-6 w-56" />
                        <div class="flex gap-2">
                            <Skeleton class="h-7 w-20" />
                            <Skeleton class="h-7 w-20" />
                        </div>
                    </div>
                    <div class="flex flex-col gap-2">
                        <Skeleton class="h-3.5 w-full" />
                        <Skeleton class="h-3.5 w-full" />
                        <Skeleton class="h-3.5 w-2/3" />
                    </div>
                </div>
            </div>
            <div class="bg-rv-surface border-l border-rv-border flex flex-col overflow-hidden">
                <div class="flex items-center justify-between px-4 py-2.5 border-b border-rv-border shrink-0">
                    <Skeleton class="h-3 w-24" />
                </div>
                <div class="p-4 flex flex-col gap-3.5 flex-1 overflow-hidden">
                    {#each { length: 6 } as _, i (i)}
                        <div class="flex flex-col gap-1">
                            <Skeleton class="h-3 w-20" />
                            <Skeleton class="h-8 w-full" />
                        </div>
                    {/each}
                </div>
                <div class="flex items-center justify-end px-4 py-3 border-t border-rv-border shrink-0">
                    <Skeleton class="h-7 w-28" />
                </div>
            </div>
        </div>
    {:else if loadError || !project}
        <div class="flex flex-col items-center justify-center h-screen gap-3 px-6">
            <p class="text-rv-text text-[15px] m-0">Couldn't load project #{projectId}.</p>
            <p class="text-[12px] text-rv-dim m-0">{loadError || 'Project not found.'}</p>
            <a href="{base}/projects" class="{btn} mt-2 no-underline">← Back to Projects</a>
        </div>
    {:else}
        <!-- ═══ Top bar ═══ -->
        <div class="flex items-center justify-between gap-4 px-4 py-2.5 bg-rv-surface border-b border-rv-border shrink-0">
            <div class="flex items-center gap-3 min-w-0">
                <a href="{base}/projects" class="{btnSm} no-underline shrink-0">← Projects</a>
                <div class="flex items-center gap-2 min-w-0">
                    <h1 class="text-[15px] font-semibold m-0 truncate">{project.projectTitle}</h1>
                    <span class="text-[12px] text-rv-dim shrink-0">#{project.projectId}</span>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    {#if latestSubmission}
                        <span class="py-0.5 px-2 rounded-xl text-[10px] font-semibold {statusPillClass(latestSubmission.approvalStatus)}">
                            {statusLabel(latestSubmission.approvalStatus)}
                        </span>
                    {:else}
                        <span class="py-0.5 px-2 rounded-xl text-[10px] font-semibold bg-rv-surface2 text-rv-dim">Draft</span>
                    {/if}
                    {#if project.isLocked}
                        <span class="py-0.5 px-2 rounded-xl text-[10px] font-semibold bg-rv-tag-bg text-rv-accent">Locked</span>
                    {/if}
                    {#if project.permReject}
                        <span class="py-0.5 px-2 rounded-xl text-[10px] font-semibold bg-rv-red-bg text-rv-red">Perm-rejected</span>
                    {/if}
                    {#if project.joeFraudPassed === false}
                        <span class="py-0.5 px-2 rounded-xl text-[10px] font-semibold bg-rv-red-bg text-rv-red">Fraud (Joe)</span>
                    {/if}
                    {#if project.user.isSus}
                        <span class="py-0.5 px-2 rounded-xl text-[10px] font-semibold bg-yellow-500/15 text-yellow-600 dark:text-yellow-400">Sus</span>
                    {/if}
                </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <a href="{base}/review/{project.projectId}{selectedSubmission ? `?submissionId=${selectedSubmission.submissionId}` : ''}" class="{btn} no-underline">
                    Open in Review →
                </a>
                <a href="{base}/users?q={encodeURIComponent(project.user.email)}" class="{btn} no-underline">
                    View User →
                </a>
            </div>
        </div>

        {#if project.deletedAt}
            <div class="px-5 py-2 bg-rv-red-bg border-b border-rv-red/40 text-rv-red text-[12px] font-semibold shrink-0">
                Deleted by owner · {formatDate(project.deletedAt)}
            </div>
        {/if}

        <div class="grid grid-cols-[300px_1fr_380px] flex-1 overflow-hidden">
            <!-- ═══ LEFT PANEL: owner, hours, notes, submissions ═══ -->
            <div class="bg-rv-surface border-r border-rv-border overflow-y-auto">
                <!-- Owner -->
                <div class="p-4 flex flex-col gap-2.5">
                    <h3 class={sectionTitle}>Owner</h3>
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-[15px] font-semibold">{fullName(project.user)}</span>
                        <span class="text-[11px] text-rv-dim">#{project.user.userId}</span>
                        {#if project.user.isFraud}
                            <span class="py-0.5 px-2 rounded-xl text-[10px] font-semibold bg-rv-red-bg text-rv-red">Fraud</span>
                        {/if}
                    </div>

                    <div class="flex flex-col gap-1">
                        <button
                            class="group flex items-center justify-between gap-2 text-left bg-transparent border-none p-0 cursor-pointer"
                            onclick={() => copyText('email', project?.user.email)}
                            title="Click to copy"
                        >
                            <span class="text-[12px] text-rv-text font-mono truncate">{project.user.email}</span>
                            <span class="text-[10px] {copiedKey === 'email' ? 'text-rv-green' : 'text-rv-dim opacity-0 group-hover:opacity-100'} shrink-0 transition-opacity">
                                {copiedKey === 'email' ? 'Copied' : 'Copy'}
                            </span>
                        </button>
                        {#if project.user.slackUserId}
                            <div class="flex items-center justify-between gap-2">
                                <button
                                    class="group flex items-center gap-2 text-left bg-transparent border-none p-0 cursor-pointer min-w-0"
                                    onclick={() => copyText('slack', project?.user.slackUserId)}
                                    title="Click to copy Slack ID"
                                >
                                    <span class="text-[12px] text-rv-text font-mono truncate">{project.user.slackUserId}</span>
                                    <span class="text-[10px] {copiedKey === 'slack' ? 'text-rv-green' : 'text-rv-dim opacity-0 group-hover:opacity-100'} shrink-0 transition-opacity">
                                        {copiedKey === 'slack' ? 'Copied' : 'Copy'}
                                    </span>
                                </button>
                                {#if slackDmUrl}
                                    <a href={slackDmUrl} target="_blank" rel="noreferrer" class="text-[11px] text-rv-blue no-underline hover:underline shrink-0">Slack ↗</a>
                                {/if}
                            </div>
                        {/if}
                        {#if project.user.hackatimeAccount}
                            <button
                                class="group flex items-center justify-between gap-2 text-left bg-transparent border-none p-0 cursor-pointer"
                                onclick={() => copyText('hackatime', project?.user.hackatimeAccount)}
                                title="Click to copy Hackatime account"
                            >
                                <span class="text-[12px] text-rv-text font-mono truncate">hackatime: {project.user.hackatimeAccount}</span>
                                <span class="text-[10px] {copiedKey === 'hackatime' ? 'text-rv-green' : 'text-rv-dim opacity-0 group-hover:opacity-100'} shrink-0 transition-opacity">
                                    {copiedKey === 'hackatime' ? 'Copied' : 'Copy'}
                                </span>
                            </button>
                        {:else}
                            <span class="text-[12px] text-rv-dim">No Hackatime account linked</span>
                        {/if}
                    </div>

                    {#if project.user.hackatimeStartDate}
                        <p class="m-0 text-[11px] text-rv-accent bg-rv-tag-bg border border-rv-accent/40 rounded-md px-2.5 py-1.5">
                            ⚠ Custom Hackatime start date: {toDateInputValue(project.user.hackatimeStartDate)}
                        </p>
                    {/if}

                    <div>
                        <button
                            class="bg-transparent border-none p-0 text-[11px] text-rv-blue cursor-pointer hover:underline"
                            onclick={() => (addressExpanded = !addressExpanded)}
                        >
                            {addressExpanded ? '▾' : '▸'} Birthday / Address
                        </button>
                        {#if addressExpanded}
                            <div class="mt-1.5 p-2.5 bg-rv-bg rounded-md border border-rv-border text-[12px] text-rv-dim flex flex-col gap-0.5">
                                {#if project.user.birthday}
                                    <p class="m-0 text-rv-text">Birthday: {toDateInputValue(project.user.birthday)}</p>
                                {/if}
                                {#if project.user.addressLine1}<p class="m-0">{project.user.addressLine1}</p>{/if}
                                {#if project.user.addressLine2}<p class="m-0">{project.user.addressLine2}</p>{/if}
                                <p class="m-0">
                                    {[project.user.city, project.user.state, project.user.zipCode].filter(Boolean).join(', ')}
                                </p>
                                {#if project.user.country}<p class="m-0">{project.user.country}</p>{/if}
                            </div>
                        {/if}
                    </div>

                    <button
                        class="{btnSm} {project.user.isSus ? 'text-yellow-600 dark:text-yellow-400 border-yellow-500/60 bg-yellow-500/10 hover:border-yellow-500' : ''} self-start"
                        onclick={toggleSusFlag}
                    >
                        {project.user.isSus ? '⚠ Sus flagged — click to clear' : 'Mark as sus'}
                    </button>
                </div>

                <hr class="border-none border-t border-rv-border m-0" />

                <!-- Hours -->
                <div class="p-4 flex flex-col gap-2">
                    <div class="flex items-center justify-between">
                        <h3 class={sectionTitle}>Hours</h3>
                        <button class={btnSm} onclick={recalculate} disabled={recalculating}>
                            {recalculating ? '⟳ Recalculating…' : '⟳ Recalculate'}
                        </button>
                    </div>
                    <div class="flex flex-col gap-1 text-[12px]">
                        <div class="flex items-center justify-between">
                            <span class="text-rv-dim">Tracked (Hackatime)</span>
                            <span class="font-semibold">{formatHours(project.nowHackatimeHours)}h</span>
                        </div>
                        {#if latestSubmission}
                            <div class="flex items-center justify-between">
                                <span class="text-rv-dim">At last submission</span>
                                <span class="font-semibold">{formatHours(latestSubmission.hackatimeHours)}h</span>
                            </div>
                        {/if}
                        <div class="flex items-center justify-between">
                            <span class="text-rv-dim">Approved</span>
                            <span class="font-semibold {project.approvedHours !== null ? 'text-rv-green' : ''}">{formatHours(project.approvedHours)}h</span>
                        </div>
                    </div>
                    {#if billyUrl}
                        <div class="flex items-end gap-1.5 pt-1">
                            <div class="flex-1 min-w-0">
                                <span class="block text-[10px] text-rv-dim mb-0.5">Billy start</span>
                                <input type="date" class="{input} px-1.5 py-1 text-[11px]" bind:value={dateRangeStart} />
                            </div>
                            <div class="flex-1 min-w-0">
                                <span class="block text-[10px] text-rv-dim mb-0.5">Billy end</span>
                                <input type="date" class="{input} px-1.5 py-1 text-[11px]" bind:value={dateRangeEnd} />
                            </div>
                            <a href={billyUrl} target="_blank" rel="noreferrer" class="{btnSm} no-underline shrink-0">Billy ↗</a>
                        </div>
                    {/if}
                </div>

                <hr class="border-none border-t border-rv-border m-0" />

                <NotesSection
                    title="Notes — Project"
                    targetType="project"
                    targetId={project.projectId}
                    bind:content={projectNote}
                    loading={notesLoading}
                />

                <hr class="border-none border-t border-rv-border m-0" />

                <NotesSection
                    title="Notes — User"
                    targetType="user"
                    targetId={project.user.userId}
                    bind:content={userNote}
                    loading={notesLoading}
                />

                <hr class="border-none border-t border-rv-border m-0" />

                <!-- Submissions -->
                <div class="p-4">
                    <h3 class="{sectionTitle} mb-2">
                        Submissions <span class="text-rv-text/60 font-normal normal-case ml-1">({submissions.length})</span>
                    </h3>
                    {#if submissionsLoading}
                        <div class="flex flex-col gap-1.5">
                            <Skeleton class="h-12 w-full" />
                            <Skeleton class="h-12 w-full" />
                        </div>
                    {:else if submissions.length === 0}
                        <p class="m-0 text-[12px] text-rv-dim">No submissions yet.</p>
                    {:else}
                        <div class="flex flex-col gap-1.5">
                            {#each submissions as s, i (s.submissionId)}
                                {@const isActive = s.submissionId === selectedSubmission?.submissionId && activeTab === 'submission'}
                                <button
                                    class="flex flex-col gap-1 px-2.5 py-2 rounded-md border text-left font-inherit cursor-pointer transition-all duration-150 {isActive ? 'bg-rv-surface2 border-rv-accent' : 'bg-rv-surface border-rv-border hover:border-rv-accent'}"
                                    onclick={() => selectSubmission(s.submissionId)}
                                >
                                    <div class="flex items-center justify-between gap-2">
                                        <span class="text-[12px] font-semibold text-rv-text">
                                            {i === 0 ? 'Latest' : `#${submissions.length - i}`}
                                        </span>
                                        <span class="py-0.5 px-2 rounded-xl text-[10px] font-semibold {statusPillClass(s.approvalStatus)}">
                                            {statusLabel(s.approvalStatus)}
                                        </span>
                                    </div>
                                    <div class="flex items-center justify-between gap-2 text-[11px] text-rv-dim">
                                        <span>{timeAgo(s.createdAt)}</span>
                                        <span>
                                            {#if s.approvedHours != null}{s.approvedHours.toFixed(1)}h approved{:else if s.hackatimeHours != null}{s.hackatimeHours.toFixed(1)}h{/if}
                                        </span>
                                    </div>
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>

            <!-- ═══ CENTER PANEL: overview / submission / timeline ═══ -->
            <div class="flex flex-col overflow-hidden">
                <TabBar tabs={centerTabs} {activeTab} onTabChange={handleTabChange} />

                <div class="flex-1 overflow-y-auto">
                    {#if activeTab === 'overview'}
                        <div class="tab-content max-w-[860px] mx-auto p-5 flex flex-col gap-5">
                            {#if effectiveScreenshot}
                                <a href={effectiveScreenshot} target="_blank" rel="noreferrer" class="block">
                                    <img
                                        src={effectiveScreenshot}
                                        alt="Project screenshot"
                                        loading="lazy"
                                        class="w-full max-h-90 object-cover rounded-lg border border-rv-border hover:border-rv-accent transition-colors"
                                    />
                                </a>
                            {/if}

                            <div class="flex items-start justify-between gap-4 flex-wrap">
                                <div class="min-w-0">
                                    <h2 class="text-xl font-semibold m-0 break-words">{project.projectTitle}</h2>
                                    <p class="m-0 mt-1 text-[12px] text-rv-dim">
                                        <span class="capitalize">{typeLabel(project.projectType)}</span>
                                        · created {formatDate(project.createdAt)}
                                        · updated {formatDate(project.updatedAt)}
                                    </p>
                                </div>
                                <div class="flex flex-wrap gap-2 shrink-0">
                                    {#if normalizeUrl(project.playableUrl)}
                                        <a href={normalizeUrl(project.playableUrl)} target="_blank" rel="noreferrer" class="{btn} no-underline">Demo ↗</a>
                                    {/if}
                                    {#if project.repoUrl}
                                        <a href={project.repoUrl} target="_blank" rel="noreferrer" class="{btn} no-underline">Repo ↗</a>
                                        <a href={`https://airlock.hackclub.com/?r=${encodeURIComponent(project.repoUrl)}`} target="_blank" rel="noreferrer" class="{btn} no-underline">Airlock ↗</a>
                                    {/if}
                                    {#if normalizeUrl(project.readmeUrl)}
                                        <a href={normalizeUrl(project.readmeUrl)} target="_blank" rel="noreferrer" class="{btn} no-underline">README ↗</a>
                                    {/if}
                                    {#if normalizeUrl(project.journalUrl)}
                                        <a href={normalizeUrl(project.journalUrl)} target="_blank" rel="noreferrer" class="{btn} no-underline">Journal ↗</a>
                                    {/if}
                                </div>
                            </div>

                            {#if project.description}
                                <p class="m-0 text-[13px] leading-relaxed text-rv-text/90 break-words">{project.description}</p>
                            {:else}
                                <p class="m-0 text-[13px] text-rv-dim italic">No description.</p>
                            {/if}

                            <div>
                                <h3 class="{sectionTitle} mb-2">Linked Hackatime projects</h3>
                                {#if (project.nowHackatimeProjects ?? []).length > 0}
                                    <div class="flex flex-wrap gap-1.5">
                                        {#each project.nowHackatimeProjects ?? [] as name}
                                            <span class="py-1 px-2.5 rounded-xl text-[11px] bg-rv-surface2 border border-rv-border text-rv-text font-mono">{name}</span>
                                        {/each}
                                    </div>
                                {:else}
                                    <p class="m-0 text-[12px] text-rv-dim">None linked.</p>
                                {/if}
                            </div>

                            <!-- Joe fraud review -->
                            <div class="bg-rv-surface border border-rv-border rounded-lg p-4 flex flex-col gap-2">
                                <div class="flex items-center justify-between gap-2 flex-wrap">
                                    <h3 class="{sectionTitle} m-0">Fraud review (Joe)</h3>
                                    <div class="flex items-center gap-2">
                                        {#if project.joeTrustScore != null}
                                            <span class="text-[11px] text-rv-dim">Trust score <span class="font-semibold text-rv-text">{project.joeTrustScore}</span></span>
                                        {/if}
                                        <span class="py-0.5 px-2 rounded-xl text-[10px] font-semibold {project.joeFraudPassed === true ? 'bg-rv-green-bg text-rv-green' : project.joeFraudPassed === false ? 'bg-rv-red-bg text-rv-red' : 'bg-rv-surface2 text-rv-dim'}">
                                            {project.joeFraudPassed === true ? 'Passed' : project.joeFraudPassed === false ? 'Failed' : 'Pending'}
                                        </span>
                                        {#if joeUrl}
                                            <a href={joeUrl} target="_blank" rel="noreferrer" class="text-[11px] text-rv-blue no-underline hover:underline">Open in Joe ↗</a>
                                        {/if}
                                    </div>
                                </div>
                                {#if project.joeJustification}
                                    <p class="m-0 text-[12px] text-rv-dim leading-relaxed break-words">{project.joeJustification}</p>
                                {:else}
                                    <p class="m-0 text-[12px] text-rv-dim italic">No justification from Joe{project.joeProjectId ? '' : ' — not yet submitted to the fraud queue'}.</p>
                                {/if}
                            </div>

                            {#if project.adminComment}
                                <div class="bg-rv-surface border-l-2 border-l-orange-500 border border-rv-border rounded-lg p-4">
                                    <h3 class="{sectionTitle} mb-1 text-orange-500">Admin comment (internal)</h3>
                                    <p class="m-0 text-[12px] text-rv-text/90 leading-relaxed break-words whitespace-pre-wrap">{project.adminComment}</p>
                                </div>
                            {/if}
                            {#if project.hoursJustification}
                                <div class="bg-rv-surface border-l-2 border-l-purple-500 border border-rv-border rounded-lg p-4">
                                    <h3 class="{sectionTitle} mb-1 text-purple-500">Hours justification (internal, synced to Airtable)</h3>
                                    <p class="m-0 text-[12px] text-rv-text/90 leading-relaxed break-words whitespace-pre-wrap">{project.hoursJustification}</p>
                                </div>
                            {/if}
                        </div>
                    {:else if activeTab === 'submission'}
                        <div class="tab-content max-w-[860px] mx-auto p-5">
                            {#if !selectedSubmission}
                                <p class="text-[13px] text-rv-dim">No submissions yet — this project is still a draft.</p>
                            {:else}
                                {@const sub = selectedSubmission}
                                {@const selectedIndex = submissions.indexOf(sub)}
                                {@const previousSubmission = selectedIndex < submissions.length - 1 ? submissions[selectedIndex + 1] : null}
                                {@const deltaHours = sub.approvedHours != null && previousSubmission?.approvedHours != null
                                    ? sub.approvedHours - previousSubmission.approvedHours
                                    : null}
                                <div class="flex flex-col gap-4">
                                    <div class="flex items-center justify-between gap-3 flex-wrap">
                                        <div class="flex items-center gap-2.5">
                                            <h2 class="text-[15px] font-semibold m-0">
                                                Submission {selectedIndex === 0 ? '(latest)' : `#${submissions.length - selectedIndex}`}
                                            </h2>
                                            <span class="py-0.5 px-2 rounded-xl text-[10px] font-semibold {statusPillClass(sub.approvalStatus)}">
                                                {statusLabel(sub.approvalStatus)}
                                            </span>
                                        </div>
                                        <a href="{base}/review/{project.projectId}?submissionId={sub.submissionId}" class="{btn} no-underline">
                                            Review this submission →
                                        </a>
                                    </div>
                                    <p class="m-0 text-[12px] text-rv-dim">
                                        Submitted {formatDate(sub.createdAt)} ({timeAgo(sub.createdAt)})
                                        {#if sub.airtableRecId}
                                            · Airtable <span class="font-mono">{sub.airtableRecId}</span>
                                        {/if}
                                    </p>

                                    <div class="grid grid-cols-3 gap-3">
                                        <div class="bg-rv-surface border border-rv-border rounded-lg p-3">
                                            <p class="m-0 text-[10px] uppercase tracking-wide text-rv-dim font-semibold">Hackatime at submit</p>
                                            <p class="m-0 mt-1 text-[16px] font-semibold">{formatHours(sub.hackatimeHours)}h</p>
                                        </div>
                                        <div class="bg-rv-surface border border-rv-border rounded-lg p-3">
                                            <p class="m-0 text-[10px] uppercase tracking-wide text-rv-dim font-semibold">Approved</p>
                                            <p class="m-0 mt-1 text-[16px] font-semibold {sub.approvedHours != null ? 'text-rv-green' : ''}">{formatHours(sub.approvedHours)}h</p>
                                        </div>
                                        <div class="bg-rv-surface border border-rv-border rounded-lg p-3">
                                            <p class="m-0 text-[10px] uppercase tracking-wide text-rv-dim font-semibold">Δ vs prior approval</p>
                                            <p class="m-0 mt-1 text-[16px] font-semibold {deltaHours != null && deltaHours > 0 ? 'text-rv-blue' : ''}">{deltaHours != null ? `+${formatHours(deltaHours)}h` : '—'}</p>
                                        </div>
                                    </div>

                                    {#if sub.screenshotUrl}
                                        <a href={sub.screenshotUrl} target="_blank" rel="noreferrer" class="block">
                                            <img
                                                src={sub.screenshotUrl}
                                                alt="Submission screenshot"
                                                loading="lazy"
                                                class="w-full max-h-72 object-cover rounded-lg border border-rv-border hover:border-rv-accent transition-colors"
                                            />
                                        </a>
                                    {/if}

                                    {#if sub.description}
                                        <div>
                                            <h3 class="{sectionTitle} mb-1">Description (at submission)</h3>
                                            <p class="m-0 text-[13px] leading-relaxed text-rv-text/90 break-words">{sub.description}</p>
                                        </div>
                                    {/if}

                                    {#if sub.hoursJustification}
                                        <div class="bg-rv-surface border-l-2 border-l-rv-blue border border-rv-border rounded-lg p-4">
                                            <h3 class="{sectionTitle} mb-1 text-rv-blue">Reviewer feedback (shown to user)</h3>
                                            <p class="m-0 text-[12px] text-rv-text/90 leading-relaxed break-words whitespace-pre-wrap">{sub.hoursJustification}</p>
                                        </div>
                                    {/if}

                                    <div class="flex flex-wrap gap-2">
                                        {#if normalizeUrl(sub.playableUrl)}
                                            <a href={normalizeUrl(sub.playableUrl)} target="_blank" rel="noreferrer" class="{btn} no-underline">Demo at submit ↗</a>
                                        {/if}
                                        {#if sub.repoUrl}
                                            <a href={sub.repoUrl} target="_blank" rel="noreferrer" class="{btn} no-underline">Repo at submit ↗</a>
                                        {/if}
                                    </div>

                                    <p class="m-0 text-[11px] text-rv-dim">
                                        Verdicts, approved hours, and feedback are edited in the review dash — use “Review this submission” above.
                                    </p>
                                </div>
                            {/if}
                        </div>
                    {:else if activeTab === 'timeline'}
                        <div class="tab-content max-w-[860px] mx-auto p-5">
                            {#if timelineLoading}
                                <div class="flex flex-col gap-2">
                                    <Skeleton class="h-14 w-full" />
                                    <Skeleton class="h-14 w-full" />
                                    <Skeleton class="h-14 w-full" />
                                </div>
                            {:else if timeline}
                                <div class="relative ml-3">
                                    <div class="absolute left-1 top-0 bottom-0 w-0.5 bg-rv-border"></div>
                                    <div class="flex flex-col gap-2.5">
                                        {#each timeline.timeline as event}
                                            <div class="relative pl-6">
                                                <div class="absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full {timelineDotColor(event.type)} ring-2 ring-rv-bg"></div>
                                                <div class="rounded-lg border border-rv-border bg-rv-surface p-3">
                                                    <div class="flex flex-wrap items-center gap-2 mb-1">
                                                        <span class="text-[11px] font-bold uppercase tracking-wide">{timelineEventLabel(event.type)}</span>
                                                        <span class="text-[11px] text-rv-dim">{formatDate(event.timestamp)}</span>
                                                        {#if event.actor}
                                                            <span class="text-[11px] text-rv-dim">
                                                                by {event.actor.firstName ?? ''} {event.actor.lastName ?? ''} ({event.actor.email})
                                                            </span>
                                                        {/if}
                                                    </div>
                                                    {#if event.details && Object.keys(event.details).length > 0}
                                                        <pre class="m-0 text-[11px] text-rv-dim whitespace-pre-wrap break-words font-mono">{JSON.stringify(event.details, null, 2)}</pre>
                                                    {/if}
                                                </div>
                                            </div>
                                        {/each}
                                    </div>
                                </div>
                            {:else}
                                <p class="text-[13px] text-rv-dim">Couldn't load the timeline.</p>
                            {/if}
                        </div>
                    {/if}
                </div>
            </div>

            <!-- ═══ RIGHT PANEL: editor ═══ -->
            <div class="bg-rv-surface border-l border-rv-border flex flex-col overflow-hidden">
                <div class="flex items-center justify-between px-4 py-2.5 border-b border-rv-border shrink-0">
                    <h3 class="{sectionTitle} m-0">Edit project</h3>
                    {#if !isSuperadmin && me}
                        <span class="text-[10px] text-rv-dim">read-only · superadmin required</span>
                    {/if}
                </div>

                <div class="flex-1 overflow-y-auto">
                    <fieldset disabled={!isSuperadmin} class="border-none m-0 p-4 flex flex-col gap-3.5">
                        <div>
                            <label class={label} for="ed-title">Title</label>
                            <input id="ed-title" class={input} bind:value={projectTitle} maxlength={30} />
                        </div>
                        <div>
                            <label class={label} for="ed-type">Type</label>
                            <select id="ed-type" class={input} bind:value={projectType}>
                                {#each projectTypes as t}
                                    <option value={t}>{typeLabel(t)}</option>
                                {/each}
                            </select>
                        </div>
                        <div>
                            <label class={label} for="ed-desc">Description</label>
                            <textarea id="ed-desc" class="{input} resize-y min-h-[70px]" bind:value={description} maxlength={500}></textarea>
                        </div>
                        <div>
                            <label class={label} for="ed-playable">Playable URL</label>
                            <input id="ed-playable" class={input} bind:value={playableUrl} />
                        </div>
                        <div>
                            <label class={label} for="ed-repo">Repo URL</label>
                            <input id="ed-repo" class={input} bind:value={repoUrl} />
                        </div>
                        <div>
                            <label class={label} for="ed-readme">README URL</label>
                            <input id="ed-readme" class={input} bind:value={readmeUrl} />
                        </div>
                        <div>
                            <label class={label} for="ed-journal">Journal URL</label>
                            <input id="ed-journal" class={input} bind:value={journalUrl} />
                        </div>
                        <div>
                            <label class={label} for="ed-screenshot">Screenshot URL</label>
                            <input id="ed-screenshot" class={input} bind:value={screenshotUrl} />
                        </div>
                        <div>
                            <label class={label} for="ed-hours">Approved hours (blank to clear)</label>
                            <input id="ed-hours" class={input} type="number" min="0" step="0.1" bind:value={approvedHoursText} />
                        </div>
                        <div>
                            <label class={label} for="ed-justify">Hours justification (internal, Airtable)</label>
                            <textarea id="ed-justify" class="{input} resize-y min-h-[60px]" bind:value={hoursJustificationEdit}></textarea>
                        </div>
                        <div>
                            <label class={label} for="ed-comment">Admin comment (internal)</label>
                            <textarea id="ed-comment" class="{input} resize-y min-h-[60px]" bind:value={adminCommentEdit} maxlength={1000}></textarea>
                        </div>

                        <label class="flex items-center gap-2 cursor-pointer text-[12px]">
                            <input type="checkbox" class="accent-rv-accent" bind:checked={isLocked} />
                            Lock project (prevents owner edits)
                        </label>

                        <div class="rounded-md border {permReject ? 'border-rv-red/60 bg-rv-red-bg' : 'border-rv-border'} p-3">
                            <label class="flex items-start gap-2 cursor-pointer">
                                <input type="checkbox" class="accent-red-500 mt-0.5" bind:checked={permReject} />
                                <span class="text-[12px]">
                                    <span class="font-semibold text-rv-red">Permanently reject project</span>
                                    <span class="block text-[11px] text-rv-dim mt-0.5">
                                        User cannot resubmit or edit. The reason shown to the user is the latest submission's reviewer feedback — set it via the review page or the fraud-review flow before enabling. Untick to lift the perm-reject; this is the only undo path.
                                    </span>
                                </span>
                            </label>
                        </div>

                        <!-- Hackatime linking -->
                        <div class="border-t border-rv-border pt-3.5 flex flex-col gap-2">
                            <div class="flex items-center justify-between gap-2">
                                <div class="min-w-0">
                                    <h4 class="{sectionTitle} m-0">Linked Hackatime projects</h4>
                                    {#if hackatimeOwnerAccount}
                                        <p class="m-0 mt-0.5 text-[11px] text-rv-dim truncate">
                                            {hackatimeOwnerAccount}{hackatimeOwnerStartDate ? ` · from ${toDateInputValue(hackatimeOwnerStartDate)}` : ''}
                                        </p>
                                    {:else}
                                        <p class="m-0 mt-0.5 text-[11px] text-rv-dim">Owner has no Hackatime account linked.</p>
                                    {/if}
                                </div>
                                <button class="{btnSm} shrink-0" onclick={loadHackatime} disabled={hackatimeLoading} type="button">
                                    {hackatimeLoading ? 'Loading…' : 'Refresh'}
                                </button>
                            </div>

                            {#if linkedProjects.length > 0}
                                <div class="flex flex-wrap gap-1.5">
                                    {#each linkedProjects as name}
                                        <span class="inline-flex items-center gap-1.5 rounded-xl border border-rv-border bg-rv-surface2 px-2.5 py-1 text-[11px] font-mono">
                                            {name}
                                            <button
                                                type="button"
                                                class="bg-transparent border-none p-0 text-rv-dim hover:text-rv-red cursor-pointer leading-none"
                                                onclick={() => toggleLinked(name)}
                                                aria-label={`Remove ${name}`}
                                            >×</button>
                                        </span>
                                    {/each}
                                </div>
                            {:else}
                                <p class="m-0 text-[12px] text-rv-dim">No Hackatime projects linked.</p>
                            {/if}

                            {#if hackatimeError}
                                <p class="m-0 text-[11px] text-rv-red">{hackatimeError}</p>
                            {/if}

                            {#if hackatimeProjects.length > 0}
                                <div class="rounded-md border border-rv-border bg-rv-bg">
                                    <p class="m-0 border-b border-rv-border px-2.5 py-1.5 text-[10px] text-rv-dim">
                                        Available projects (post-start-date hours)
                                    </p>
                                    <ul class="m-0 p-0 list-none max-h-56 overflow-y-auto divide-y divide-rv-divider text-[12px]">
                                        {#each hackatimeProjects as p}
                                            {@const linked = linkedProjects.includes(p.name)}
                                            <li class="flex items-center justify-between gap-2 px-2.5 py-1.5">
                                                <label class="flex flex-1 items-center gap-2 cursor-pointer min-w-0">
                                                    <input type="checkbox" class="accent-rv-accent shrink-0" checked={linked} onchange={() => toggleLinked(p.name)} />
                                                    <span class="font-mono truncate">{p.name}</span>
                                                </label>
                                                <span class="text-[11px] text-rv-dim shrink-0">{p.totalHours.toFixed(1)}h</span>
                                            </li>
                                        {/each}
                                    </ul>
                                </div>
                            {/if}

                            <div class="flex gap-1.5">
                                <input class={input} placeholder="Add project name manually" bind:value={manualHackatimeInput} />
                                <button class="{btnSm} shrink-0" onclick={addManualHackatime} disabled={!manualHackatimeInput.trim()} type="button">
                                    Add
                                </button>
                            </div>
                        </div>
                    </fieldset>

                    <!-- Danger zone -->
                    <div class="border-t border-rv-border p-4 flex flex-col gap-2">
                        <h4 class="{sectionTitle} m-0 text-rv-red">Danger zone</h4>
                        {#if project.isLocked}
                            <button class="{btn} self-start" onclick={unlockProject} disabled={projectBusy}>Unlock project</button>
                        {/if}
                        {#if project.joeFraudPassed === false || project.permReject}
                            <button class="{btn} self-start border-rv-red/60 text-rv-red hover:border-rv-red" onclick={resetJoeAndRequeue} disabled={projectBusy}>
                                Reset Joe & requeue
                            </button>
                        {/if}
                        <button class="{btn} self-start border-rv-red/60 text-rv-red hover:border-rv-red" onclick={deleteProject} disabled={projectBusy}>
                            Delete project
                        </button>
                        <p class="m-0 text-[11px] text-rv-dim">Deletion is permanent and cannot be undone.</p>
                    </div>
                </div>

                <div class="flex items-center justify-between gap-2 px-4 py-3 border-t border-rv-border shrink-0">
                    <span class="text-[11px] text-rv-red truncate">{saveError}</span>
                    <button
                        class="bg-rv-accent border border-rv-accent text-rv-bg px-4 py-1.5 rounded-md text-[12px] font-semibold cursor-pointer transition-all duration-150 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                        onclick={saveEdit}
                        disabled={saving || !isSuperadmin}
                    >
                        {saving ? 'Saving…' : 'Save changes'}
                    </button>
                </div>
            </div>
        </div>
    {/if}
</div>
