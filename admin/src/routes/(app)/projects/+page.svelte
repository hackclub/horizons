<script lang="ts">
    import { onMount } from 'svelte';
    import { invalidateAll } from '$app/navigation';
    import { api, type components } from '$lib/api';
    import { Button, Checkbox } from '$lib/components';

    type AdminProject = components['schemas']['AdminProjectResponse'];
    type ProjectTimeline = components['schemas']['ProjectTimelineResponse'];
    type AdminLightUser = components['schemas']['AdminLightUserResponse'];

    // Projects state
    let projects = $state<AdminProject[]>([]);
    let projectsLoading = $state(false);
    let showFraudProjects = $state(true);
    let showSusProjects = $state(true);

    // Per-project action state
    let projectBusy = $state<Record<number, boolean>>({});
    let projectErrors = $state<Record<number, string>>({});
    let projectSuccess = $state<Record<number, string>>({});

    // Timeline state
    let timelineByProject = $state<Record<number, ProjectTimeline>>({});
    let timelineLoading = $state<Record<number, boolean>>({});
    let timelineOpen = $state<Record<number, boolean>>({});

    // Helpers
    function formatDate(value: string) {
        return new Date(value).toLocaleString();
    }

    function formatHours(value: number | null) {
        if (value === null || value === undefined) {
            return '—';
        }
        return value.toFixed(1);
    }

    function fullName(user: AdminLightUser) {
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
            case 'admin_review': return 'border-ds-accent bg-ds-accent/10';
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
            case 'admin_review': return 'bg-ds-accent';
            case 'admin_update': return 'bg-orange-500';
            default: return 'bg-gray-500';
        }
    }

    // API functions
    async function loadProjects() {
        projectsLoading = true;
        try {
            const { data, error } = await api.GET('/api/admin/projects');
            if (error) {
                console.error('Failed to load projects:', error);
                return;
            }
            if (data) {
                projects = data;
                projectErrors = {};
                projectSuccess = {};
            }
        } catch (err) {
            console.error('Failed to load projects:', err);
        } finally {
            projectsLoading = false;
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
                params: { path: { id: projectId } }
            });
            if (error) {
                console.error('Failed to load timeline:', error);
                return;
            }
            if (data) {
                timelineByProject = { ...timelineByProject, [projectId]: data };
                timelineOpen = { ...timelineOpen, [projectId]: true };
            }
        } catch (e) {
            console.error('Failed to load timeline', e);
        } finally {
            timelineLoading = { ...timelineLoading, [projectId]: false };
        }
    }

    async function recalculateProject(projectId: number) {
        projectBusy = { ...projectBusy, [projectId]: true };
        projectErrors = { ...projectErrors, [projectId]: '' };
        projectSuccess = { ...projectSuccess, [projectId]: '' };

        try {
            const { error } = await api.POST('/api/admin/projects/{id}/recalculate', {
                params: { path: { id: projectId } }
            });

            if (error) {
                const message = (error as any)?.message ?? 'Failed to recalculate hours';
                projectErrors = { ...projectErrors, [projectId]: message };
                return;
            }

            projectSuccess = { ...projectSuccess, [projectId]: 'Hours recalculated' };
            // Clear cached timeline so it reloads with fresh data
            const { [projectId]: _, ...restTimeline } = timelineByProject;
            timelineByProject = restTimeline;
            await loadProjects();
            invalidateAll();
        } catch (err) {
            projectErrors = {
                ...projectErrors,
                [projectId]: err instanceof Error ? err.message : 'Failed to recalculate hours'
            };
        } finally {
            projectBusy = { ...projectBusy, [projectId]: false };
        }
    }

    async function deleteProject(projectId: number) {
        const confirmDelete = typeof window !== 'undefined'
            ? window.confirm('Delete this project? This cannot be undone.')
            : true;
        if (!confirmDelete) return;

        projectBusy = { ...projectBusy, [projectId]: true };
        projectErrors = { ...projectErrors, [projectId]: '' };
        projectSuccess = { ...projectSuccess, [projectId]: '' };

        try {
            const { error } = await api.DELETE('/api/admin/projects/{id}', {
                params: { path: { id: projectId } }
            });

            if (error) {
                const message = (error as any)?.message ?? 'Failed to delete project';
                projectErrors = { ...projectErrors, [projectId]: message };
                return;
            }

            projectSuccess = { ...projectSuccess, [projectId]: 'Project removed' };
            await loadProjects();
            invalidateAll();
        } catch (err) {
            projectErrors = {
                ...projectErrors,
                [projectId]: err instanceof Error ? err.message : 'Failed to delete project'
            };
        } finally {
            projectBusy = { ...projectBusy, [projectId]: false };
        }
    }

    async function toggleFraudFlag(projectId: number, currentValue: boolean) {
        try {
            const { error } = await api.PUT('/api/admin/projects/{id}/fraud-flag', {
                params: { path: { id: projectId } },
                body: { isFraud: !currentValue }
            });

            if (error) {
                console.error('Failed to toggle fraud flag:', error);
                return;
            }

            await loadProjects();
        } catch (err) {
            console.error('Failed to toggle fraud flag:', err);
        }
    }

    async function toggleSusFlag(userId: number, currentValue: boolean) {
        try {
            const { error } = await api.PUT('/api/admin/users/{id}/sus-flag', {
                params: { path: { id: userId } },
                body: { isSus: !currentValue }
            });

            if (error) {
                console.error('Failed to toggle sus flag:', error);
                return;
            }

            await loadProjects();
        } catch (err) {
            console.error('Failed to toggle sus flag:', err);
        }
    }

    async function unlockProject(projectId: number) {
        projectBusy = { ...projectBusy, [projectId]: true };
        projectErrors = { ...projectErrors, [projectId]: '' };
        projectSuccess = { ...projectSuccess, [projectId]: '' };

        try {
            const { error } = await api.PUT('/api/admin/projects/{id}/unlock', {
                params: { path: { id: projectId } }
            });

            if (error) {
                const message = (error as any)?.message ?? 'Failed to unlock project';
                projectErrors = { ...projectErrors, [projectId]: message };
                return;
            }

            projectSuccess = { ...projectSuccess, [projectId]: 'Project unlocked' };
            await loadProjects();
        } catch (err) {
            projectErrors = {
                ...projectErrors,
                [projectId]: err instanceof Error ? err.message : 'Failed to unlock project'
            };
        } finally {
            projectBusy = { ...projectBusy, [projectId]: false };
        }
    }

    onMount(() => {
        loadProjects();
    });
