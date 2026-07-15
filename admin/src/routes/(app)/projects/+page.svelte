<script lang="ts">
    import { onMount } from 'svelte';
    import { base } from '$app/paths';
    import { page } from '$app/stores';
    import { api, type components } from '$lib/api';
    import { Play, Snowflake, LoaderCircle, ListFilter } from 'lucide-svelte';
    import { Button, TextField, Card, Checkbox, Select, FilterTag } from '$lib/components';
    import { normalizeSearchQuery } from '$lib/search';

    type AdminProject = components['schemas']['AdminProjectListItemResponse'];
    type AdminProjectUser = AdminProject['user'];
    type GlobalSettingsResponse = components['schemas']['GlobalSettingsResponse'];
    type PriorityUserResponse = components['schemas']['PriorityUserResponse'];
    type PriorityQueueEntry = components['schemas']['PriorityQueueEntryResponse'];

    type SortField =
        | 'shippedAt'
        | 'createdAt'
        | 'projectTitle'
        | 'userName'
        | 'approvalStatus'
        | 'nowHackatimeHours'
        | 'approvedHours'
        | 'manifestDoubleDip';
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
    // Gate list rendering until the first load lands, so the page shows a
    // loading state instead of flashing an empty/stale list.
    let projectsLoaded = $state(false);
    // Filters live behind the funnel toggle next to the search bar.
    let filtersOpen = $state(false);

    let searchQuery = $state('');
    // Debounced copy of searchQuery that actually drives filtering. Filtering
    // re-renders the whole project list, so doing it per keystroke makes the
    // input feel frozen on large datasets.
    let appliedSearch = $state('');
    type SearchField =
        | 'all'
        | 'title'
        | 'user'
        | 'slack'
        | 'description'
        | 'repo'
        | 'playable'
        | 'id'
        | 'airtable';
    let searchField = $state<SearchField>('all');
    // No filters applied by default — admins see the full list until they opt in.
    let selectedStatuses = $state<Set<string>>(new Set());
    let selectedProjectTypes = $state<Set<string>>(new Set());
    // Default view: most recently shipped first (latest submission date),
    // never-shipped projects at the bottom.
    let sortField = $state<SortField>('shippedAt');
    let sortDirection = $state<SortDirection>('desc');
    let showFraudProjects = $state(true);
    let showSusProjects = $state(true);
    let showDeletedProjects = $state(false);
    let submissionCountFilter = $state<string>('all');

    let globalSettings = $state<GlobalSettingsResponse | null>(null);
    let globalSettingsLoading = $state(false);

    let priorityUsers = $state<PriorityUserResponse[]>([]);
    let priorityUsersLoading = $state(false);
    let priorityUsersLoaded = $state(false);
    let priorityFilterEnabled = $state(false);

    // Approved priority-review queue from the external Halceon service, keyed by
    // Horizons project id. Drives the "Priority Queue" sort and the per-project
    // reason message on each card.
    let priorityQueue = $state<Map<number, PriorityQueueEntry>>(new Map());
    let priorityQueueLoading = $state(false);
    // When enabled, only show projects present in the priority-review queue.
    let priorityQueueFilterEnabled = $state(false);

    // Map of projectId → non-Horizons hours shipped per Manifest. Backend returns
    // only entries with hours > 0, so absence from the map means "clean" (or the
    // project has no codeUrl registered with Manifest). Drives the
    // "manifestDoubleDip" sort and the "Double-dipped" filter.
    let manifestSummary = $state<Map<number, { hours: number; names: string[] }>>(new Map());
    let manifestSummaryLoading = $state(false);
    let manifestEnabled = $state(true);
    let doubleDipFilterEnabled = $state(false);

    // --- Helpers ---
    function formatDate(value: string) {
        return new Date(value).toLocaleString();
    }

    function formatHours(value: number | null) {
        if (value === null || value === undefined) return '—';
        return value.toFixed(1);
    }

    function fullName(user: AdminProjectUser) {
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
        return project.latestSubmission ?? null;
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
            projectsLoaded = true;
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

    async function loadManifestSummary() {
        manifestSummaryLoading = true;
        try {
            const { data, error } = await api.GET('/api/admin/projects/manifest-summary');
            if (error || !data) return;
            manifestEnabled = data.enabled;
            const next = new Map<number, { hours: number; names: string[] }>();
            for (const entry of data.entries ?? []) {
                next.set(entry.projectId, {
                    hours: entry.priorYswsHoursShipped,
                    names: entry.priorYswsNames ?? [],
                });
            }
            manifestSummary = next;
        } catch (err) {
            console.error('Failed to load manifest summary:', err);
        } finally {
            manifestSummaryLoading = false;
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

    async function loadPriorityQueue() {
        priorityQueueLoading = true;
        try {
            const { data, error } = await api.GET('/api/admin/priority-queue');
            if (error || !data) return;
            const next = new Map<number, PriorityQueueEntry>();
            for (const entry of data) next.set(entry.projectId, entry);
            priorityQueue = next;
        } catch (err) {
            console.error('Failed to load priority queue:', err);
        } finally {
            priorityQueueLoading = false;
        }
    }

    async function togglePriorityFilter() {
        priorityFilterEnabled = !priorityFilterEnabled;
        if (priorityFilterEnabled && !priorityUsersLoaded) {
            await loadPriorityUsers();
        }
    }

    // --- Filter / sort ---
    $effect(() => {
        const q = searchQuery;
        if (q === appliedSearch) return;
        const timer = setTimeout(() => (appliedSearch = q), 200);
        return () => clearTimeout(timer);
    });

    // Lowercased per-project search text by field, built once per data load
    // instead of lowercasing every field per project on every filter pass.
    // "all" newline-joins the rest so a query can't accidentally match across
    // field boundaries.
    const searchHaystacks = $derived(
        new Map(
            projects.map((p) => {
                const fields = {
                    title: p.projectTitle.toLowerCase(),
                    user: `${fullName(p.user)}\n${p.user.email}`.toLowerCase(),
                    slack: (p.user.slackUserId ?? '').toLowerCase(),
                    description: (p.description ?? '').toLowerCase(),
                    repo: (p.repoUrl ?? '').toLowerCase(),
                    playable: (p.playableUrl ?? '').toLowerCase(),
                    // Bare number, "#123" form, and the Joe project id, so a
                    // pasted Joe link (normalized to its id) resolves too.
                    id: `${p.projectId}\n#${p.projectId}\n${(p.joeProjectId ?? '').toLowerCase()}`,
                    // Airtable record ids across all submissions (rec…), so a
                    // record pasted from Airtable resolves to its project.
                    airtable: (p.airtableRecIds ?? []).join('\n').toLowerCase(),
                };
                return [
                    p.projectId,
                    { ...fields, all: Object.values(fields).join('\n') },
                ] as const;
            }),
        ),
    );

    function matchesSearch(project: AdminProject, query: string): boolean {
        const q = normalizeSearchQuery(query);
        if (!q) return true;
        return (
            searchHaystacks.get(project.projectId)?.[searchField].includes(q) ??
            false
        );
    }

    // Split text into segments around the active search query so the template
    // can wrap hits in <mark>. Case-insensitive plain substring — the same
    // matching the filter itself uses.
    function highlightSegments(text: string): { text: string; hit: boolean }[] {
        const q = normalizeSearchQuery(appliedSearch);
        if (!q || !text) return [{ text, hit: false }];
        const lower = text.toLowerCase();
        const segments: { text: string; hit: boolean }[] = [];
        let pos = 0;
        while (pos < text.length) {
            const idx = lower.indexOf(q, pos);
            if (idx === -1) {
                segments.push({ text: text.slice(pos), hit: false });
                break;
            }
            if (idx > pos) segments.push({ text: text.slice(pos, idx), hit: false });
            segments.push({ text: text.slice(idx, idx + q.length), hit: true });
            pos = idx + q.length;
        }
        return segments.length ? segments : [{ text, hit: false }];
    }

    function matchesStatus(project: AdminProject): boolean {
        if (selectedStatuses.size === 0) return true;
        return selectedStatuses.has(projectStatus(project));
    }

    function matchesProjectType(project: AdminProject): boolean {
        if (selectedProjectTypes.size === 0) return true;
        return selectedProjectTypes.has(project.projectType);
    }

    const priorityUserIds = $derived(new Set(priorityUsers.map((u) => u.userId)));

    function matchesPriority(project: AdminProject): boolean {
        if (!priorityFilterEnabled || !priorityUsersLoaded) return true;
        return priorityUserIds.has(project.user.userId);
    }

    function matchesFraud(project: AdminProject): boolean {
        // Fraud is now driven by Joe only; a project is "fraud" when joeFraudPassed === false.
        return showFraudProjects || project.joeFraudPassed !== false;
    }

    function matchesSus(project: AdminProject): boolean {
        return showSusProjects || !project.user.isSus;
    }

    function matchesDeleted(project: AdminProject): boolean {
        // Hide deleted projects by default. They surface when the admin types a
        // search query (so they can be looked up by name/email/etc) or toggles
        // the "Show deleted" checkbox.
        if (!project.deletedAt) return true;
        if (showDeletedProjects) return true;
        return appliedSearch.trim().length > 0;
    }

    function matchesSubmissionCount(project: AdminProject): boolean {
        const count = project.submissionCount ?? 0;
        if (submissionCountFilter === 'single') return count === 1;
        if (submissionCountFilter === 'multiple') return count > 1;
        return true;
    }

    function matchesDoubleDip(project: AdminProject): boolean {
        if (!doubleDipFilterEnabled) return true;
        return manifestSummary.has(project.projectId);
    }

    function matchesPriorityQueue(project: AdminProject): boolean {
        if (!priorityQueueFilterEnabled) return true;
        return priorityQueue.has(project.projectId);
    }

    function compareProjects(a: AdminProject, b: AdminProject): number {
        let c = 0;
        switch (sortField) {
            case 'shippedAt':
                c =
                    new Date(a.latestSubmission?.createdAt ?? 0).getTime() -
                    new Date(b.latestSubmission?.createdAt ?? 0).getTime();
                break;
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
            case 'manifestDoubleDip':
                c =
                    (manifestSummary.get(a.projectId)?.hours ?? 0) -
                    (manifestSummary.get(b.projectId)?.hours ?? 0);
                break;
        }
        return sortDirection === 'asc' ? c : -c;
    }

    let filteredProjects = $derived.by(() =>
        projects
            .filter(
                (p) =>
                    matchesSearch(p, appliedSearch) &&
                    matchesStatus(p) &&
                    matchesProjectType(p) &&
                    matchesPriority(p) &&
                    matchesFraud(p) &&
                    matchesSus(p) &&
                    matchesDeleted(p) &&
                    matchesSubmissionCount(p) &&
                    matchesDoubleDip(p) &&
                    matchesPriorityQueue(p),
            )
            .sort(compareProjects),
    );

    // Rendering every match as a full card is what makes the page janky at
    // scale — cap the DOM and grow it on demand. Resets whenever the filtered
    // set changes.
    const RENDER_CHUNK = 100;
    let renderLimit = $state(RENDER_CHUNK);
    const visibleProjects = $derived(filteredProjects.slice(0, renderLimit));
    $effect(() => {
        void filteredProjects;
        renderLimit = RENDER_CHUNK;
    });

    // Grows the rendered window when the sentinel below the list scrolls into
    // view (rootMargin starts the next chunk before the user hits the bottom).
    function infiniteScroll(node: HTMLElement) {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    renderLimit += RENDER_CHUNK;
                }
            },
            { rootMargin: '600px' },
        );
        observer.observe(node);
        return {
            destroy() {
                observer.disconnect();
            },
        };
    }

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

    // How many filters deviate from their defaults — shown as a badge on the
    // filter toggle so active filters aren't invisible while the panel is shut.
    const activeFilterCount = $derived(
        selectedStatuses.size +
            selectedProjectTypes.size +
            (priorityFilterEnabled ? 1 : 0) +
            (priorityQueueFilterEnabled ? 1 : 0) +
            (doubleDipFilterEnabled ? 1 : 0) +
            (submissionCountFilter !== 'all' ? 1 : 0) +
            (showFraudProjects ? 0 : 1) +
            (showSusProjects ? 0 : 1) +
            (showDeletedProjects ? 1 : 0),
    );

    function statusBadgeClass(status: string): string {
        switch (status) {
            case 'approved':
                return 'bg-green-500/20 border-green-400 text-green-700 dark:text-green-300';
            case 'rejected':
                return 'bg-red-500/20 border-red-400 text-red-700 dark:text-red-300';
            case 'pending':
                return 'bg-yellow-500/20 border-yellow-400 text-yellow-700 dark:text-yellow-300';
            default:
                return 'bg-ds-surface-inactive border-ds-border text-ds-text-secondary';
        }
    }

    onMount(() => {
        // Deep-link support: ?q= seeds the search box and ?field= the scope
        // (e.g. the users page links here with field=user&q=<email>). Applied
        // immediately — skipping the debounce — so the list opens pre-filtered.
        const params = $page.url.searchParams;
        const q = params.get('q');
        const field = params.get('field');
        if (q) {
            searchQuery = q;
            appliedSearch = q;
        }
        const validFields: SearchField[] = [
            'all', 'title', 'user', 'slack', 'description', 'repo', 'playable', 'id', 'airtable',
        ];
        if (field && (validFields as string[]).includes(field)) {
            searchField = field as SearchField;
        }

        Promise.all([
            loadProjects(),
            loadGlobalSettings(),
            loadManifestSummary(),
            loadPriorityQueue(),
        ]);
    });
