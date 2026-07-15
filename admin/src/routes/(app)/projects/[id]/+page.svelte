<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/state';
    import { base } from '$app/paths';
    import { afterNavigate, goto } from '$app/navigation';
    import { env } from '$env/dynamic/public';
    import { api, type components } from '$lib/api';
    import { ensureUser } from '$lib/auth';
    import { addToast } from '$lib/toastStore';
    import { Skeleton } from '$lib/components';
    import { Pencil, Timer, Send, CircleCheck, CircleX, Hourglass, ExternalLink, History, ChevronsRight } from 'lucide-svelte';
    import NoteCard from './NoteCard.svelte';
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
    let isAdminOrAbove = $derived(me?.role === 'admin' || me?.role === 'superadmin');

    // --- Project ---
    let project = $state<AdminProject | null>(null);
    let loading = $state(true);
    let loadError = $state('');

    // --- Submissions ---
    let submissions = $state<AdminSubmission[]>([]);
    let submissionsLoading = $state(false);
    let selectedSubmissionId = $state<number | null>(null);
    let selectedSubmission = $derived(
        submissions.find((s) => s.submissionId === selectedSubmissionId) ?? submissions[0] ?? null,
    );

    // --- Timeline right bar (hover slides out, pin keeps open; lazy-loaded) ---
    let timelineOpen = $state(false);
    let timeline = $state<ProjectTimelineResponse | null>(null);
    let timelineLoading = $state(false);

    // --- Notes (shared with the review dash via the reviewer notes endpoints) ---
    let projectNote = $state('');
    let userNote = $state('');
    let notesLoading = $state(false);

    // --- Inline edit state (one section at a time) ---
    type EditSection =
        | 'title'
        | 'flags'
        | 'hours'
        | 'details'
        | 'hackatime'
        | 'comment'
        | 'verdict'
        | 'snapshot';
    let editing = $state<EditSection | null>(null);
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
    let dangerOpen = $state(false);

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
    // Introspect deep link with everything it can prefill (same format the
    // review dash's UserInfo builds).
    let introspectUrl = $derived.by(() => {
        if (!project) return null;
        const params = new URLSearchParams();
        if (project.repoUrl) params.append('repo_url', project.repoUrl);
        if (project.playableUrl) params.append('demo_url', project.playableUrl);
        if (project.user.slackUserId) params.append('slack_id', project.user.slackUserId);
        const sub = selectedSubmission;
        if (sub?.hackatimeHours != null) params.append('hours', String(sub.hackatimeHours));
        if (sub?.createdAt) params.append('submission_date', sub.createdAt);
        for (const name of project.nowHackatimeProjects ?? []) {
            params.append('hackatime_projects', name);
        }
        const qs = params.toString();
        return `https://introspect.sahil.ink/${qs ? `?${qs}` : ''}`;
    });
    let selectedSubmissionNumber = $derived(
        selectedSubmission ? submissions.length - submissions.indexOf(selectedSubmission) : null,
    );

    // Airtable record deep link. Prefer the frontend env config
    // (PUBLIC_AIRTABLE_BASE_ID / _TABLE_ID / _VIEW_ID) — including the view id
    // makes the link land on the right view. Falls back to the backend-built
    // URL (base + table only) when the env vars aren't set.
    function airtableRecordUrl(sub: AdminSubmission): string | null {
        if (!sub.airtableRecId) return null;
        const baseId = env.PUBLIC_AIRTABLE_BASE_ID;
        const table = env.PUBLIC_AIRTABLE_TABLE_ID;
        const view = env.PUBLIC_AIRTABLE_VIEW_ID;
        if (baseId && table && view) {
            return `https://airtable.com/${baseId}/${table}/${view}/${sub.airtableRecId}`;
        }
        return sub.airtableRecordUrl;
    }

    // --- Helpers ---
    function formatDate(value: string) {
        return new Date(value).toLocaleString();
    }

    function formatDateShort(value: string) {
        return new Date(value).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }

    function daysBetweenLabel(newer: string, older: string): string {
        const days = Math.round(
            (new Date(newer).getTime() - new Date(older).getTime()) / 86_400_000,
        );
        if (days <= 0) return '–same day–';
        return `–${days} day${days === 1 ? '' : 's'}–`;
    }

    function sameDay(a: string, b: string): boolean {
        return new Date(a).toDateString() === new Date(b).toDateString();
    }

    // Auto-size a textarea to its content.
    function autogrow(node: HTMLTextAreaElement) {
        const resize = () => {
            node.style.height = 'auto';
            node.style.height = `${node.scrollHeight + 2}px`;
        };
        resize();
        node.addEventListener('input', resize);
        return { destroy: () => node.removeEventListener('input', resize) };
    }

    // Signed hour delta: "+1.2h" / "-0.5h", never "+-0.5h" or "-0.0h".
    function formatDelta(delta: number): string {
        const rounded = Math.round(delta * 10) / 10;
        if (rounded === 0) return '0.0h';
        return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}h`;
    }

    function submissionStatusText(s: AdminSubmission, index: number): { text: string; cls: string } {
        if (s.approvalStatus === 'approved') {
            const prev = submissions[index + 1];
            if (prev?.approvedHours != null && s.approvedHours != null) {
                const delta = s.approvedHours - prev.approvedHours;
                return {
                    text: `Approved reship (${formatDelta(delta)})`,
                    cls: 'text-rv-green',
                };
            }
            return {
                text: s.approvedHours != null ? `Approved (${s.approvedHours.toFixed(1)}h)` : 'Approved',
                cls: 'text-rv-green',
            };
        }
        if (s.approvalStatus === 'rejected') return { text: 'Rejected', cls: 'text-rv-red' };
        return { text: 'Pending review', cls: 'text-rv-dim' };
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

    // Flatten event.details into readable key/value rows (instead of raw JSON).
    function detailEntries(details: unknown): { key: string; value: string }[] {
        if (!details || typeof details !== 'object') return [];
        return Object.entries(details as Record<string, unknown>)
            .filter(([, v]) => v !== null && v !== undefined && v !== '')
            .map(([k, v]) => ({
                key: k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase(),
                value: typeof v === 'object' ? JSON.stringify(v) : String(v),
            }));
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

    // Hovering the collapsed rail slides the bar out; clicking the rail pins
    // it open, and the collapse button unpins it.
    let timelineHover = $state(false);
    let timelineExpanded = $derived(timelineOpen || timelineHover);

    function invalidateTimeline() {
        timeline = null;
        if (timelineExpanded) void loadTimeline();
    }

    function timelineMouseEnter() {
        timelineHover = true;
        void loadTimeline();
    }

    function timelineMouseLeave() {
        timelineHover = false;
    }

    function selectSubmission(submissionId: number) {
        selectedSubmissionId = submissionId;
        if (typeof document !== 'undefined') {
            document
                .getElementById('submission-detail')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
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

    function cancelEditing() {
        if (project) hydrateForm(project);
        editing = null;
        saveError = '';
    }

    // Builds the full admin PATCH body from the hydrated form state. Returns
    // null (with saveError set) when approved hours fail validation.
    function buildProjectPatchBody(): (UpdateAdminProjectDto & { permReject?: boolean }) | null {
        let approvedHours: number | null = null;
        if (approvedHoursText.trim() !== '') {
            const parsed = Number(approvedHoursText);
            if (isNaN(parsed) || parsed < 0) {
                saveError = 'Approved hours must be a non-negative number';
                return null;
            }
            approvedHours = parsed;
        }
        return {
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
    }

    async function saveEdit() {
        saving = true;
        saveError = '';

        const body = buildProjectPatchBody();
        if (!body) {
            saving = false;
            return;
        }

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
            editing = null;
            invalidateTimeline();
            await loadSubmissions();
        } catch (e) {
            saveError = e instanceof Error ? e.message : 'Failed to save';
        } finally {
            saving = false;
        }
    }

    // --- Per-submission verdict editing (goes through the reviewer endpoint,
    // which owns the side effects: audit log, notifications, Airtable sync;
    // finalized-verdict flips are rejected server-side unless superadmin) ---
    let verdictStatus = $state<'pending' | 'approved' | 'rejected'>('pending');
    let verdictHoursText = $state('');
    let verdictFeedback = $state('');
    let verdictSendEmail = $state(false);
    let verdictPermReject = $state(false);

    function openVerdictEditor() {
        const sub = selectedSubmission;
        if (!sub) return;
        verdictStatus = sub.approvalStatus as 'pending' | 'approved' | 'rejected';
        verdictHoursText = sub.approvedHours == null ? '' : String(sub.approvedHours);
        verdictFeedback = sub.hoursJustification ?? '';
        verdictSendEmail = false;
        verdictPermReject = project?.permReject ?? false;
        hoursJustificationEdit = project?.hoursJustification ?? '';
        saveError = '';
        editing = 'verdict';
    }

    async function saveVerdict() {
        const sub = selectedSubmission;
        if (!sub) return;
        saving = true;
        saveError = '';

        let approvedHours: number | undefined;
        if (verdictHoursText.trim() !== '') {
            const parsed = Number(verdictHoursText);
            if (isNaN(parsed) || parsed < 0) {
                saveError = 'Approved hours must be a non-negative number';
                saving = false;
                return;
            }
            approvedHours = parsed;
        }

        try {
            const { error } = await api.PUT('/api/reviewer/submissions/{id}/review', {
                params: { path: { id: sub.submissionId } },
                body: {
                    approvalStatus: verdictStatus,
                    ...(approvedHours !== undefined ? { approvedHours } : {}),
                    userFeedback: verdictFeedback,
                    sendEmail: verdictSendEmail,
                    ...(verdictStatus === 'rejected' ? { permReject: verdictPermReject } : {}),
                },
            });
            if (error) {
                saveError = errorMessage(error, 'Failed to save verdict');
                return;
            }
            // The hours justification lives on the Project row — persist it
            // through the admin PATCH (superadmin-only) when it changed.
            if (isSuperadmin && hoursJustificationEdit !== (project?.hoursJustification ?? '')) {
                const body = buildProjectPatchBody();
                if (body) {
                    const { data, error: patchError } = await api.PATCH('/api/admin/projects/{id}', {
                        params: { path: { id: projectId } },
                        body,
                    });
                    if (patchError) {
                        saveError = errorMessage(patchError, 'Verdict saved, but the hours justification failed to save');
                        return;
                    }
                    if (data) hydrateForm(data);
                }
            }
            addToast('Verdict saved', 'success');
            editing = null;
            await Promise.all([loadProject(), loadSubmissions()]);
            invalidateTimeline();
        } catch (e) {
            saveError = e instanceof Error ? e.message : 'Failed to save verdict';
        } finally {
            saving = false;
        }
    }

    // --- Latest-submission approved hours (pencil on the Hours card's
    // "Approved" row; saves through the reviewer endpoint) ---
    let latestHoursText = $state('');

    function openLatestHoursEditor() {
        if (!latestSubmission) return;
        latestHoursText =
            latestSubmission.approvedHours == null ? '' : String(latestSubmission.approvedHours);
        saveError = '';
        editing = 'hours';
    }

    async function saveLatestHours() {
        const sub = latestSubmission;
        if (!sub) return;
        const parsed = Number(latestHoursText);
        if (latestHoursText.trim() === '' || isNaN(parsed) || parsed < 0) {
            saveError = 'Approved hours must be a non-negative number';
            return;
        }
        saving = true;
        saveError = '';
        try {
            const { error } = await api.PUT('/api/reviewer/submissions/{id}/review', {
                params: { path: { id: sub.submissionId } },
                body: { approvedHours: parsed },
            });
            if (error) {
                saveError = errorMessage(error, 'Failed to save hours');
                return;
            }
            addToast('Hours saved', 'success');
            editing = null;
            await Promise.all([loadProject(), loadSubmissions()]);
            invalidateTimeline();
        } catch (e) {
            saveError = e instanceof Error ? e.message : 'Failed to save hours';
        } finally {
            saving = false;
        }
    }

    // --- Submission snapshot editing (superadmin; PATCH /admin/submissions/:id) ---
    let snapDescription = $state('');
    let snapPlayable = $state('');
    let snapRepo = $state('');
    let snapScreenshot = $state('');
    let snapHoursText = $state('');

    function openSnapshotEditor() {
        const sub = selectedSubmission;
        if (!sub) return;
        snapDescription = sub.description ?? '';
        snapPlayable = sub.playableUrl ?? '';
        snapRepo = sub.repoUrl ?? '';
        snapScreenshot = sub.screenshotUrl ?? '';
        snapHoursText = sub.hackatimeHours == null ? '' : String(sub.hackatimeHours);
        saveError = '';
        editing = 'snapshot';
    }

    async function saveSnapshot() {
        const sub = selectedSubmission;
        if (!sub) return;
        saving = true;
        saveError = '';

        let hackatimeHours: number | undefined;
        if (snapHoursText.trim() !== '') {
            const parsed = Number(snapHoursText);
            if (isNaN(parsed) || parsed < 0) {
                saveError = 'Hackatime hours must be a non-negative number';
                saving = false;
                return;
            }
            hackatimeHours = parsed;
        }

        try {
            const { error } = await api.PATCH('/api/admin/submissions/{id}', {
                params: { path: { id: sub.submissionId } },
                body: {
                    description: snapDescription.trim() || null,
                    playableUrl: snapPlayable.trim() || null,
                    repoUrl: snapRepo.trim() || null,
                    screenshotUrl: snapScreenshot.trim() || null,
                    ...(hackatimeHours !== undefined ? { hackatimeHours } : {}),
                },
            });
            if (error) {
                saveError = errorMessage(error, 'Failed to save submission');
                return;
            }
            addToast('Submission saved', 'success');
            editing = null;
            await loadSubmissions();
            invalidateTimeline();
        } catch (e) {
            saveError = e instanceof Error ? e.message : 'Failed to save submission';
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

    // Load on BOTH onMount and afterNavigate: on a direct page load the (app)
    // layout mounts children only after its async auth gate, by which point
    // the initial navigation has completed — so afterNavigate never fires and
    // only onMount catches it. afterNavigate covers same-route navigations
    // between project ids (e.g. via the command palette), which reuse this
    // component. The loadedProjectId guard makes the two paths idempotent,
    // and per-project state is reset so lazy-load guards (timeline,
    // selectedSubmissionId) don't pin stale data.
    let loadedProjectId: number | null = null;
    function loadIfNeeded() {
        if (projectId === loadedProjectId) return;
        loadedProjectId = projectId;
        loading = true;
        submissions = [];
        selectedSubmissionId = null;
        timeline = null;
        editing = null;
        dangerOpen = false;
        saveError = '';
        void loadPage();
        if (timelineOpen) void loadTimeline();
    }
    onMount(loadIfNeeded);
    afterNavigate(loadIfNeeded);

    // --- Shared class strings (rv design language, matching the review dash) ---
    const btn =
        'bg-rv-surface2 border border-rv-border text-rv-text px-3 py-1.5 rounded-md text-[12px] font-medium cursor-pointer transition-all duration-150 hover:border-rv-accent disabled:opacity-50 disabled:cursor-not-allowed';
    const btnSm =
        'bg-rv-surface2 border border-rv-border text-rv-dim px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer transition-all duration-150 hover:text-rv-text hover:border-rv-accent disabled:opacity-50 disabled:cursor-not-allowed';
    const input =
        'w-full bg-rv-bg border border-rv-border rounded-md px-2.5 py-2 text-rv-text text-[13px] focus:outline-none focus:border-rv-accent disabled:opacity-60 disabled:cursor-not-allowed';
    const label = 'block text-[11px] uppercase tracking-[0.8px] text-rv-dim font-semibold mb-1';
    const sectionTitle = 'text-[11px] uppercase tracking-wider text-rv-dim font-semibold';
    // Sub-label for read-mode field values (subordinate to card titles)
    const subLabel = 'block text-[10px] text-rv-dim mb-0.5';
    // Figma-style outline pill action (Mark as sus / Recalculate)
    const pillBtn =
        'self-start rounded-lg border bg-transparent px-2.5 py-1 text-[11px] font-medium cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
    // Inline editor Save / Cancel
    const saveBtnSm =
        'bg-rv-accent border border-rv-accent text-rv-bg px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer transition-all duration-150 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed';
    const cancelBtnSm =
        'bg-transparent border border-rv-border text-rv-dim px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer transition-all duration-150 hover:text-rv-text disabled:opacity-50 disabled:cursor-not-allowed';
    const pencilBtn =
        'edit-pencil bg-transparent border-none p-0 text-rv-dim hover:text-rv-text cursor-pointer flex items-center';
    // Hovering a pencil tints the region it edits (inset shadow so the
    // element's own background is preserved).
    const editableRegion =
        'transition-shadow duration-150 has-[.edit-pencil:hover]:shadow-[inset_0_0_0_999px_rgba(245,166,35,0.08)]';
</script>

<svelte:head>
    <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
    />
    <title>Project #{projectId} - Admin Panel</title>
</svelte:head>

<div class="font-[Inter,sans-serif] bg-rv-bg text-rv-text h-screen flex flex-col overflow-hidden">
    {#snippet saveCancel()}
        <div class="flex items-center gap-1.5">
            <button class={saveBtnSm} onclick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            <button class={cancelBtnSm} onclick={cancelEditing} disabled={saving}>Cancel</button>
            {#if saveError}<span class="text-[11px] text-rv-red truncate">{saveError}</span>{/if}
        </div>
    {/snippet}

    {#snippet editPencil(section: EditSection, title: string)}
        {#if isSuperadmin && editing !== section}
            <button class={pencilBtn} onclick={() => (editing = section)} {title} aria-label={title}>
                <Pencil size={13} />
            </button>
        {/if}
    {/snippet}

    {#if loading}
        <!-- Skeleton chrome: same left-column + timeline-strip layout as the
             loaded page, so navigation feels instant instead of flashing. -->
        <div class="grid grid-cols-[340px_1fr] flex-1 overflow-hidden">
            <div class="bg-rv-surface border-r border-rv-border overflow-hidden p-4 flex flex-col gap-4">
                <Skeleton class="h-4 w-20" />
                <div class="flex flex-col gap-2">
                    <Skeleton class="h-7 w-3/4" />
                    <Skeleton class="h-4 w-32 rounded-xl" />
                </div>
                <Skeleton class="h-40 w-full rounded-lg" />
                <Skeleton class="h-44 w-full rounded-lg" />
                <Skeleton class="h-32 w-full rounded-lg" />
                <Skeleton class="h-10 w-full rounded-lg" />
                <Skeleton class="h-10 w-full rounded-lg" />
            </div>
            <div class="flex flex-col overflow-hidden">
                <div class="flex items-center gap-3 px-4 py-2.5 bg-rv-surface border-b border-rv-border shrink-0">
                    <Skeleton class="h-12 w-44 rounded-lg" />
                    <Skeleton class="h-3 w-12" />
                    <Skeleton class="h-12 w-44 rounded-lg" />
                </div>
                <div class="max-w-[860px] w-full mx-auto p-5 flex flex-col gap-5">
                    <Skeleton class="h-6 w-56" />
                    <div class="flex flex-col gap-2">
                        <Skeleton class="h-3.5 w-full" />
                        <Skeleton class="h-3.5 w-full" />
                        <Skeleton class="h-3.5 w-2/3" />
                    </div>
                    <Skeleton class="h-32 w-full" />
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
        {#if project.deletedAt}
            <div class="px-5 py-2 bg-rv-red-bg border-b border-rv-red/40 text-rv-red text-[12px] font-semibold shrink-0">
                Deleted by owner · {formatDate(project.deletedAt)}
            </div>
        {/if}

        <div class="grid grid-cols-[340px_1fr_auto] flex-1 overflow-hidden">
            <!-- ═══ LEFT COLUMN: everything project-level ═══ -->
            <div class="bg-rv-surface border-r border-rv-border overflow-y-auto p-4 flex flex-col gap-4">
                <a href="{base}/projects" class="{btnSm} no-underline self-start">← Projects</a>

                {#if selectedSubmissionNumber != null}
                    <div class="-mt-2 rounded-md border border-rv-accent/40 bg-rv-tag-bg px-2.5 py-1.5 text-[12px] font-semibold text-rv-accent">
                        Showing selected submission #{selectedSubmissionNumber}
                    </div>
                {/if}

                <!-- Title + tags + description -->
                <div class="flex flex-col gap-1.5">
                    {#if editing === 'title'}
                        <input class={input} bind:value={projectTitle} maxlength={30} placeholder="Project title" />
                        <select class={input} bind:value={projectType}>
                            {#each projectTypes as t}
                                <option value={t}>{typeLabel(t)}</option>
                            {/each}
                        </select>
                        {@render saveCancel()}
                    {:else}
                        <div class="flex flex-col gap-1 rounded-md {editableRegion}">
                            <div class="flex items-center gap-2">
                                <h1 class="text-[22px] font-bold leading-tight m-0 break-words min-w-0">
                                    {project.projectTitle}
                                </h1>
                                {@render editPencil('title', 'Edit title & type')}
                            </div>
                            <span class="text-[11px] text-rv-dim">
                                #{project.projectId} · <span class="capitalize">{typeLabel(project.projectType)}</span>
                            </span>
                        </div>
                    {/if}
                    <div class="flex flex-wrap items-center gap-1.5 rounded-md {editableRegion}">
                        {#if project.isLocked}
                            <span class="py-0.5 px-2 rounded-xl text-[10px] font-semibold bg-rv-tag-bg text-rv-accent">Locked</span>
                        {:else}
                            <span class="py-0.5 px-2 rounded-xl text-[10px] font-semibold bg-rv-surface2 text-rv-dim">Unlocked</span>
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
                        {@render editPencil('flags', 'Edit lock & perm-reject flags')}
                    </div>
                    {#if editing === 'flags'}
                        <div class="flex flex-col gap-2 mt-1">
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
                            {@render saveCancel()}
                        </div>
                    {/if}
                    {#if project.description}
                        <p class="m-0 text-[12px] leading-relaxed text-rv-text/90 break-words">{project.description}</p>
                    {:else}
                        <p class="m-0 text-[12px] text-rv-dim italic">No description.</p>
                    {/if}
                    <span class="text-[10px] text-rv-dim">
                        Created {formatDate(project.createdAt)} · updated {formatDate(project.updatedAt)}
                    </span>
                </div>

                <!-- Screenshot -->
                {#if effectiveScreenshot}
                    <a href={effectiveScreenshot} target="_blank" rel="noreferrer" class="block">
                        <img
                            src={effectiveScreenshot}
                            alt="Project screenshot"
                            loading="lazy"
                            class="w-full h-40 object-cover rounded-lg border border-rv-border hover:border-rv-accent transition-colors"
                        />
                    </a>
                {:else}
                    <div class="w-full h-40 rounded-lg bg-rv-surface2 border border-rv-border flex items-center justify-center text-[11px] text-rv-dim">
                        No screenshot
                    </div>
                {/if}

                <!-- Toolkit (same button theming as the review panel's link grid) -->
                <div class="border border-rv-border rounded-lg p-3 flex flex-col gap-2">
                    <span class={sectionTitle}>Toolkit</span>
                    <div class="grid grid-cols-2 gap-2 [&_a]:flex [&_a]:items-center [&_a]:justify-center [&_a]:gap-1 [&_a]:text-rv-dim [&_a]:no-underline [&_a]:text-[12px] [&_a]:font-medium [&_a]:py-1.5 [&_a]:px-2.5 [&_a]:border [&_a]:border-rv-border [&_a]:rounded-md [&_a]:transition-all [&_a]:duration-150 [&_a:hover]:text-rv-accent [&_a:hover]:border-rv-accent">
                        {#if normalizeUrl(project.playableUrl)}
                            <a href={normalizeUrl(project.playableUrl)} target="_blank" rel="noreferrer" class="bg-[rgba(239,83,80,0.15)]! text-rv-red! border-[rgba(239,83,80,0.3)]! hover:bg-[rgba(239,83,80,0.25)]!">Demo ↗</a>
                        {/if}
                        {#if project.repoUrl}
                            <a href={project.repoUrl} target="_blank" rel="noreferrer">Repo ↗</a>
                            <a href={`https://airlock.hackclub.com/?r=${encodeURIComponent(project.repoUrl)}`} target="_blank" rel="noreferrer" class="border-rv-accent! text-rv-accent! hover:bg-rv-tag-bg!">Airlock ↗</a>
                        {/if}
                        {#if normalizeUrl(project.readmeUrl)}
                            <a href={normalizeUrl(project.readmeUrl)} target="_blank" rel="noreferrer">README ↗</a>
                        {/if}
                        {#if normalizeUrl(project.journalUrl)}
                            <a href={normalizeUrl(project.journalUrl)} target="_blank" rel="noreferrer">Journal ↗</a>
                        {/if}
                        {#if joeUrl}
                            <a href={joeUrl} target="_blank" rel="noreferrer" class="border-ds-accent! text-ds-accent! hover:bg-ds-accent-bg!">Joe ↗</a>
                        {/if}
                        {#if introspectUrl}
                            <a href={introspectUrl} target="_blank" rel="noreferrer" class="border-rv-accent! text-rv-accent! hover:bg-rv-tag-bg!" title="Open in Introspect with this submission prefilled">Introspect ↗</a>
                        {/if}
                        <a
                            href="{base}/review/{project.projectId}{selectedSubmission ? `?submissionId=${selectedSubmission.submissionId}` : ''}"
                        >Review Dash →</a>
                    </div>
                </div>

                <!-- Hours card (project-level) -->
                <div class="border border-rv-border rounded-lg p-3 flex flex-col gap-2 {editableRegion}">
                    <span class={sectionTitle}>Hours</span>

                    {#if editing === 'hours'}
                        <div>
                            <label class={label} for="ih-hours">Approved Hours (latest submission)</label>
                            <input id="ih-hours" class={input} type="number" min="0" step="0.1" bind:value={latestHoursText} />
                        </div>
                        <div class="flex items-center gap-1.5">
                            <button class={saveBtnSm} onclick={saveLatestHours} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                            <button class={cancelBtnSm} onclick={cancelEditing} disabled={saving}>Cancel</button>
                            {#if saveError}<span class="text-[11px] text-rv-red truncate">{saveError}</span>{/if}
                        </div>
                    {:else}
                        <div class="flex items-center gap-1.5 text-[13px]" title="Hours currently tracked on Hackatime for this project">
                            <Timer size={15} class="text-rv-dim shrink-0" />
                            Tracked {formatHours(project.nowHackatimeHours)} hours
                        </div>
                        {#if project.approvedHours !== null}
                            <div class="flex items-center gap-1.5 text-[13px] text-rv-green" title="Project approved total">
                                <CircleCheck size={15} class="shrink-0" />
                                Approved {formatHours(project.approvedHours)} hours
                                {#if isAdminOrAbove && latestSubmission}
                                    <button
                                        class={pencilBtn}
                                        onclick={openLatestHoursEditor}
                                        title="Edit approved hours for the latest submission"
                                        aria-label="Edit approved hours for the latest submission"
                                    >
                                        <Pencil size={13} />
                                    </button>
                                {/if}
                            </div>
                        {:else}
                            <div class="flex items-center gap-1.5 text-[13px] text-rv-dim" title="No hours approved yet">
                                <Hourglass size={15} class="shrink-0" />
                                Pending {formatHours(latestSubmission?.hackatimeHours)} hours
                            </div>
                        {/if}

                        <button
                            class="{pillBtn} border-rv-border text-rv-text hover:border-rv-accent"
                            onclick={recalculate}
                            disabled={recalculating}
                        >
                            {recalculating ? '⟳ Recalculating…' : 'Recalculate Hackatime Hours'}
                        </button>
                    {/if}
                </div>

                <!-- User card -->
                <div class="border border-rv-border rounded-lg p-3 flex flex-col gap-2">
                    <span class={sectionTitle}>User</span>
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-[14px] font-semibold">By {fullName(project.user)}</span>
                        <a
                            href="{base}/users?q={encodeURIComponent(project.user.email)}"
                            class="inline-flex items-center gap-0.5 text-[10px] text-rv-blue underline"
                        >
                            view user <ExternalLink size={9} />
                        </a>
                        {#if project.user.isFraud}
                            <span class="py-0.5 px-2 rounded-xl text-[10px] font-semibold bg-rv-red-bg text-rv-red">Fraud</span>
                        {/if}
                    </div>

                    <div class="flex flex-col gap-1">
                        <span class="text-[9px] text-rv-dim">Click to copy</span>
                        <button
                            class="group flex items-center gap-2 text-left bg-transparent border-none p-0 cursor-pointer min-w-0 self-start"
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
                                    <a href={slackDmUrl} target="_blank" rel="noreferrer" class="inline-flex items-center gap-0.5 text-[10px] text-rv-blue no-underline hover:underline shrink-0">
                                        Slack <ExternalLink size={9} />
                                    </a>
                                {/if}
                            </div>
                        {/if}
                        {#if project.user.hackatimeAccount}
                            <div class="flex items-center justify-between gap-2">
                                <button
                                    class="group flex items-center gap-2 text-left bg-transparent border-none p-0 cursor-pointer min-w-0"
                                    onclick={() => copyText('hackatime', project?.user.hackatimeAccount)}
                                    title="Click to copy Hackatime account"
                                >
                                    <span class="text-[12px] text-rv-text font-mono truncate">hackatime: {project.user.hackatimeAccount}</span>
                                    <span class="text-[10px] {copiedKey === 'hackatime' ? 'text-rv-green' : 'text-rv-dim opacity-0 group-hover:opacity-100'} shrink-0 transition-opacity">
                                        {copiedKey === 'hackatime' ? 'Copied' : 'Copy'}
                                    </span>
                                </button>
                                {#if joeUrl}
                                    <a href={joeUrl} target="_blank" rel="noreferrer" class="inline-flex items-center gap-0.5 text-[10px] text-fuchsia-500 underline shrink-0">
                                        open in joe <ExternalLink size={9} />
                                    </a>
                                {/if}
                            </div>
                        {:else}
                            <span class="text-[12px] text-rv-dim">No Hackatime account linked</span>
                        {/if}
                    </div>

                    {#if project.user.hackatimeStartDate}
                        <p class="m-0 text-[11px] text-rv-accent bg-rv-tag-bg border border-rv-accent/40 rounded-md px-2.5 py-1.5">
                            ⚠ Custom Hackatime start date: {toDateInputValue(project.user.hackatimeStartDate)}
                        </p>
                    {/if}

                    <hr class="border-none border-t border-rv-divider m-0 w-full" />

                    <div>
                        <button
                            class="bg-transparent border-none p-0 text-[12px] text-rv-text cursor-pointer hover:text-rv-blue"
                            onclick={() => (addressExpanded = !addressExpanded)}
                        >
                            {addressExpanded ? '▾' : '▸'} View Birthday/Address
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

                    <hr class="border-none border-t border-rv-divider m-0 w-full" />

                    <button
                        class="{pillBtn} {project.user.isSus
                            ? 'border-yellow-500/60 text-yellow-600 dark:text-yellow-400 bg-yellow-500/10'
                            : 'border-rv-red/60 text-rv-red hover:bg-rv-red-bg'}"
                        onclick={toggleSusFlag}
                    >
                        {project.user.isSus ? '⚠ Sus flagged — click to clear' : 'Mark as sus'}
                    </button>
                </div>

                <!-- Project details (description + URLs edit here) -->
                <div class="border border-rv-border rounded-lg p-3 flex flex-col gap-2 {editableRegion}">
                    <div class="flex items-center gap-1.5">
                        <span class={sectionTitle}>Project Details</span>
                        {@render editPencil('details', 'Edit description & links')}
                    </div>
                    {#if editing === 'details'}
                        <div class="flex flex-col gap-2.5">
                            <div>
                                <label class={label} for="ed-desc">Description</label>
                                <textarea id="ed-desc" use:autogrow class="{input} resize-none overflow-hidden min-h-[70px]" bind:value={description} maxlength={500}></textarea>
                            </div>
                            <div>
                                <label class={label} for="ed-playable">Playable / demo URL</label>
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
                            {@render saveCancel()}
                        </div>
                    {:else}
                        <div class="flex flex-col gap-1.5 text-[12px]">
                            {#each [
                                { name: 'Demo', value: project.playableUrl },
                                { name: 'Repo', value: project.repoUrl },
                                { name: 'README', value: project.readmeUrl },
                                { name: 'Journal', value: project.journalUrl },
                                { name: 'Screenshot', value: project.screenshotUrl },
                            ] as row (row.name)}
                                <div class="flex items-baseline gap-2 min-w-0">
                                    <span class="text-rv-dim w-20 shrink-0">{row.name}</span>
                                    {#if normalizeUrl(row.value)}
                                        <a href={normalizeUrl(row.value)} target="_blank" rel="noreferrer" class="font-mono text-rv-blue no-underline hover:underline truncate">{row.value}</a>
                                    {:else}
                                        <span class="text-rv-dim">—</span>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>

                <!-- Linked Hackatime projects -->
                <div class="border border-rv-border rounded-lg p-3 flex flex-col gap-2 {editableRegion}">
                    <div class="flex items-center gap-1.5">
                        <span class={sectionTitle}>Linked Hackatime Projects</span>
                        {@render editPencil('hackatime', 'Edit linked Hackatime projects')}
                    </div>
                    {#if editing === 'hackatime'}
                        <div class="flex flex-col gap-2">
                            <div class="flex items-center justify-between gap-2">
                                {#if hackatimeOwnerAccount}
                                    <p class="m-0 text-[11px] text-rv-dim truncate">
                                        {hackatimeOwnerAccount}{hackatimeOwnerStartDate ? ` · from ${toDateInputValue(hackatimeOwnerStartDate)}` : ''}
                                    </p>
                                {:else}
                                    <p class="m-0 text-[11px] text-rv-dim">Owner has no Hackatime account linked.</p>
                                {/if}
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

                            {@render saveCancel()}
                        </div>
                    {:else if (project.nowHackatimeProjects ?? []).length > 0}
                        <div class="flex flex-wrap gap-1.5">
                            {#each project.nowHackatimeProjects ?? [] as name}
                                <span class="py-1 px-2.5 rounded-xl text-[11px] bg-rv-surface2 border border-rv-border text-rv-text font-mono">{name}</span>
                            {/each}
                        </div>
                    {:else}
                        <p class="m-0 text-[12px] text-rv-dim">None linked.</p>
                    {/if}
                </div>

                <!-- Notes cards (user = amber, project = purple, per the design) -->
                <NoteCard
                    title="User Notes"
                    targetType="user"
                    targetId={project.user.userId}
                    bind:content={userNote}
                    loading={notesLoading}
                    cardClass="border-orange-500/40 bg-orange-500/8"
                    labelClass="text-orange-600 dark:text-orange-400"
                />
                <NoteCard
                    title="Project Notes"
                    targetType="project"
                    targetId={project.projectId}
                    bind:content={projectNote}
                    loading={notesLoading}
                    cardClass="border-purple-500/40 bg-purple-500/8"
                    labelClass="text-purple-600 dark:text-purple-400"
                />

                <!-- Perm-reject note (project.adminComment — written by the review
                     dash's perm-reject flow as the internal reason; hidden unless
                     it has content or the project is perm-rejected) -->
                {#if project.adminComment || project.permReject}
                    <div class="border border-rv-border border-l-2 border-l-orange-500 rounded-lg p-3 {editableRegion}">
                        <div class="flex items-baseline gap-2">
                            <h3 class="{sectionTitle} m-0 text-orange-500">Perm-Reject Note</h3>
                            <span class="text-[10px] text-rv-dim">internal reason · never shown to the user</span>
                            {@render editPencil('comment', 'Edit perm-reject note')}
                        </div>
                        <hr class="border-none border-t border-rv-divider m-0 my-2 w-full" />
                        {#if editing === 'comment'}
                            <div class="flex flex-col gap-2">
                                <textarea use:autogrow class="{input} resize-none overflow-hidden min-h-[60px]" bind:value={adminCommentEdit} maxlength={1000}></textarea>
                                {@render saveCancel()}
                            </div>
                        {:else if project.adminComment}
                            <p class="m-0 text-[12px] text-rv-text/90 leading-relaxed break-words whitespace-pre-wrap">{project.adminComment}</p>
                        {:else}
                            <p class="m-0 text-[12px] text-rv-dim italic">None</p>
                        {/if}
                    </div>
                {/if}

                <!-- Danger zone (collapsed by default) -->
                <div class="border-t border-rv-border pt-3 flex flex-col gap-2">
                    <button
                        class="bg-transparent border-none p-0 self-start flex items-center gap-1 text-[11px] uppercase tracking-wider font-semibold text-rv-red cursor-pointer hover:opacity-80"
                        onclick={() => (dangerOpen = !dangerOpen)}
                    >
                        {dangerOpen ? '▾' : '▸'} Danger zone
                    </button>
                    {#if dangerOpen}
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
                    {/if}
                </div>
            </div>

            <!-- ═══ MAIN AREA: submission-specific only ═══ -->
            <div class="flex flex-col overflow-hidden min-w-0">
                <!-- Submission timeline strip (newest → oldest) -->
                <div class="flex items-center px-4 py-2.5 bg-rv-surface border-b border-rv-border overflow-x-auto shrink-0">
                    {#if submissionsLoading}
                        <div class="flex items-center gap-3">
                            <Skeleton class="h-12 w-44 rounded-lg" />
                            <Skeleton class="h-12 w-44 rounded-lg" />
                        </div>
                    {:else if submissions.length === 0}
                        <span class="text-[12px] text-rv-dim py-2">No submissions yet — this project is still a draft.</span>
                    {:else}
                        {#each submissions as s, i (s.submissionId)}
                            {@const st = submissionStatusText(s, i)}
                            {@const isActive = s.submissionId === selectedSubmission?.submissionId}
                            {#if i > 0}
                                <span class="text-[11px] text-rv-dim px-2 shrink-0 whitespace-nowrap">
                                    {daysBetweenLabel(submissions[i - 1].createdAt, s.createdAt)}
                                </span>
                            {/if}
                            <button
                                class="flex flex-col items-start gap-0.5 px-2.5 py-1.5 rounded-lg border text-left shrink-0 cursor-pointer transition-all duration-150 {isActive
                                    ? 'bg-rv-surface2 border-rv-accent'
                                    : 'bg-rv-surface border-rv-border hover:border-rv-accent'}"
                                onclick={() => selectSubmission(s.submissionId)}
                            >
                                <span class="flex items-baseline gap-1.5 whitespace-nowrap">
                                    <span class="text-[12px] font-semibold text-rv-text">Submission #{submissions.length - i}</span>
                                    <span class="text-[9px] text-rv-dim">{formatDateShort(s.createdAt)}</span>
                                </span>
                                <span class="text-[11px] font-medium {st.cls} whitespace-nowrap">{st.text}</span>
                            </button>
                        {/each}
                    {/if}
                </div>

                <div class="flex-1 overflow-y-auto">
                    <div class="max-w-[860px] mx-auto p-5 flex flex-col gap-5">
                        {#if !selectedSubmission}
                            <p class="m-0 text-[13px] text-rv-dim">No submissions yet — this project is still a draft.</p>
                        {:else}
                            {@const sub = selectedSubmission}
                            {@const selectedIndex = submissions.indexOf(sub)}
                            {@const previousSubmission = selectedIndex < submissions.length - 1 ? submissions[selectedIndex + 1] : null}
                            {@const deltaHours = sub.approvedHours != null && previousSubmission?.approvedHours != null
                                ? sub.approvedHours - previousSubmission.approvedHours
                                : null}
                            <!-- Selected submission snapshot -->
                            <div id="submission-detail" class="scroll-mt-4 bg-rv-surface border border-rv-border rounded-lg p-4 flex flex-col gap-4 {editableRegion}">
                                <div class="flex items-center gap-2.5">
                                    <h2 class="text-[15px] font-semibold m-0">
                                        Submission #{submissions.length - selectedIndex}{selectedIndex === 0 ? ' (latest)' : ''}
                                    </h2>
                                    {#if isSuperadmin && editing !== 'snapshot'}
                                        <button
                                            class={pencilBtn}
                                            onclick={openSnapshotEditor}
                                            title="Edit submission data"
                                            aria-label="Edit submission data"
                                        >
                                            <Pencil size={13} />
                                        </button>
                                    {/if}
                                </div>
                                <p class="m-0 text-[12px] text-rv-dim">
                                    Submitted {formatDate(sub.createdAt)} ({timeAgo(sub.createdAt)})
                                </p>

                                {#if editing === 'snapshot'}
                                <div class="flex flex-col gap-2.5">
                                    <div>
                                        <label class={label} for="sn-desc">Description (at submission)</label>
                                        <textarea id="sn-desc" use:autogrow class="{input} resize-none overflow-hidden min-h-[70px]" bind:value={snapDescription} maxlength={500}></textarea>
                                    </div>
                                    <div class="grid grid-cols-2 gap-3">
                                        <div>
                                            <label class={label} for="sn-demo">Demo URL (at submit)</label>
                                            <input id="sn-demo" class={input} bind:value={snapPlayable} />
                                        </div>
                                        <div>
                                            <label class={label} for="sn-repo">Repo URL (at submit)</label>
                                            <input id="sn-repo" class={input} bind:value={snapRepo} />
                                        </div>
                                        <div>
                                            <label class={label} for="sn-shot">Screenshot URL</label>
                                            <input id="sn-shot" class={input} bind:value={snapScreenshot} />
                                        </div>
                                        <div>
                                            <label class={label} for="sn-hours">Hackatime hours at submit</label>
                                            <input id="sn-hours" class={input} type="number" min="0" step="0.1" bind:value={snapHoursText} />
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-1.5">
                                        <button class={saveBtnSm} onclick={saveSnapshot} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                                        <button class={cancelBtnSm} onclick={cancelEditing} disabled={saving}>Cancel</button>
                                        {#if saveError}<span class="text-[11px] text-rv-red truncate">{saveError}</span>{/if}
                                    </div>
                                </div>
                                {:else}
                                <div class="grid grid-cols-3 gap-3">
                                    <div class="bg-rv-bg border border-rv-border rounded-lg p-3">
                                        <p class="m-0 text-[10px] uppercase tracking-wide text-rv-dim font-semibold">Hackatime at submit</p>
                                        <p class="m-0 mt-1 text-[16px] font-semibold">{formatHours(sub.hackatimeHours)}h</p>
                                    </div>
                                    <div class="bg-rv-bg border border-rv-border rounded-lg p-3">
                                        <p class="m-0 text-[10px] uppercase tracking-wide text-rv-dim font-semibold">Approved</p>
                                        <p class="m-0 mt-1 text-[16px] font-semibold {sub.approvedHours != null ? 'text-rv-green' : ''}">{formatHours(sub.approvedHours)}h</p>
                                    </div>
                                    <div class="bg-rv-bg border border-rv-border rounded-lg p-3">
                                        <p class="m-0 text-[10px] uppercase tracking-wide text-rv-dim font-semibold">Δ vs prior approval</p>
                                        <p class="m-0 mt-1 text-[16px] font-semibold {deltaHours != null && deltaHours > 0 ? 'text-rv-blue' : ''}">{deltaHours != null ? formatDelta(deltaHours) : '—'}</p>
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

                                <div class="flex flex-col gap-1.5 text-[12px]">
                                    <div class="flex items-baseline gap-2 min-w-0">
                                        <span class="text-rv-dim w-28 shrink-0">Demo at submit</span>
                                        {#if normalizeUrl(sub.playableUrl)}
                                            <a href={normalizeUrl(sub.playableUrl)} target="_blank" rel="noreferrer" class="font-mono text-rv-blue no-underline hover:underline truncate">{sub.playableUrl}</a>
                                        {:else}
                                            <span class="text-rv-dim">—</span>
                                        {/if}
                                    </div>
                                    <div class="flex items-baseline gap-2 min-w-0">
                                        <span class="text-rv-dim w-28 shrink-0">Repo at submit</span>
                                        {#if sub.repoUrl}
                                            <a href={sub.repoUrl} target="_blank" rel="noreferrer" class="font-mono text-rv-blue no-underline hover:underline truncate">{sub.repoUrl}</a>
                                        {:else}
                                            <span class="text-rv-dim">—</span>
                                        {/if}
                                    </div>
                                </div>
                                {/if}
                            </div>

                            <!-- Verdict (saves via the reviewer endpoint; hours
                                 justification is project-level and saves via the
                                 admin PATCH alongside it) -->
                            <div class="bg-rv-surface border border-rv-border rounded-lg p-4 {editableRegion}">
                                <div class="flex items-center gap-2 mb-2">
                                    <h3 class="{sectionTitle} m-0">Verdict</h3>
                                    <span class="py-0.5 px-2 rounded-xl text-[10px] font-semibold {statusPillClass(sub.approvalStatus)}">
                                        {statusLabel(sub.approvalStatus)}
                                    </span>
                                    {#if isAdminOrAbove && editing !== 'verdict'}
                                        <button
                                            class={pencilBtn}
                                            onclick={openVerdictEditor}
                                            title="Edit verdict, reviewer feedback & hours justification"
                                            aria-label="Edit verdict, reviewer feedback & hours justification"
                                        >
                                            <Pencil size={13} />
                                        </button>
                                    {/if}
                                </div>
                                {#if editing === 'verdict'}
                                    <div class="flex flex-col gap-2.5">
                                        <div class="grid grid-cols-2 gap-3">
                                            <div>
                                                <label class={label} for="vd-status">Verdict</label>
                                                <select id="vd-status" class={input} bind:value={verdictStatus}>
                                                    <option value="pending">Pending</option>
                                                    <option value="approved">Approved</option>
                                                    <option value="rejected">Rejected</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label class={label} for="vd-hours">Approved Hours</label>
                                                <input id="vd-hours" class={input} type="number" min="0" step="0.1" bind:value={verdictHoursText} placeholder="Blank to keep current" />
                                            </div>
                                        </div>
                                        <div>
                                            <label class={label} for="vd-feedback">Reviewer feedback (shown to user)</label>
                                            <textarea id="vd-feedback" use:autogrow class="{input} resize-none overflow-hidden min-h-[60px]" bind:value={verdictFeedback} maxlength={5000}></textarea>
                                        </div>
                                        {#if isSuperadmin}
                                            <div>
                                                <label class={label} for="vd-justify">Hours justification <span class="normal-case tracking-normal font-normal">— internal · synced to Airtable</span></label>
                                                <textarea id="vd-justify" use:autogrow class="{input} resize-none overflow-hidden min-h-[60px]" bind:value={hoursJustificationEdit}></textarea>
                                            </div>
                                        {/if}
                                        {#if verdictStatus === 'rejected'}
                                            <div class="rounded-md border {verdictPermReject ? 'border-rv-red/60 bg-rv-red-bg' : 'border-rv-border'} p-3">
                                                <label class="flex items-start gap-2 cursor-pointer">
                                                    <input type="checkbox" class="accent-red-500 mt-0.5" bind:checked={verdictPermReject} />
                                                    <span class="text-[12px]">
                                                        <span class="font-semibold text-rv-red">Permanently reject project</span>
                                                        <span class="block text-[11px] text-rv-dim mt-0.5">
                                                            User cannot resubmit or edit. The reviewer feedback above is shown to the user as the reason.
                                                        </span>
                                                    </span>
                                                </label>
                                            </div>
                                        {/if}
                                        <label class="flex items-center gap-2 cursor-pointer text-[12px]">
                                            <input type="checkbox" class="accent-rv-accent" bind:checked={verdictSendEmail} />
                                            Email the user about this verdict
                                        </label>
                                        <p class="m-0 text-[10px] text-rv-dim">
                                            Flipping an already-finalized verdict (approved ↔ rejected) is superadmin-only.
                                        </p>
                                        <div class="flex items-center gap-1.5">
                                            <button class={saveBtnSm} onclick={saveVerdict} disabled={saving}>{saving ? 'Saving…' : 'Save verdict'}</button>
                                            <button class={cancelBtnSm} onclick={cancelEditing} disabled={saving}>Cancel</button>
                                            {#if saveError}<span class="text-[11px] text-rv-red truncate">{saveError}</span>{/if}
                                        </div>
                                    </div>
                                {:else}
                                    <div class="flex flex-col gap-2.5">
                                        <div>
                                            <span class={subLabel}>Approved hours</span>
                                            <p class="m-0 text-[13px] font-semibold {sub.approvedHours != null ? 'text-rv-green' : 'text-rv-dim'}">
                                                {formatHours(sub.approvedHours)}h
                                            </p>
                                        </div>
                                        <div>
                                            <span class={subLabel}>Reviewer feedback (shown to user)</span>
                                            {#if sub.hoursJustification}
                                                <p class="m-0 text-[12px] text-rv-text/90 leading-relaxed break-words whitespace-pre-wrap">{sub.hoursJustification}</p>
                                            {:else}
                                                <p class="m-0 text-[12px] text-rv-dim italic">None</p>
                                            {/if}
                                        </div>
                                        <div>
                                            <span class={subLabel}>Hours justification · internal · synced to Airtable</span>
                                            {#if project.hoursJustification}
                                                <p class="m-0 text-[12px] text-rv-text/90 leading-relaxed break-words whitespace-pre-wrap">{project.hoursJustification}</p>
                                            {:else}
                                                <p class="m-0 text-[12px] text-rv-dim italic">None</p>
                                            {/if}
                                        </div>
                                        <div>
                                            <span class={subLabel}>Airtable sync</span>
                                            {#if sub.airtableRecId}
                                                {@const recordUrl = airtableRecordUrl(sub)}
                                                <div class="flex items-center gap-2 min-w-0">
                                                    <span class="py-0.5 px-2 rounded-xl text-[10px] font-semibold bg-rv-green-bg text-rv-green shrink-0">Synced</span>
                                                    <span class="text-[11px] font-mono text-rv-dim truncate">{sub.airtableRecId}</span>
                                                    {#if recordUrl}
                                                        <a href={recordUrl} target="_blank" rel="noreferrer" class="inline-flex items-center gap-0.5 text-[11px] text-rv-blue no-underline hover:underline shrink-0">
                                                            Open in Airtable <ExternalLink size={10} />
                                                        </a>
                                                    {/if}
                                                </div>
                                            {:else}
                                                <span class="inline-block py-0.5 px-2 rounded-xl text-[10px] font-semibold bg-rv-surface2 text-rv-dim">Not synced</span>
                                            {/if}
                                        </div>
                                    </div>
                                {/if}
                            </div>

                            <!-- Joe fraud review (runs per submission) -->
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
                        {/if}
                    </div>
                </div>
            </div>

            <!-- ═══ RIGHT BAR: activity timeline (hover slides out, pin keeps it open) ═══ -->
            <div
                class="bg-rv-surface border-l border-rv-border flex flex-col overflow-hidden transition-[width] duration-200 {timelineExpanded ? 'w-[320px]' : 'w-10'}"
                role="complementary"
                aria-label="Activity timeline"
                onmouseenter={timelineMouseEnter}
                onmouseleave={timelineMouseLeave}
            >
                {#if timelineExpanded}
                <div class="w-[320px] shrink-0 flex-1 flex flex-col overflow-hidden">
                    <div class="flex items-center justify-between px-4 py-2.5 border-b border-rv-border shrink-0">
                        <h3 class="{sectionTitle} m-0">Timeline</h3>
                        <div class="flex items-center gap-1.5">
                            {#if !timelineOpen}
                                <button class={btnSm} onclick={() => (timelineOpen = true)}>Pin open</button>
                            {/if}
                            <button
                                class="bg-transparent border border-rv-border text-rv-dim w-6 h-6 rounded cursor-pointer flex items-center justify-center hover:text-rv-text hover:border-rv-accent"
                                onclick={() => {
                                    timelineOpen = false;
                                    timelineHover = false;
                                }}
                                title="Collapse timeline"
                                aria-label="Collapse timeline"
                            >
                                <ChevronsRight size={13} />
                            </button>
                        </div>
                    </div>
                    <div class="flex-1 overflow-y-auto p-4">
                        {#if timelineLoading}
                            <div class="flex flex-col gap-3">
                                <Skeleton class="h-10 w-full" />
                                <Skeleton class="h-10 w-full" />
                                <Skeleton class="h-10 w-full" />
                                <Skeleton class="h-10 w-full" />
                            </div>
                        {:else if timeline}
                            {#if timeline.timeline.length === 0}
                                <p class="m-0 text-[12px] text-rv-dim">No activity yet.</p>
                            {:else}
                                <div class="relative">
                                    <div class="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-rv-border"></div>
                                    <div class="flex flex-col gap-4">
                                        {#each timeline.timeline as event, i}
                                            {@const entries = detailEntries(event.details)}
                                            {#if i === 0 || !sameDay(event.timestamp, timeline.timeline[i - 1].timestamp)}
                                                <div class="relative pl-5 {i === 0 ? '' : 'mt-1'} -mb-2">
                                                    <span class="text-[10px] uppercase tracking-wider text-rv-dim font-semibold">
                                                        {formatDateShort(event.timestamp)}
                                                    </span>
                                                </div>
                                            {/if}
                                            <div class="relative pl-5">
                                                <span class="absolute left-0 top-1 w-[11px] h-[11px] rounded-full {timelineDotColor(event.type)} ring-2 ring-rv-surface"></span>
                                                <div class="flex items-baseline justify-between gap-2">
                                                    <span class="text-[12px] font-semibold text-rv-text">{timelineEventLabel(event.type)}</span>
                                                    <span class="text-[10px] text-rv-dim whitespace-nowrap" title={formatDate(event.timestamp)}>
                                                        {timeAgo(event.timestamp)}
                                                    </span>
                                                </div>
                                                {#if event.actor}
                                                    <p class="m-0 text-[11px] text-rv-dim" title={event.actor.email}>
                                                        by {fullName(event.actor)}
                                                    </p>
                                                {/if}
                                                {#if entries.length > 0}
                                                    <div class="mt-1.5 rounded-md bg-rv-bg border border-rv-border px-2.5 py-1.5 flex flex-col gap-1">
                                                        {#each entries as entry}
                                                            <div class="flex items-baseline gap-1.5 text-[10px] leading-snug">
                                                                <span class="text-rv-dim capitalize shrink-0">{entry.key}</span>
                                                                <span class="text-rv-text break-all font-mono">{entry.value}</span>
                                                            </div>
                                                        {/each}
                                                    </div>
                                                {/if}
                                            </div>
                                        {/each}
                                    </div>
                                </div>
                            {/if}
                        {:else}
                            <p class="m-0 text-[12px] text-rv-dim">Couldn't load the timeline.</p>
                        {/if}
                    </div>
                </div>
                {:else}
                    <div class="flex flex-col items-center gap-2 pt-2.5 px-1.5">
                        <button
                            class="bg-transparent border border-rv-border text-rv-dim w-7 h-7 rounded-md cursor-pointer flex items-center justify-center hover:text-rv-text hover:border-rv-accent"
                            onclick={() => {
                                timelineOpen = true;
                                void loadTimeline();
                            }}
                            title="Show timeline"
                            aria-label="Show timeline"
                        >
                            <History size={14} />
                        </button>
                        <span class="text-[10px] uppercase tracking-wider text-rv-dim font-semibold [writing-mode:vertical-rl]">Timeline</span>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
</div>