</script>

<div class="p-6"><div class="mx-auto max-w-6xl space-y-6">
<section class="space-y-4">
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 class="text-2xl font-semibold">Projects</h2>
        <div class="flex flex-wrap items-center gap-4">
            <div class="flex items-center gap-3">
                <label class="flex items-center gap-2 cursor-pointer">
                    <Checkbox bind:checked={showFraudProjects} />
                    <span class="text-sm text-ds-text-secondary">Show fraud projects</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                    <Checkbox bind:checked={showSusProjects} />
                    <span class="text-sm text-ds-text-secondary">Show sus projects</span>
                </label>
            </div>
            <Button variant="ghost" onclick={async () => { await loadProjects(); }}>
                Refresh
            </Button>
        </div>
    </div>

    {#if projectsLoading}
        <div class="py-12 text-center text-ds-text-secondary">Loading projects...</div>
    {:else}
        {@const filteredProjects = projects.filter((project) => {
            if (!showFraudProjects && project.isFraud) return false;
            if (!showSusProjects && project.user.isSus) return false;
            return true;
        })}
        {#if filteredProjects.length === 0}
            <div class="py-12 text-center text-ds-text-secondary">No projects available.</div>
        {:else}
            <div class="grid gap-6">
                {#each filteredProjects as project (project.projectId)}
                    <div
                        class={`rounded-lg border bg-ds-surface backdrop-blur p-6 space-y-4 ${
                            project.user.isSus
                                ? 'border-yellow-500'
                                : project.isFraud
                                  ? 'border-red-500'
                                  : 'border-ds-border'
                        }`}
                    >
                        {#if project.isFraud}
                            <div class="bg-red-600/20 border-2 border-red-500 rounded-lg p-3 mb-4">
                                <p class="text-red-600 font-bold text-center uppercase tracking-wide">
                                    ⚠️ FRAUD FLAGGED
                                </p>
                            </div>
                        {/if}
                        {#if project.user.isSus}
                            <div class="bg-yellow-600/20 border-2 border-yellow-500 rounded-lg p-3 mb-4">
                                <p class="text-yellow-600 font-bold text-center uppercase tracking-wide">
                                    ⚠️ SUS FLAGGED
                                </p>
                            </div>
                        {/if}
                        <div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div>
                                <h3 class="text-xl font-semibold">{project.projectTitle}</h3>
                                <p class="text-sm text-ds-text-secondary">
                                    Owner: {fullName(project.user)} ({project.user.email})
                                </p>
                                {#if (project.user as any).hackatimeStartDate}
                                    <div class="mt-2 rounded-md border border-yellow-600 bg-yellow-100 px-2 py-1.5 text-[12px] text-yellow-900">
                                        <span class="font-semibold">⚠ Custom Hackatime start: {new Date((project.user as any).hackatimeStartDate).toISOString().split('T')[0]}</span>
                                        <span> — hours include activity since this admin-set date, not the default cutoff.</span>
                                    </div>
                                {/if}
                            </div>
                            <div class="flex flex-wrap gap-2 text-sm text-ds-text-secondary">
                                <span class="rounded-full border border-ds-border px-3 py-1">Type: {project.projectType}</span>
                                <span class="rounded-full border border-ds-border px-3 py-1">Hackatime: {formatHours(project.nowHackatimeHours)}</span>
                                <span class="rounded-full border border-ds-border px-3 py-1">{project.isLocked ? 'Locked' : 'Unlocked'}</span>
                            </div>
                        </div>

                        {#if project.description}
                            <p class="text-sm text-ds-text-secondary leading-relaxed">{project.description}</p>
                        {/if}

                        <div class="grid gap-4 md:grid-cols-3">
                            <div class="space-y-2">
                                <h4 class="text-sm font-semibold uppercase tracking-wide text-ds-text-secondary">Hackatime projects</h4>
                                {#if project.nowHackatimeProjects?.length}
                                    <ul class="text-sm text-ds-text-secondary list-disc list-inside space-y-1">
                                        {#each project.nowHackatimeProjects as name}
                                            <li>{name}</li>
                                        {/each}
                                    </ul>
                                {:else}
                                    <p class="text-sm text-ds-text-placeholder">No projects linked.</p>
                                {/if}
                            </div>
                            <div class="space-y-2">
                                <h4 class="text-sm font-semibold uppercase tracking-wide text-ds-text-secondary">Latest submission</h4>
                                {#if project.submissions.length > 0}
                                    <p class="text-sm text-ds-text-secondary">
                                        {project.submissions[0].approvalStatus} • {formatDate(project.submissions[0].createdAt)}
                                    </p>
                                    <p class="text-sm text-ds-text-secondary">
                                        Approved hours: {formatHours(project.submissions[0].approvedHours)}
                                    </p>
                                {:else}
                                    <p class="text-sm text-ds-text-placeholder">No submissions yet.</p>
                                {/if}
                            </div>
                            <div class="space-y-2">
                                <h4 class="text-sm font-semibold uppercase tracking-wide text-ds-text-secondary">Links</h4>
                                {#if project.playableUrl}
                                    {@const normalizedPlayableUrl = normalizeUrl(project.playableUrl)}
                                    {#if normalizedPlayableUrl}
                                        <a
                                            class="text-ds-link hover:underline text-sm break-words"
                                            href={normalizedPlayableUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                        >Playable</a>
                                    {/if}
                                {/if}
                                {#if project.repoUrl}
                                    <a
                                        class="text-ds-link hover:underline text-sm break-words"
                                        href={project.repoUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                    >Repository</a>
                                {/if}
                                {#if project.screenshotUrl}
                                    <a
                                        class="text-ds-link hover:underline text-sm break-words"
                                        href={project.screenshotUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                    >Screenshot</a>
                                {/if}
                            </div>
                        </div>

                        <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div class="flex flex-wrap gap-3">
                                <Button variant="approve" onclick={() => recalculateProject(project.projectId)} disabled={projectBusy[project.projectId]}>
                                    {projectBusy[project.projectId] ? 'Processing...' : 'Recalculate hours'}
                                </Button>
                                <Button
                                    variant="ghost"
                                    class={project.user.isSus
                                        ? 'bg-yellow-600/20 border-yellow-500 text-yellow-600 hover:bg-yellow-600/30'
                                        : ''}
                                    onclick={() => toggleSusFlag(project.user.userId, project.user.isSus)}
                                >
                                    {project.user.isSus ? '⚠️ Sus Flagged' : 'Flag as Sus'}
                                </Button>
                                <Button
                                    variant="ghost"
                                    class={project.isFraud
                                        ? 'bg-red-600/20 border-red-500 text-red-600 hover:bg-red-600/30'
                                        : ''}
                                    onclick={() => toggleFraudFlag(project.projectId, project.isFraud)}
                                >
                                    {project.isFraud ? '🚫 Fraud Flagged' : 'Flag as Fraud'}
                                </Button>
                                <Button variant="ghost" onclick={() => loadTimeline(project.projectId)} disabled={timelineLoading[project.projectId]}>
                                    {#if timelineLoading[project.projectId]}
                                        Loading...
                                    {:else}
                                        <span>{timelineOpen[project.projectId] ? '▼' : '▶'}</span> Timeline
                                    {/if}
                                </Button>
                                {#if project.isLocked}
                                    <Button variant="ghost" onclick={() => unlockProject(project.projectId)} disabled={projectBusy[project.projectId]}>
                                        Unlock project
                                    </Button>
                                {/if}
                                <Button variant="reject" onclick={() => deleteProject(project.projectId)} disabled={projectBusy[project.projectId]}>
                                    Delete project
                                </Button>
                            </div>
                            <div class="text-sm">
                                {#if projectErrors[project.projectId]}
                                    <span class="text-red-600">{projectErrors[project.projectId]}</span>
                                {:else if projectSuccess[project.projectId]}
                                    <span class="text-green-700">{projectSuccess[project.projectId]}</span>
                                {/if}
                            </div>
                        </div>

                        {#if timelineOpen[project.projectId] && timelineByProject[project.projectId]}
                            {@const timeline = timelineByProject[project.projectId].timeline}
                            <div class="mt-4 border-t border-ds-border pt-4">
                                <h4 class="text-sm font-semibold uppercase tracking-wide text-ds-text-secondary mb-3">Project Timeline</h4>
                                {#if timeline.length === 0}
                                    <p class="text-sm text-ds-text-placeholder">No timeline events.</p>
                                {:else}
                                    <div class="relative pl-6 space-y-4">
                                        <div class="absolute left-[4px] top-2 bottom-2 w-0.5 bg-ds-surface-inactive"></div>
                                        {#each timeline as event}
                                            <div class="relative">
                                                <div class="absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full {timelineDotColor(event.type)} ring-2 ring-gray-900"></div>
                                                <div class="ml-5">
                                                    <div class="rounded-lg border p-3 {timelineEventColor(event.type)}">
                                                        <div class="flex items-center justify-between gap-2 flex-wrap">
                                                            <span class="font-medium text-sm">{timelineEventLabel(event.type)}</span>
                                                            <span class="text-xs text-ds-text-secondary">{formatDate(event.timestamp)}</span>
                                                        </div>
                                                        {#if event.actor}
                                                            <p class="text-xs text-ds-text-secondary mt-1">
                                                                by {event.actor.firstName ?? ''} {event.actor.lastName ?? ''} ({event.actor.email})
                                                            </p>
                                                        {/if}
                                                        {#if event.details && Object.keys(event.details).length > 0}
                                                            <pre class="text-xs text-ds-text-secondary mt-2 whitespace-pre-wrap break-words">{JSON.stringify(event.details, null, 2)}</pre>
                                                        {/if}
                                                    </div>
                                                </div>
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}
    {/if}
</section>
</div></div>
