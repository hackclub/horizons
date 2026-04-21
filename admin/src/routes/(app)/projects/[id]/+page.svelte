<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { base } from '$app/paths';
    import { goto } from '$app/navigation';
    import { api, type components } from '$lib/api';
    import { Button, TextField, Card, Checkbox } from '$lib/components';

    type AdminProject = components['schemas']['AdminProjectResponse'];
    type UpdateAdminProjectDto = components['schemas']['UpdateAdminProjectDto'];
    type HackatimeListResponse =
        components['schemas']['ProjectOwnerHackatimeProjectsResponse'];
    type HackatimeProjectRow = HackatimeListResponse['projects'][number];
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

    let projectId = $derived(parseInt($page.params.id ?? '', 10));

    let me = $state<{ role: string } | null>(null);
    let isSuperadmin = $derived(me?.role === 'superadmin');

    let project = $state<AdminProject | null>(null);
    let loading = $state(true);
    let loadError = $state('');
    let saving = $state(false);
    let saveError = $state('');
    let saveSuccess = $state('');

    // Editable form state
    let projectTitle = $state('');
    let projectType = $state<ProjectType>('web_playable');
    let description = $state('');
    let playableUrl = $state('');
    let repoUrl = $state('');
    let readmeUrl = $state('');
    let journalUrl = $state('');
    let screenshotUrl = $state('');
    let adminComment = $state('');
    let hoursJustification = $state('');
    let approvedHoursText = $state('');
    let isLocked = $state(false);
    let linkedProjects = $state<string[]>([]);

    // Hackatime attach UI
    let hackatimeLoading = $state(false);
    let hackatimeError = $state('');
    let hackatimeProjects = $state<HackatimeProjectRow[]>([]);
    let hackatimeOwnerAccount = $state<string | null>(null);
    let hackatimeOwnerStartDate = $state<string | null>(null);
    let manualHackatimeInput = $state('');

    function toDateInputValue(value: string | Date | null | undefined): string {
        if (!value) return '';
        const d = typeof value === 'string' ? new Date(value) : value;
        if (isNaN(d.getTime())) return '';
        return d.toISOString().split('T')[0];
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
        adminComment = p.adminComment ?? '';
        hoursJustification = p.hoursJustification ?? '';
        approvedHoursText =
            p.approvedHours === null || p.approvedHours === undefined
                ? ''
                : String(p.approvedHours);
        isLocked = p.isLocked ?? false;
        linkedProjects = [...(p.nowHackatimeProjects ?? [])];
    }

    function errorMessage(error: unknown, fallback: string): string {
        if (error && typeof error === 'object' && 'message' in error) {
            const msg = (error as { message?: unknown }).message;
            if (typeof msg === 'string') return msg;
        }
        return fallback;
    }

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

    async function loadHackatime() {
        hackatimeLoading = true;
        hackatimeError = '';
        try {
            const { data, error } = await api.GET(
                '/api/admin/projects/{id}/hackatime-projects',
                { params: { path: { id: projectId } } },
            );
            if (error) {
                hackatimeError = errorMessage(
                    error,
                    'Failed to load Hackatime projects',
                );
                return;
            }
            if (!data) return;
            hackatimeProjects = data.projects ?? [];
            hackatimeOwnerAccount = data.hackatimeAccount;
            hackatimeOwnerStartDate = data.hackatimeStartDate;
        } catch (e) {
            hackatimeError =
                e instanceof Error ? e.message : 'Failed to load Hackatime projects';
        } finally {
            hackatimeLoading = false;
        }
    }

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
        if (!linkedProjects.includes(name)) {
            linkedProjects = [...linkedProjects, name];
        }
        manualHackatimeInput = '';
    }

    async function save() {
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
            adminComment: adminComment.trim() || null,
            hoursJustification: hoursJustification.trim() || null,
            nowHackatimeProjects: linkedProjects,
            isLocked,
            approvedHours,
        };

        try {
            const { data, error } = await api.PATCH(
                '/api/admin/projects/{id}',
                { params: { path: { id: projectId } }, body },
            );
            if (error) {
                saveError = errorMessage(error, 'Failed to save');
                return;
            }
            if (data) hydrateForm(data);
            saveSuccess = 'Saved';
        } catch (e) {
            saveError = e instanceof Error ? e.message : 'Failed to save';
        } finally {
            saving = false;
        }
    }

    async function recalculate() {
        saveError = '';
        saveSuccess = '';
        try {
            const { error } = await api.POST(
                '/api/admin/projects/{id}/recalculate',
                { params: { path: { id: projectId } } },
            );
            if (error) {
                saveError = errorMessage(error, 'Failed to recalculate hours');
                return;
            }
            await loadProject();
            saveSuccess = 'Hours recalculated';
        } catch (e) {
            saveError =
                e instanceof Error ? e.message : 'Failed to recalculate hours';
        }
    }

    onMount(async () => {
        await loadMe();
        if (!isNaN(projectId)) {
            await loadProject();
            await loadHackatime();
        }
    });
