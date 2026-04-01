<script lang="ts">
    import { onMount } from 'svelte';
    import { invalidateAll } from '$app/navigation';
    import { api, type components } from '$lib/api';

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

<section class="space-y-4">
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 class="text-2xl font-semibold">Projects</h2>
        <div class="flex flex-wrap items-center gap-4">
            <div class="flex items-center gap-3">
                <label class="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        bind:checked={showFraudProjects}
                        class="w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500 focus:ring-2"
                    />
                    <span class="text-sm text-gray-300">Show fraud projects</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        bind:checked={showSusProjects}
                        class="w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500 focus:ring-2"
                    />
                    <span class="text-sm text-gray-300">Show sus projects</span>
                </label>
            </div>
            <button
                class="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 transition-colors"
                onclick={async () => { await loadProjects(); }}
            >
                Refresh
            </button>
        </div>
    </div>

    {#if projectsLoading}
        <div class="py-12 text-center text-gray-300">Loading projects...</div>
    {:else}
        {@const filteredProjects = projects.filter((project) => {
            if (!showFraudProjects && project.isFraud) return false;
            if (!showSusProjects && project.user.isSus) return false;
            return true;
        })}
        {#if filteredProjects.length === 0}
            <div class="py-12 text-center text-gray-300">No projects available.</div>
        {:else}
            <div class="grid gap-6">
                {#each filteredProjects as project (project.projectId)}
                    <div
                        class={`rounded-2xl border bg-gray-900/70 backdrop-blur p-6 space-y-4 ${
                            project.user.isSus
                                ? 'border-yellow-500'
                                : project.isFraud
                                  ? 'border-red-500'
                                  : 'border-gray-700'
                        }`}
                    >
                        {#if project.isFraud}
                            <div class="bg-red-600/20 border-2 border-red-500 rounded-lg p-3 mb-4">
                                <p class="text-red-300 font-bold text-center uppercase tracking-wide">
                                    ⚠️ FRAUD FLAGGED
                                </p>
                            </div>
                        {/if}
                        {#if project.user.isSus}
                            <div class="bg-yellow-600/20 border-2 border-yellow-500 rounded-lg p-3 mb-4">
                                <p class="text-yellow-300 font-bold text-center uppercase tracking-wide">
                                    ⚠️ SUS FLAGGED
                                </p>
                            </div>
                        {/if}
                        <div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div>
                                <h3 class="text-xl font-semibold">{project.projectTitle}</h3>
                                <p class="text-sm text-gray-400">
                                    Owner: {fullName(project.user)} ({project.user.email})
                                </p>
                            </div>
                            <div class="flex flex-wrap gap-2 text-sm text-gray-300">
                                <span class="rounded-full border border-gray-600 px-3 py-1">Type: {project.projectType}</span>
                                <span class="rounded-full border border-gray-600 px-3 py-1">Hackatime: {formatHours(project.nowHackatimeHours)}</span>
                                <span class="rounded-full border border-gray-600 px-3 py-1">{project.isLocked ? 'Locked' : 'Unlocked'}</span>
                            </div>
                        </div>

                        {#if project.description}
                            <p class="text-sm text-gray-300 leading-relaxed">{project.description}</p>
                        {/if}

                        <div class="grid gap-4 md:grid-cols-3">
                            <div class="space-y-2">
                                <h4 class="text-sm font-semibold uppercase tracking-wide text-gray-400">Hackatime projects</h4>
                                {#if project.nowHackatimeProjects?.length}
                                    <ul class="text-sm text-gray-300 list-disc list-inside space-y-1">
                                        {#each project.nowHackatimeProjects as name}
                                            <li>{name}</li>
                                        {/each}
                                    </ul>
                                {:else}
                                    <p class="text-sm text-gray-500">No projects linked.</p>
                                {/if}
                            </div>
                            <div class="space-y-2">
                                <h4 class="text-sm font-semibold uppercase tracking-wide text-gray-400">Latest submission</h4>
                                {#if project.submissions.length > 0}
                                    <p class="text-sm text-gray-300">
                                        {project.submissions[0].approvalStatus} • {formatDate(project.submissions[0].createdAt)}
                                    </p>
                                    <p class="text-sm text-gray-400">
                                        Approved hours: {formatHours(project.submissions[0].approvedHours)}
                                    </p>
                                {:else}
                                    <p class="text-sm text-gray-500">No submissions yet.</p>
                                {/if}
                            </div>
                            <div class="space-y-2">
                                <h4 class="text-sm font-semibold uppercase tracking-wide text-gray-400">Links</h4>
                                {#if project.playableUrl}
                                    {@const normalizedPlayableUrl = normalizeUrl(project.playableUrl)}
                                    {#if normalizedPlayableUrl}
                                        <a
                                            class="text-purple-300 hover:text-purple-200 text-sm break-words"
                                            href={normalizedPlayableUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                        >Playable</a>
                                    {/if}
                                {/if}
                                {#if project.repoUrl}
                                    <a
                                        class="text-purple-300 hover:text-purple-200 text-sm break-words"
                                        href={project.repoUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                    >Repository</a>
                                {/if}
                                {#if project.screenshotUrl}
                                    <a
                                        class="text-purple-300 hover:text-purple-200 text-sm break-words"
                                        href={project.screenshotUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                    >Screenshot</a>
                                {/if}
                            </div>
                        </div>

                        <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div class="flex flex-wrap gap-3">
                                <button
                                    class="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 transition-colors disabled:bg-gray-700 disabled:cursor-not-allowed"
                                    onclick={() => recalculateProject(project.projectId)}
                                    disabled={projectBusy[project.projectId]}
                                >
                                    {projectBusy[project.projectId] ? 'Processing...' : 'Recalculate hours'}
                                </button>
                                <button
                                    class={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                                        project.user.isSus
                                            ? 'bg-yellow-600/20 border-yellow-500 text-yellow-300 hover:bg-yellow-600/30'
                                            : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                                    }`}
                                    onclick={() => toggleSusFlag(project.user.userId, project.user.isSus)}
                                >
                                    {project.user.isSus ? '⚠️ Sus Flagged' : 'Flag as Sus'}
                                </button>
                                <button
                                    class={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                                        project.isFraud
                                            ? 'bg-red-600/20 border-red-500 text-red-300 hover:bg-red-600/30'
                                            : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                                    }`}
                                    onclick={() => toggleFraudFlag(project.projectId, project.isFraud)}
                                >
                                    {project.isFraud ? '🚫 Fraud Flagged' : 'Flag as Fraud'}
                                </button>
                                <button
                                    class="px-3 py-2 text-sm rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
                                    onclick={() => loadTimeline(project.projectId)}
                                    disabled={timelineLoading[project.projectId]}
                                >
                                    {#if timelineLoading[project.projectId]}
                                        Loading...
                                    {:else}
                                        <span>{timelineOpen[project.projectId] ? '▼' : '▶'}</span> Timeline
                                    {/if}
                                </button>
                                {#if project.isLocked}
                                    <button
                                        class="px-3 py-2 text-sm rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors disabled:bg-gray-700 disabled:cursor-not-allowed"
                                        onclick={() => unlockProject(project.projectId)}
                                        disabled={projectBusy[project.projectId]}
                                    >
                                        Unlock project
                                    </button>
                                {/if}
                                <button
                                    class="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 transition-colors disabled:bg-gray-700 disabled:cursor-not-allowed"
                                    onclick={() => deleteProject(project.projectId)}
                                    disabled={projectBusy[project.projectId]}
                                >
                                    Delete project
                                </button>
                            </div>
                            <div class="text-sm">
                                {#if projectErrors[project.projectId]}
                                    <span class="text-red-400">{projectErrors[project.projectId]}</span>
                                {:else if projectSuccess[project.projectId]}
                                    <span class="text-green-400">{projectSuccess[project.projectId]}</span>
                                {/if}
                            </div>
                        </div>

                        {#if timelineOpen[project.projectId] && timelineByProject[project.projectId]}
                            {@const timeline = timelineByProject[project.projectId].timeline}
                            <div class="mt-4 border-t border-gray-700 pt-4">
                                <h4 class="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">Project Timeline</h4>
                                {#if timeline.length === 0}
                                    <p class="text-sm text-gray-500">No timeline events.</p>
                                {:else}
                                    <div class="relative pl-6 space-y-4">
                                        <div class="absolute left-[4px] top-2 bottom-2 w-0.5 bg-gray-700"></div>
                                        {#each timeline as event}
                                            <div class="relative">
                                                <div class="absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full {timelineDotColor(event.type)} ring-2 ring-gray-900"></div>
                                                <div class="ml-5">
                                                    <div class="rounded-lg border p-3 {timelineEventColor(event.type)}">
                                                        <div class="flex items-center justify-between gap-2 flex-wrap">
                                                            <span class="font-medium text-sm">{timelineEventLabel(event.type)}</span>
                                                            <span class="text-xs text-gray-400">{formatDate(event.timestamp)}</span>
                                                        </div>
                                                        {#if event.actor}
                                                            <p class="text-xs text-gray-400 mt-1">
                                                                by {event.actor.firstName ?? ''} {event.actor.lastName ?? ''} ({event.actor.email})
                                                            </p>
                                                        {/if}
                                                        {#if event.details && Object.keys(event.details).length > 0}
                                                            <pre class="text-xs text-gray-400 mt-2 whitespace-pre-wrap break-words">{JSON.stringify(event.details, null, 2)}</pre>
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