</script>

<svelte:head>
    <title>Projects - Admin Panel</title>
</svelte:head>

{#snippet highlighted(text: string)}
    {#each highlightSegments(text) as segment}
        {#if segment.hit}<mark class="rounded-xs bg-yellow-400/50 text-inherit dark:bg-yellow-500/40">{segment.text}</mark>{:else}{segment.text}{/if}
    {/each}
{/snippet}

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
                                ? 'bg-blue-600/20 border-blue-500 text-blue-700 dark:text-blue-300 hover:bg-blue-600/30 flex items-center gap-2'
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
                    <Snowflake size={24} class="text-blue-700 dark:text-blue-300" />
                    <div>
                        <p class="font-semibold text-blue-700 dark:text-blue-300">Submissions are currently frozen</p>
                        <p class="text-sm text-blue-700 dark:text-blue-300">Users cannot submit or resubmit projects until unfrozen.</p>
                    </div>
                </div>
            {/if}

<!-- Search row (Figma 3044:839): full-width search bar + filter toggle. -->
            <div class="flex items-stretch gap-2">
                <TextField
                    id="search-projects"
                    type="text"
                    class="flex-1"
                    placeholder="Search..."
                    bind:value={searchQuery}
                />
                <Button
                    variant="default"
                    class="shrink-0 gap-1.5 px-2.5"
                    onclick={() => (filtersOpen = !filtersOpen)}
                    title="Filters"
                    aria-label="Toggle filters"
                    aria-expanded={filtersOpen}
                >
                    <ListFilter size={20} />
                    {#if activeFilterCount > 0}
                        <span class="rounded-full bg-ds-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                            {activeFilterCount}
                        </span>
                    {/if}
                </Button>
            </div>

            <div class="text-sm text-ds-text-secondary">
                {filteredProjects.length} of {projects.length} projects match
                {#if filteredProjects.length > visibleProjects.length}
                    · showing first {visibleProjects.length}, scroll for more
                {/if}
            </div>

            {#if filtersOpen}
            <Card class="p-6 space-y-6 backdrop-blur">
                <div>
                    <div class="block text-sm font-medium text-ds-text-secondary mb-2">Search in</div>
                    <Select class="w-52" bind:value={searchField}>
                        <option value="all">All fields</option>
                        <option value="title">Title</option>
                        <option value="user">User (name/email)</option>
                        <option value="slack">Slack ID</option>
                        <option value="description">Description</option>
                        <option value="repo">Code URL</option>
                        <option value="playable">Playable URL</option>
                        <option value="id">Project ID</option>
                        <option value="airtable">Airtable ID</option>
                    </Select>
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
                            <FilterTag
                                active={priorityQueueFilterEnabled}
                                class={priorityQueueFilterEnabled ? 'bg-amber-600! border-amber-400! text-black!' : ''}
                                onclick={() => (priorityQueueFilterEnabled = !priorityQueueFilterEnabled)}
                            >
                                {priorityQueueLoading
                                    ? 'Loading queue...'
                                    : `Priority Queue (${priorityQueue.size})`}
                                {#if priorityQueueFilterEnabled}<span class="ml-1">✓</span>{/if}
                            </FilterTag>
                        </div>
                    </div>

                    <div>
                        <div class="block text-sm font-medium text-ds-text-secondary mb-2">Submission Count</div>
                        <div class="flex flex-wrap gap-2">
                            <FilterTag active={submissionCountFilter === 'all'} onclick={() => (submissionCountFilter = 'all')}>All</FilterTag>
                            <FilterTag active={submissionCountFilter === 'single'} onclick={() => (submissionCountFilter = 'single')}>Single</FilterTag>
                            <FilterTag active={submissionCountFilter === 'multiple'} onclick={() => (submissionCountFilter = 'multiple')}>Multiple</FilterTag>
                        </div>
                        <div class="mt-3 flex flex-wrap gap-2">
                            <FilterTag
                                active={doubleDipFilterEnabled}
                                class={doubleDipFilterEnabled ? 'bg-purple-600! border-purple-400! text-white!' : ''}
                                onclick={() => (doubleDipFilterEnabled = !doubleDipFilterEnabled)}
                            >
                                {manifestSummaryLoading
                                    ? 'Loading double-dip...'
                                    : `Double-dipped only (${manifestSummary.size})`}
                                {#if doubleDipFilterEnabled}<span class="ml-1">✓</span>{/if}
                            </FilterTag>
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
                        <div class="block text-sm font-medium text-ds-text-secondary mb-2">Fraud / Sus / Deleted</div>
                        <div class="flex flex-col gap-2">
                            <label class="flex items-center gap-2 cursor-pointer">
                                <Checkbox bind:checked={showFraudProjects} />
                                <span class="text-sm text-ds-text-secondary">Show fraud</span>
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer">
                                <Checkbox bind:checked={showSusProjects} />
                                <span class="text-sm text-ds-text-secondary">Show sus</span>
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer">
                                <Checkbox bind:checked={showDeletedProjects} />
                                <span class="text-sm text-ds-text-secondary">Show deleted (always shown when searching)</span>
                            </label>
                        </div>
                    </div>

                    <div>
                        <div class="block text-sm font-medium text-ds-text-secondary mb-2">Sort By</div>
                        <div class="flex gap-2">
                            <Select class="flex-1" bind:value={sortField}>
                                <option value="shippedAt">Date Shipped</option>
                                <option value="createdAt">Date Created</option>
                                <option value="projectTitle">Project Title</option>
                                <option value="userName">User Name</option>
                                <option value="approvalStatus">Status</option>
                                <option value="nowHackatimeHours">Hackatime Hours</option>
                                <option value="approvedHours">Approved Hours</option>
                                <option value="manifestDoubleDip" disabled={!manifestEnabled}>
                                    Manifest double-dip{!manifestEnabled ? ' (disabled)' : ''}
                                </option>
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

            </Card>
            {/if}

            {#if projectsLoading || !projectsLoaded}
                <div class="py-12 text-center text-ds-text-secondary">Loading projects...</div>
            {:else if filteredProjects.length === 0}
                <div class="py-12 text-center text-ds-text-secondary">No projects match your filters.</div>
            {:else}
                <div class="space-y-3">
                    {#each visibleProjects as project (project.projectId)}
                        {@const status = projectStatus(project)}
                        {@const latest = latestSubmission(project)}
                        <a
                            href="{base}/projects/{project.projectId}"
                            class="block rounded-lg border border-ds-border bg-ds-surface2 p-4 shadow-[var(--color-ds-shadow)] hover:border-ds-text-secondary hover:bg-ds-surface-deselected transition-colors space-y-3 cursor-pointer outline-none focus-visible:border-ds-text-secondary"
                        >
                            <div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                <div class="min-w-0">
                                    <h3 class="text-xl font-semibold">
                                        {@render highlighted(project.projectTitle)}
                                        <span class="text-sm font-normal text-ds-text-placeholder">{@render highlighted(`#${project.projectId}`)}</span>
                                    </h3>
                                    <p class="text-sm text-ds-text-secondary">
                                        {@render highlighted(fullName(project.user))} ({@render highlighted(project.user.email)}){#if project.user.slackUserId}&nbsp;· Slack: {@render highlighted(project.user.slackUserId)}{/if}
                                    </p>
                                    {#if project.user.hackatimeStartDate}
                                        <p class="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
                                            ⚠ Custom Hackatime start: {new Date(project.user.hackatimeStartDate).toISOString().split('T')[0]}
                                        </p>
                                    {/if}
                                </div>
                                <div class="flex flex-wrap gap-2 text-sm text-ds-text-secondary">
                                    {#if project.deletedAt}
                                        <span class="rounded-full border border-red-500 bg-red-600/20 text-red-700 dark:text-red-300 px-3 py-1 text-xs font-bold uppercase tracking-wide">Deleted</span>
                                    {/if}
                                    {#if project.joeFraudPassed === false}
                                        <span class="rounded-full border border-red-500 bg-red-600/20 text-red-700 dark:text-red-300 px-3 py-1 text-xs font-bold uppercase tracking-wide">Fraud</span>
                                    {/if}
                                    {#if project.user.isSus}
                                        <span class="rounded-full border border-yellow-500 bg-yellow-600/20 text-yellow-700 dark:text-yellow-300 px-3 py-1 text-xs font-bold uppercase tracking-wide">Sus</span>
                                    {/if}
                                    <span class={`rounded-full border px-3 py-1 ${statusBadgeClass(status)}`}>
                                        {status.toUpperCase()}
                                    </span>
                                    <span class="rounded-full border border-ds-border px-3 py-1">{formatProjectType(project.projectType)}</span>
                                    <span class="rounded-full border border-ds-border px-3 py-1">Hackatime: {formatHours(project.nowHackatimeHours)}</span>
                                    {#if project.isLocked}
                                        <span class="rounded-full border border-ds-border px-3 py-1">Locked</span>
                                    {/if}
                                    {#if manifestSummary.has(project.projectId)}
                                        {@const dip = manifestSummary.get(project.projectId)!}
                                        <span
                                            class="rounded-full border border-purple-500 bg-purple-600/20 text-purple-700 dark:text-purple-300 px-3 py-1 text-xs font-bold uppercase tracking-wide"
                                            title={dip.names.length > 0 ? `Also on: ${dip.names.join(', ')}` : 'Other YSWS submission(s) via Manifest'}
                                        >
                                            Double-dip {dip.hours.toFixed(1)}h
                                        </span>
                                    {/if}
                                    {#if priorityQueue.has(project.projectId)}
                                        <span class="rounded-full border border-amber-500 bg-amber-500/20 text-amber-700 dark:text-amber-300 px-3 py-1 text-xs font-bold uppercase tracking-wide">
                                            Priority Queue
                                        </span>
                                    {/if}
                                </div>
                            </div>

                            {#if priorityQueue.has(project.projectId)}
                                {@const pq = priorityQueue.get(project.projectId)!}
                                <div class="rounded-md border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                                    <p class="font-semibold flex items-center gap-1.5">
                                        Priority review requested{#if pq.decidedBy}<span class="font-normal text-amber-700/80 dark:text-amber-300/80">· approved by {pq.decidedBy}</span>{/if}
                                    </p>
                                    {#if pq.reason}
                                        <p class="mt-0.5 leading-relaxed whitespace-pre-line">{pq.reason}</p>
                                    {/if}
                                </div>
                            {/if}

                            {#if project.description}
                                <p class="text-sm text-ds-text-secondary leading-relaxed line-clamp-2">{@render highlighted(project.description)}</p>
                            {/if}

                            {#if project.repoUrl || project.playableUrl}
                                <div class="flex flex-col gap-0.5 text-xs text-ds-text-secondary">
                                    {#if project.repoUrl}
                                        <span class="truncate">Code: {@render highlighted(project.repoUrl)}</span>
                                    {/if}
                                    {#if project.playableUrl}
                                        <span class="truncate">Playable: {@render highlighted(project.playableUrl)}</span>
                                    {/if}
                                </div>
                            {/if}

                            <div class="flex flex-wrap items-center gap-4 text-xs text-ds-text-secondary pt-2 border-t border-ds-border">
                                <span>{project.submissionCount} submission{project.submissionCount === 1 ? '' : 's'}</span>
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
                {#if filteredProjects.length > visibleProjects.length}
                    <div use:infiniteScroll class="py-4 text-center text-sm text-ds-text-secondary">
                        Loading more… ({filteredProjects.length - visibleProjects.length} remaining)
                    </div>
                {/if}
            {/if}
        </section>
    </div>
</div>