</script>

<div class="p-6">
    <div class="mx-auto max-w-4xl space-y-6">
        <div class="flex items-center justify-between gap-4">
            <div>
                <a
                    href="{base}/projects"
                    class="text-sm text-ds-link hover:underline"
                >
                    ← Back to projects
                </a>
                <h2 class="mt-2 text-2xl font-semibold">
                    Edit Project {isNaN(projectId) ? '' : `#${projectId}`}
                </h2>
            </div>
            <div class="flex gap-2">
                {#if project}
                    <Button variant="ghost" onclick={recalculate}>
                        Recalculate hours
                    </Button>
                {/if}
            </div>
        </div>

        {#if !isSuperadmin && me}
            <Card class="p-4 border border-yellow-500 bg-yellow-100 text-yellow-900">
                This page is read-only. Editing requires superadmin role.
            </Card>
        {/if}

        {#if loading}
            <div class="py-12 text-center text-ds-text-secondary">Loading...</div>
        {:else if loadError}
            <Card class="p-4 border border-red-500 bg-red-600/10 text-red-600">
                {loadError}
            </Card>
        {:else if project}
            <Card class="p-6 space-y-5">
                <div>
                    <div class="flex flex-wrap items-start justify-between gap-2">
                        <div>
                            <p class="text-sm text-ds-text-secondary">Owner</p>
                            <p class="text-base font-medium">
                                {project.user.firstName ?? ''}
                                {project.user.lastName ?? ''}
                                <span class="text-sm text-ds-text-placeholder">
                                    #{project.user.userId}
                                </span>
                            </p>
                            <p class="text-sm text-ds-text-secondary">
                                {project.user.email}
                            </p>
                        </div>
                        <div class="flex flex-wrap gap-2 text-sm text-ds-text-secondary">
                            <span class="rounded-full border border-ds-border px-3 py-1">
                                Hackatime hours: {project.nowHackatimeHours?.toFixed(1) ?? '—'}
                            </span>
                            <span class="rounded-full border border-ds-border px-3 py-1">
                                {project.isLocked ? 'Locked' : 'Unlocked'}
                            </span>
                        </div>
                    </div>
                    {#if project.user.hackatimeStartDate}
                        <div class="mt-3 rounded-md border border-yellow-600 bg-yellow-100 px-3 py-2 text-xs text-yellow-900">
                            <p class="font-semibold">
                                ⚠ Custom Hackatime start date: {toDateInputValue(
                                    project.user.hackatimeStartDate,
                                )}
                            </p>
                            <p class="mt-1">
                                Admin-curated backfill user. Hours for linked
                                Hackatime projects include activity since this
                                date (overrides the default cutoff).
                            </p>
                        </div>
                    {/if}
                </div>

                <fieldset disabled={!isSuperadmin} class="space-y-5">
                    <div class="grid gap-4 md:grid-cols-2">
                        <label class="space-y-1">
                            <span class="text-xs uppercase tracking-wide text-ds-text-secondary">
                                Project Title
                            </span>
                            <TextField bind:value={projectTitle} maxlength={30} />
                        </label>
                        <label class="space-y-1">
                            <span class="text-xs uppercase tracking-wide text-ds-text-secondary">
                                Project Type
                            </span>
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
                        <span class="text-xs uppercase tracking-wide text-ds-text-secondary">
                            Description
                        </span>
                        <TextField bind:value={description} multiline maxlength={500} />
                    </label>

                    <div class="grid gap-4 md:grid-cols-2">
                        <label class="space-y-1">
                            <span class="text-xs uppercase tracking-wide text-ds-text-secondary">
                                Playable URL
                            </span>
                            <TextField bind:value={playableUrl} />
                        </label>
                        <label class="space-y-1">
                            <span class="text-xs uppercase tracking-wide text-ds-text-secondary">
                                Repo URL
                            </span>
                            <TextField bind:value={repoUrl} />
                        </label>
                        <label class="space-y-1">
                            <span class="text-xs uppercase tracking-wide text-ds-text-secondary">
                                README URL
                            </span>
                            <TextField bind:value={readmeUrl} />
                        </label>
                        <label class="space-y-1">
                            <span class="text-xs uppercase tracking-wide text-ds-text-secondary">
                                Journal URL
                            </span>
                            <TextField bind:value={journalUrl} />
                        </label>
                        <label class="space-y-1 md:col-span-2">
                            <span class="text-xs uppercase tracking-wide text-ds-text-secondary">
                                Screenshot URL
                            </span>
                            <TextField bind:value={screenshotUrl} />
                        </label>
                    </div>

                    <div class="grid gap-4 md:grid-cols-2">
                        <label class="space-y-1">
                            <span class="text-xs uppercase tracking-wide text-ds-text-secondary">
                                Approved hours (blank to clear)
                            </span>
                            <TextField
                                type="number"
                                min="0"
                                step="0.1"
                                bind:value={approvedHoursText}
                            />
                        </label>
                        <label class="flex items-end gap-2 pb-2">
                            <Checkbox bind:checked={isLocked} />
                            <span class="text-sm text-ds-text-secondary">
                                Lock project (prevents owner edits)
                            </span>
                        </label>
                    </div>

                    <label class="space-y-1 block">
                        <span class="text-xs uppercase tracking-wide text-ds-text-secondary">
                            Hours justification
                        </span>
                        <TextField bind:value={hoursJustification} multiline />
                    </label>

                    <label class="space-y-1 block">
                        <span class="text-xs uppercase tracking-wide text-ds-text-secondary">
                            Admin comment (max 1000 chars)
                        </span>
                        <TextField
                            bind:value={adminComment}
                            multiline
                            maxlength={1000}
                        />
                    </label>

                    <div class="space-y-3 border-t border-ds-border pt-5">
                        <div class="flex items-center justify-between gap-2">
                            <div>
                                <h3 class="text-sm font-semibold uppercase tracking-wide text-ds-text-secondary">
                                    Linked Hackatime Projects
                                </h3>
                                {#if hackatimeOwnerAccount}
                                    <p class="text-xs text-ds-text-secondary">
                                        Owner Hackatime account: {hackatimeOwnerAccount}
                                        {#if hackatimeOwnerStartDate}
                                            • start date {toDateInputValue(hackatimeOwnerStartDate)}
                                        {/if}
                                    </p>
                                {:else}
                                    <p class="text-xs text-ds-text-placeholder">
                                        Owner has no Hackatime account linked.
                                    </p>
                                {/if}
                            </div>
                            <Button
                                variant="ghost"
                                onclick={loadHackatime}
                                disabled={hackatimeLoading}
                            >
                                {hackatimeLoading ? 'Loading…' : 'Refresh list'}
                            </Button>
                        </div>

                        {#if linkedProjects.length > 0}
                            <div class="flex flex-wrap gap-2">
                                {#each linkedProjects as name}
                                    <span
                                        class="inline-flex items-center gap-2 rounded-full border border-ds-border bg-ds-surface2 px-3 py-1 text-sm"
                                    >
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
                            <p class="text-sm text-ds-text-placeholder">
                                No Hackatime projects linked.
                            </p>
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
                                                <Checkbox
                                                    checked={linked}
                                                    onchange={() => toggleLinked(p.name)}
                                                />
                                                <span class="font-medium">{p.name}</span>
                                            </label>
                                            <span class="text-xs text-ds-text-secondary">
                                                {p.totalHours.toFixed(1)}h
                                            </span>
                                        </li>
                                    {/each}
                                </ul>
                            </div>
                        {/if}

                        <div class="flex gap-2">
                            <TextField
                                placeholder="Add Hackatime project name manually"
                                bind:value={manualHackatimeInput}
                            />
                            <Button
                                variant="ghost"
                                onclick={addManualHackatime}
                                disabled={!manualHackatimeInput.trim()}
                            >
                                Add
                            </Button>
                        </div>
                        <p class="text-xs text-ds-text-placeholder">
                            Manual names are useful when the admin list is
                            incomplete (e.g. for backfill users with a custom
                            start date whose Hackatime project isn't in the
                            default window).
                        </p>
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
                    <div class="flex gap-2">
                        <Button
                            variant="ghost"
                            onclick={() => goto(`${base}/projects`)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="approve"
                            onclick={save}
                            disabled={saving || !isSuperadmin}
                        >
                            {saving ? 'Saving…' : 'Save changes'}
                        </Button>
                    </div>
                </div>
            </Card>
        {/if}
    </div>
</div>
