<script lang="ts">
    import { onMount } from 'svelte';
    import { base } from '$app/paths';
    import { api, type components } from '$lib/api';
    import { Play, Snowflake, LoaderCircle } from 'lucide-svelte';
    import { Button, TextField, Card, Checkbox, Select, FilterTag } from '$lib/components';

    type AdminProject = components['schemas']['AdminProjectResponse'];
    type AdminLightUser = components['schemas']['AdminLightUserResponse'];
    type GlobalSettingsResponse = components['schemas']['GlobalSettingsResponse'];
    type PriorityUserResponse = components['schemas']['PriorityUserResponse'];

    type SortField =
        | 'createdAt'
        | 'projectTitle'
        | 'userName'
        | 'approvalStatus'
        | 'nowHackatimeHours'
        | 'approvedHours';
    type SortDirection = 'asc' | 'desc';

    const projectTypes = [
        'windows_playable',
        'mac_playable',
        'linux_playable',
        'web_playable',
        'cross_platform_playable',
        'hardware',
        'mobile_app',
    ] as const;
    const statusOptions = ['pending', 'approved', 'rejected'] as const;

    // --- State ---
    let projects = $state<AdminProject[]>([]);
    let projectsLoading = $state(false);

    let searchQuery = $state('');
    let selectedStatuses = $state<Set<string>>(new Set(['pending']));
    let selectedProjectTypes = $state<Set<string>>(new Set());
    let sortField = $state<SortField>('createdAt');
    let sortDirection = $state<SortDirection>('asc');
    let showFraudProjects = $state(true);
    let showSusProjects = $state(true);
    let submissionCountFilter = $state<string>('all');

    let globalSettings = $state<GlobalSettingsResponse | null>(null);
    let globalSettingsLoading = $state(false);

    let priorityUsers = $state<PriorityUserResponse[]>([]);
    let priorityUsersLoading = $state(false);
    let priorityUsersLoaded = $state(false);
    let priorityFilterEnabled = $state(false);

    // --- Helpers ---
    function formatDate(value: string) {
        return new Date(value).toLocaleString();
    }

    function formatHours(value: number | null) {
        if (value === null || value === undefined) return '—';
        return value.toFixed(1);
    }

    function fullName(user: AdminLightUser) {
        const first = user.firstName ?? '';
        const last = user.lastName ?? '';
        const name = `${first} ${last}`.trim();
        return name || 'Unknown';
    }

    function formatProjectType(type: string): string {
        return type
            .split('_')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    }

    function latestSubmission(project: AdminProject) {
        if (!project.submissions || project.submissions.length === 0) return null;
        return project.submissions[0];
    }

    function projectStatus(project: AdminProject): string {
        const latest = latestSubmission(project);
        return latest?.approvalStatus ?? 'none';
    }

    // --- API ---
    async function loadProjects() {
        projectsLoading = true;
        try {
            const { data, error } = await api.GET('/api/admin/projects');
            if (error) {
                console.error('Failed to load projects:', error);
                return;
            }
            if (data) projects = data;
        } catch (err) {
            console.error('Failed to load projects:', err);
        } finally {
            projectsLoading = false;
        }
    }

    async function loadGlobalSettings() {
        globalSettingsLoading = true;
        try {
            const { data, error } = await api.GET('/api/admin/settings');
            if (!error && data) globalSettings = data;
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
                body: { submissionsFrozen: !globalSettings.submissionsFrozen },
            });
            if (!error && data) globalSettings = data;
        } catch (err) {
            console.error('Failed to toggle submissions frozen:', err);
        } finally {
            globalSettingsLoading = false;
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

    // --- Filter / sort ---
    function matchesSearch(project: AdminProject, query: string): boolean {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        const name = fullName(project.user).toLowerCase();
        return (
            project.projectTitle.toLowerCase().includes(q) ||
            name.includes(q) ||
            project.user.email.toLowerCase().includes(q) ||
            (project.description?.toLowerCase().includes(q) ?? false)
        );
    }

    function matchesStatus(project: AdminProject): boolean {
        if (selectedStatuses.size === 0) return true;
        return selectedStatuses.has(projectStatus(project));
    }

    function matchesProjectType(project: AdminProject): boolean {
        if (selectedProjectTypes.size === 0) return true;
        return selectedProjectTypes.has(project.projectType);
    }

    function matchesPriority(project: AdminProject): boolean {
        if (!priorityFilterEnabled || !priorityUsersLoaded) return true;
        const ids = new Set(priorityUsers.map((u) => u.userId));
        return ids.has(project.user.userId);
    }

    function matchesFraud(project: AdminProject): boolean {
        // Fraud is now driven by Joe only; a project is "fraud" when joeFraudPassed === false.
        return showFraudProjects || project.joeFraudPassed !== false;
    }

    function matchesSus(project: AdminProject): boolean {
        return showSusProjects || !project.user.isSus;
    }

    function matchesSubmissionCount(project: AdminProject): boolean {
        const count = project.submissions?.length ?? 0;
        if (submissionCountFilter === 'single') return count === 1;
        if (submissionCountFilter === 'multiple') return count > 1;
        return true;
    }

    function compareProjects(a: AdminProject, b: AdminProject): number {
        let c = 0;
        switch (sortField) {
            case 'createdAt':
                c = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                break;
            case 'projectTitle':
                c = a.projectTitle.localeCompare(b.projectTitle);
                break;
            case 'userName':
                c = fullName(a.user).localeCompare(fullName(b.user));
                break;
            case 'approvalStatus':
                c = projectStatus(a).localeCompare(projectStatus(b));
                break;
            case 'nowHackatimeHours':
                c = (a.nowHackatimeHours ?? 0) - (b.nowHackatimeHours ?? 0);
                break;
            case 'approvedHours':
                c = (a.approvedHours ?? 0) - (b.approvedHours ?? 0);
                break;
        }
        return sortDirection === 'asc' ? c : -c;
    }

    let filteredProjects = $derived.by(() =>
        projects
            .filter(
                (p) =>
                    matchesSearch(p, searchQuery) &&
                    matchesStatus(p) &&
                    matchesProjectType(p) &&
                    matchesPriority(p) &&
                    matchesFraud(p) &&
                    matchesSus(p) &&
                    matchesSubmissionCount(p),
            )
            .sort(compareProjects),
    );

    function toggleStatus(status: string) {
        const next = new Set(selectedStatuses);
        if (next.has(status)) next.delete(status);
        else next.add(status);
        selectedStatuses = next;
    }

    function toggleProjectType(type: string) {
        const next = new Set(selectedProjectTypes);
        if (next.has(type)) next.delete(type);
        else next.add(type);
        selectedProjectTypes = next;
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

    onMount(() => {
        Promise.all([loadProjects(), loadGlobalSettings()]);
    });
</script>

<svelte:head>
    <title>Projects - Admin Panel</title>
</svelte:head>

<div class="p-6">
    <div class="mx-auto max-w-6xl space-y-6">
        <section class="space-y-4 font-dm">
            <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <h2 class="text-2xl font-semibold">Projects</h2>
                <div class="flex items-center gap-3">
                    {#if globalSettings}
                        <Button
                            variant="ghost"
                            class={globalSettings.submissionsFrozen
                                ? 'bg-blue-600/20 border-blue-500 text-blue-700 hover:bg-blue-600/30 flex items-center gap-2'
                                : 'flex items-center gap-2'}
                            onclick={toggleGlobalSubmissionsFrozen}
                            disabled={globalSettingsLoading}
                        >
                            {#if globalSettingsLoading}
                                <LoaderCircle size={16} class="animate-spin" />
                            {:else if globalSettings.submissionsFrozen}
                                <Snowflake size={16} />
                            {:else}
                                <Play size={16} />
                            {/if}
                            {globalSettings.submissionsFrozen ? 'Submissions Frozen' : 'Freeze All Submissions'}
                        </Button>
                    {/if}
                    <Button variant="default" onclick={() => loadProjects()}>Refresh</Button>
                </div>
            </div>

            {#if globalSettings?.submissionsFrozen}
                <div class="rounded-xl border border-blue-500 bg-blue-600/10 p-4 flex items-center gap-3">
                    <Snowflake size={24} class="text-blue-700" />
                    <div>
                        <p class="font-semibold text-blue-700">Submissions are currently frozen</p>
                        <p class="text-sm text-blue-600">Users cannot submit or resubmit projects until unfrozen.</p>
                    </div>
                </div>
            {/if}

            <Card class="p-6 space-y-6 backdrop-blur">
                <div>
                    <label for="search-projects" class="block text-sm font-medium text-ds-text-secondary mb-2">Search</label>
                    <TextField
                        id="search-projects"
                        type="text"
                        placeholder="Search by project title, user name, email, or description..."
                        bind:value={searchQuery}
                    />
                </div>

                <div class="grid gap-4 md:grid-cols-3">
                    <div>
                        <div class="block text-sm font-medium text-ds-text-secondary mb-2">Priority Filter</div>
                        <div class="flex flex-wrap gap-2">
                            <FilterTag
                                active={priorityFilterEnabled}
                                class={priorityFilterEnabled ? 'bg-yellow-600! border-yellow-400! text-black!' : ''}
                                onclick={togglePriorityFilter}
                            >
                                {priorityUsersLoading ? 'Loading...' : 'Priority (50+ hrs)'}
                                {#if priorityFilterEnabled}<span class="ml-1">✓</span>{/if}
                            </FilterTag>
                            {#if priorityFilterEnabled && priorityUsersLoaded}
                                <span class="px-2 py-1.5 text-xs text-ds-text-secondary self-center">
                                    ({priorityUsers.length} users)
                                </span>
                            {/if}
                        </div>
                    </div>

                    <div>
                        <div class="block text-sm font-medium text-ds-text-secondary mb-2">Submission Count</div>
                        <div class="flex flex-wrap gap-2">
                            <FilterTag active={submissionCountFilter === 'all'} onclick={() => (submissionCountFilter = 'all')}>All</FilterTag>
                            <FilterTag active={submissionCountFilter === 'single'} onclick={() => (submissionCountFilter = 'single')}>Single</FilterTag>
                            <FilterTag active={submissionCountFilter === 'multiple'} onclick={() => (submissionCountFilter = 'multiple')}>Multiple</FilterTag>
                        </div>
                    </div>

                    <div>
                        <div class="block text-sm font-medium text-ds-text-secondary mb-2">Status (latest submission)</div>
                        <div class="flex flex-wrap gap-2">
                            {#each statusOptions as status}
                                <FilterTag
                                    active={selectedStatuses.has(status)}
                                    class={selectedStatuses.has(status)
                                        ? status === 'pending'
                                            ? 'bg-yellow-600! border-yellow-400! text-black!'
                                            : status === 'approved'
                                              ? 'bg-green-600! border-green-400! text-black!'
                                              : 'bg-red-600! border-red-400! text-black!'
                                        : ''}
                                    onclick={() => toggleStatus(status)}
                                >
                                    {status.charAt(0).toUpperCase() + status.slice(1)}
                                    {#if selectedStatuses.has(status)}<span class="ml-1">✓</span>{/if}
                                </FilterTag>
                            {/each}
                            {#if selectedStatuses.size > 0}
                                <FilterTag onclick={() => (selectedStatuses = new Set())}>Clear</FilterTag>
                            {/if}
                        </div>
                    </div>
                </div>

                <div class="grid gap-4 md:grid-cols-3">
                    <div>
                        <div class="block text-sm font-medium text-ds-text-secondary mb-2">Project Type</div>
                        <div class="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                            {#each projectTypes as type}
                                <FilterTag
                                    active={selectedProjectTypes.has(type)}
                                    onclick={() => toggleProjectType(type)}
                                >
                                    {formatProjectType(type)}
                                    {#if selectedProjectTypes.has(type)}<span class="ml-1">✓</span>{/if}
                                </FilterTag>
                            {/each}
                            {#if selectedProjectTypes.size > 0}
                                <FilterTag onclick={() => (selectedProjectTypes = new Set())}>Clear</FilterTag>
                            {/if}
                        </div>
                    </div>

                    <div>
                        <div class="block text-sm font-medium text-ds-text-secondary mb-2">Fraud / Sus</div>
                        <div class="flex flex-col gap-2">
                            <label class="flex items-center gap-2 cursor-pointer">
                                <Checkbox bind:checked={showFraudProjects} />
                                <span class="text-sm text-ds-text-secondary">Show fraud</span>
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer">
                                <Checkbox bind:checked={showSusProjects} />
                                <span class="text-sm text-ds-text-secondary">Show sus</span>
                            </label>
                        </div>
                    </div>

                    <div>
                        <div class="block text-sm font-medium text-ds-text-secondary mb-2">Sort By</div>
                        <div class="flex gap-2">
                            <Select class="flex-1" bind:value={sortField}>
                                <option value="createdAt">Date Created</option>
                                <option value="projectTitle">Project Title</option>
                                <option value="userName">User Name</option>
                                <option value="approvalStatus">Status</option>
                                <option value="nowHackatimeHours">Hackatime Hours</option>
                                <option value="approvedHours">Approved Hours</option>
                            </Select>
                            <Button
                                variant="default"
                                onclick={() => (sortDirection = sortDirection === 'asc' ? 'desc' : 'asc')}
                                title={sortDirection === 'asc' ? 'Sort ascending' : 'Sort descending'}
                            >
                                {sortDirection === 'asc' ? '↑' : '↓'}
                            </Button>
                        </div>
                    </div>
                </div>

                <div class="text-sm text-ds-text-secondary">
                    Showing {filteredProjects.length} of {projects.length} projects
                </div>
            </Card>

            {#if projectsLoading}
                <div class="py-12 text-center text-ds-text-secondary">Loading projects...</div>
            {:else if filteredProjects.length === 0}
                <div class="py-12 text-center text-ds-text-secondary">No projects match your filters.</div>
            {:else}
                <div class="space-y-3">
                    {#each filteredProjects as project (project.projectId)}
                        {@const status = projectStatus(project)}
                        {@const latest = latestSubmission(project)}
                        <a
                            href="{base}/projects/{project.projectId}"
                            class="block rounded-lg border border-ds-border bg-ds-surface2 p-4 shadow-[var(--color-ds-shadow)] hover:border-ds-text-secondary hover:bg-ds-surface-deselected transition-colors space-y-3 cursor-pointer outline-none focus-visible:border-ds-text-secondary"
                        >
                            <div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                <div class="min-w-0">
                                    <h3 class="text-xl font-semibold">{project.projectTitle}</h3>
                                    <p class="text-sm text-ds-text-secondary">
                                        {fullName(project.user)} ({project.user.email})
                                    </p>
                                    {#if project.user.hackatimeStartDate}
                                        <p class="mt-1 text-xs text-yellow-700">
                                            ⚠ Custom Hackatime start: {new Date(project.user.hackatimeStartDate).toISOString().split('T')[0]}
                                        </p>
                                    {/if}
                                </div>
                                <div class="flex flex-wrap gap-2 text-sm text-ds-text-secondary">
                                    {#if project.joeFraudPassed === false}
                                        <span class="rounded-full border border-red-500 bg-red-600/20 text-red-600 px-3 py-1 text-xs font-bold uppercase tracking-wide">Fraud</span>
                                    {/if}
                                    {#if project.user.isSus}
                                        <span class="rounded-full border border-yellow-500 bg-yellow-600/20 text-yellow-600 px-3 py-1 text-xs font-bold uppercase tracking-wide">Sus</span>
                                    {/if}
                                    <span class={`rounded-full border px-3 py-1 ${statusBadgeClass(status)}`}>
                                        {status.toUpperCase()}
                                    </span>
                                    <span class="rounded-full border border-ds-border px-3 py-1">{formatProjectType(project.projectType)}</span>
                                    <span class="rounded-full border border-ds-border px-3 py-1">Hackatime: {formatHours(project.nowHackatimeHours)}</span>
                                    {#if project.isLocked}
                                        <span class="rounded-full border border-ds-border px-3 py-1">Locked</span>
                                    {/if}
                                </div>
                            </div>

                            {#if project.description}
                                <p class="text-sm text-ds-text-secondary leading-relaxed line-clamp-2">{project.description}</p>
                            {/if}

                            <div class="flex flex-wrap items-center gap-4 text-xs text-ds-text-secondary pt-2 border-t border-ds-border">
                                <span>{project.submissions?.length ?? 0} submission{(project.submissions?.length ?? 0) === 1 ? '' : 's'}</span>
                                {#if latest}
                                    <span>Latest: {formatDate(latest.createdAt)}</span>
                                    {#if latest.approvedHours != null}
                                        <span>Approved hours: {formatHours(latest.approvedHours)}</span>
                                    {/if}
                                {/if}
                            </div>
                        </a>
                    {/each}
                </div>
            {/if}
        </section>
    </div>
</div>
