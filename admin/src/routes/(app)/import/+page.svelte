<script lang="ts">
    import { type components } from '$lib/api';
    import { Button, Card } from '$lib/components';

    type ImportCsvResponse = components['schemas']['ImportCsvResponse'];

    let file = $state<File | null>(null);
    let uploading = $state(false);
    let result = $state<ImportCsvResponse | null>(null);
    let errorMessage = $state('');
    let exporting = $state(false);

    function handleFileChange(e: Event) {
        const input = e.target as HTMLInputElement;
        file = input.files?.[0] ?? null;
        result = null;
        errorMessage = '';
    }

    async function handleExport() {
        if (exporting) return;
        exporting = true;
        try {
            const res = await fetch('/api/admin/export/csv', { credentials: 'include' });
            if (!res.ok) {
                errorMessage = `Export failed (${res.status})`;
                return;
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'horizons-users-export.csv';
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            errorMessage = err instanceof Error ? err.message : 'Export failed';
        } finally {
            exporting = false;
        }
    }

    async function handleUpload() {
        if (!file || uploading) return;
        uploading = true;
        result = null;
        errorMessage = '';

        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch('/api/admin/import/csv', {
                method: 'POST',
                body: formData,
                credentials: 'include',
            });

            if (!res.ok) {
                const body = await res.json().catch(() => null);
                errorMessage = body?.message || `Upload failed (${res.status})`;
                return;
            }

            result = await res.json();
        } catch (err) {
            errorMessage = err instanceof Error ? err.message : 'Upload failed';
        } finally {
            uploading = false;
        }
    }
</script>

<div class="p-6"><div class="mx-auto max-w-4xl space-y-6">
    <h1 class="text-3xl font-bold">Import YSWS CSV</h1>
    <p class="text-sm text-ds-text-secondary">
        Upload a YSWS project submissions CSV to bulk-import users and projects.
        Rows with overlapping GitHub URLs or Hackatime projects will be skipped.
    </p>

    <Card class="p-6 space-y-4">
        <h2 class="text-xl font-semibold">Export Users CSV</h2>
        <p class="text-sm text-ds-text-secondary">
            Export all users with Cachet username, Slack ID, and lifecycle milestones (sign-up, Hackatime link, first project, first submission, pinned event).
        </p>
        <Button onclick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export CSV'}
        </Button>
    </Card>

    <Card class="p-6 space-y-4">
        <h2 class="text-xl font-semibold">Upload CSV</h2>

        <div class="flex items-center gap-3">
            <input
                type="file"
                accept=".csv"
                onchange={handleFileChange}
                class="text-sm text-ds-text file:mr-3 file:rounded-lg file:border file:border-ds-border file:bg-ds-surface2 file:px-3 file:py-1.5 file:text-sm file:text-ds-text file:cursor-pointer"
            />
            <Button onclick={handleUpload} disabled={!file || uploading}>
                {uploading ? 'Importing...' : 'Import'}
            </Button>
        </div>

        {#if file}
            <p class="text-xs text-ds-text-secondary">Selected: {file.name}</p>
        {/if}

        {#if errorMessage}
            <div class="rounded-xl border border-red-500 bg-red-600/10 p-4 text-sm text-red-400">
                {errorMessage}
            </div>
        {/if}
    </Card>

    {#if result}
        <Card class="p-6 space-y-4">
            <h2 class="text-xl font-semibold">Results</h2>

            <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div class="rounded-xl border border-ds-border bg-ds-surface2/50 p-4 text-center">
                    <p class="text-2xl font-bold text-ds-text">{result.total}</p>
                    <p class="text-xs text-ds-text-secondary">Total Rows</p>
                </div>
                <div class="rounded-xl border border-ds-border bg-ds-surface2/50 p-4 text-center">
                    <p class="text-2xl font-bold text-green-600">{result.projectsCreated}</p>
                    <p class="text-xs text-ds-text-secondary">Projects Created</p>
                </div>
                <div class="rounded-xl border border-ds-border bg-ds-surface2/50 p-4 text-center">
                    <p class="text-2xl font-bold text-blue-500">{result.usersCreated}</p>
                    <p class="text-xs text-ds-text-secondary">Users Created</p>
                </div>
                <div class="rounded-xl border border-ds-border bg-ds-surface2/50 p-4 text-center">
                    <p class="text-2xl font-bold text-yellow-500">{result.skipped}</p>
                    <p class="text-xs text-ds-text-secondary">Skipped</p>
                </div>
            </div>

            {#if result.errors.length > 0}
                <div class="space-y-2">
                    <h3 class="text-sm font-semibold text-red-400">Errors ({result.errors.length})</h3>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead class="bg-ds-surface2/50">
                                <tr>
                                    <th class="px-3 py-2 text-left text-ds-text-secondary">Row</th>
                                    <th class="px-3 py-2 text-left text-ds-text-secondary">Email</th>
                                    <th class="px-3 py-2 text-left text-ds-text-secondary">Error</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-ds-border">
                                {#each result.errors as err}
                                    <tr>
                                        <td class="px-3 py-2 text-ds-text">{err.row}</td>
                                        <td class="px-3 py-2 text-ds-text">{err.email}</td>
                                        <td class="px-3 py-2 text-red-400">{err.message}</td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                </div>
            {/if}

            {#if result.skippedDetails.length > 0}
                <div class="space-y-2">
                    <h3 class="text-sm font-semibold text-yellow-500">Skipped ({result.skippedDetails.length})</h3>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead class="bg-ds-surface2/50">
                                <tr>
                                    <th class="px-3 py-2 text-left text-ds-text-secondary">Row</th>
                                    <th class="px-3 py-2 text-left text-ds-text-secondary">Email</th>
                                    <th class="px-3 py-2 text-left text-ds-text-secondary">Reason</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-ds-border">
                                {#each result.skippedDetails as skip}
                                    <tr>
                                        <td class="px-3 py-2 text-ds-text">{skip.row}</td>
                                        <td class="px-3 py-2 text-ds-text">{skip.email}</td>
                                        <td class="px-3 py-2 text-yellow-400">{skip.reason}</td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                </div>
            {/if}
        </Card>
    {/if}
</div></div>
