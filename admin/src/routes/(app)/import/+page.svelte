<script lang="ts">
    import { type components } from '$lib/api';
    import { Button, Card } from '$lib/components';

    type ImportCsvResponse = components['schemas']['ImportCsvResponse'];

    const IMPORT_FIELDS = [
        { key: 'Email', label: 'Email', required: true },
        { key: 'First Name', label: 'First Name', required: false },
        { key: 'Last Name', label: 'Last Name', required: false },
        { key: 'Code URL', label: 'Code URL', required: false },
        { key: 'Description', label: 'Description', required: false },
        { key: 'hackatime_project_name', label: 'Hackatime Project', required: false },
        { key: 'Slack ID', label: 'Slack ID', required: false },
    ] as const;

    let file = $state<File | null>(null);
    let uploading = $state(false);
    let result = $state<ImportCsvResponse | null>(null);
    let errorMessage = $state('');
    let exporting = $state(false);

    let csvHeaders = $state<string[]>([]);
    let csvRows = $state<string[][]>([]);
    let fieldMap = $state<Record<string, string>>({});

    let mappedPreview = $derived.by(() => {
        const activeMappings = IMPORT_FIELDS.filter(f => fieldMap[f.key]);
        if (activeMappings.length === 0) return [];

        return csvRows.slice(0, 5).map(row =>
            activeMappings.map(f => {
                const srcIdx = csvHeaders.indexOf(fieldMap[f.key]);
                return srcIdx >= 0 ? (row[srcIdx] ?? '') : '';
            })
        );
    });

    let activeMappings = $derived(IMPORT_FIELDS.filter(f => fieldMap[f.key]));

    let emailMapped = $derived(!!fieldMap['Email']);

    function parseCSV(text: string): string[][] {
        const rows: string[][] = [];
        let current = '';
        let inQuotes = false;
        let row: string[] = [];

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (inQuotes) {
                if (char === '"' && text[i + 1] === '"') {
                    current += '"';
                    i++;
                } else if (char === '"') {
                    inQuotes = false;
                } else {
                    current += char;
                }
            } else if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                row.push(current.trim());
                current = '';
            } else if (char === '\n' || (char === '\r' && text[i + 1] === '\n')) {
                row.push(current.trim());
                if (row.some(cell => cell !== '')) rows.push(row);
                row = [];
                current = '';
                if (char === '\r') i++;
            } else {
                current += char;
            }
        }
        if (current || row.length > 0) {
            row.push(current.trim());
            if (row.some(cell => cell !== '')) rows.push(row);
        }
        return rows;
    }

    function autoDetectMappings(headers: string[]) {
        const map: Record<string, string> = {};
        const headersLower = headers.map(h => h.toLowerCase().trim());

        for (const field of IMPORT_FIELDS) {
            const exact = headers.find(h => h === field.key);
            if (exact) {
                map[field.key] = exact;
                continue;
            }
            const caseInsensitive = headers.find(
                (_, i) => headersLower[i] === field.key.toLowerCase()
            );
            if (caseInsensitive) {
                map[field.key] = caseInsensitive;
            }
        }
        return map;
    }

    function handleFileChange(e: Event) {
        const input = e.target as HTMLInputElement;
        file = input.files?.[0] ?? null;
        result = null;
        errorMessage = '';
        csvHeaders = [];
        csvRows = [];
        fieldMap = {};

        if (file) {
            const reader = new FileReader();
            reader.onload = () => {
                const text = reader.result as string;
                const rows = parseCSV(text);
                if (rows.length > 0) {
                    csvHeaders = rows[0];
                    csvRows = rows.slice(1);
                    fieldMap = autoDetectMappings(csvHeaders);
                }
            };
            reader.readAsText(file);
        }
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

    function buildMappedCsv(): string {
        const mapped = IMPORT_FIELDS.filter(f => fieldMap[f.key]);
        const headerLine = mapped.map(f => f.key).join(',');

        const dataLines = csvRows.map(row =>
            mapped.map(f => {
                const srcIdx = csvHeaders.indexOf(fieldMap[f.key]);
                const val = srcIdx >= 0 ? (row[srcIdx] ?? '') : '';
                if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                    return `"${val.replace(/"/g, '""')}"`;
                }
                return val;
            }).join(',')
        );

        return [headerLine, ...dataLines].join('\n');
    }

    async function handleUpload() {
        if (!file || uploading || !emailMapped) return;
        uploading = true;
        result = null;
        errorMessage = '';

        try {
            const mappedCsv = buildMappedCsv();
            const blob = new Blob([mappedCsv], { type: 'text/csv' });
            const mappedFile = new File([blob], file.name, { type: 'text/csv' });

            const formData = new FormData();
            formData.append('file', mappedFile);

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
    <h1 class="text-3xl font-bold">Import/Export CSV</h1>
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

        <input
            type="file"
            accept=".csv"
            onchange={handleFileChange}
            class="text-sm text-ds-text file:mr-3 file:rounded-lg file:border file:border-ds-border file:bg-ds-surface2 file:px-3 file:py-1.5 file:text-sm file:text-ds-text file:cursor-pointer"
        />

        {#if errorMessage}
            <div class="rounded-xl border border-red-500 bg-red-600/10 p-4 text-sm text-red-400">
                {errorMessage}
            </div>
        {/if}
    </Card>

    {#if csvHeaders.length > 0}
        <Card class="p-6 space-y-4">
            <h2 class="text-xl font-semibold">Field Mapping</h2>
            <p class="text-sm text-ds-text-secondary">
                Map your CSV columns to import fields. Only mapped fields will be imported.
            </p>

            <div class="grid gap-3 sm:grid-cols-2">
                {#each IMPORT_FIELDS as field}
                    <div class="flex flex-col gap-1">
                        <label for="map-{field.key}" class="text-xs font-medium text-ds-text-secondary">
                            {field.label}
                            {#if field.required}
                                <span class="text-red-400">*</span>
                            {/if}
                        </label>
                        <select
                            id="map-{field.key}"
                            class="rounded-lg border border-ds-border bg-ds-surface2 px-3 py-1.5 text-sm text-ds-text"
                            value={fieldMap[field.key] ?? ''}
                            onchange={(e) => {
                                const val = (e.target as HTMLSelectElement).value;
                                if (val) {
                                    fieldMap[field.key] = val;
                                } else {
                                    delete fieldMap[field.key];
                                    fieldMap = fieldMap;
                                }
                            }}
                        >
                            <option value="">— skip —</option>
                            {#each csvHeaders as header}
                                <option value={header}>{header}</option>
                            {/each}
                        </select>
                    </div>
                {/each}
            </div>

            {#if !emailMapped}
                <p class="text-xs text-red-400">Email mapping is required to import.</p>
            {/if}

            <Button onclick={handleUpload} disabled={!emailMapped || uploading}>
                {uploading ? 'Importing...' : 'Import'}
            </Button>
        </Card>

        {#if activeMappings.length > 0 && mappedPreview.length > 0}
            <Card class="p-6 space-y-4">
                <h2 class="text-xl font-semibold">Preview</h2>
                <p class="text-sm text-ds-text-secondary">
                    Showing first {mappedPreview.length} rows with mapped fields only.
                </p>
                <div class="overflow-x-auto rounded-lg border border-ds-border">
                    <table class="w-full text-sm">
                        <thead class="bg-ds-surface2/50">
                            <tr>
                                {#each activeMappings as field}
                                    <th class="whitespace-nowrap px-3 py-2 text-left text-ds-text-secondary">{field.label}</th>
                                {/each}
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-ds-border">
                            {#each mappedPreview as row}
                                <tr>
                                    {#each row as cell}
                                        <td class="whitespace-nowrap px-3 py-2 text-ds-text">{cell}</td>
                                    {/each}
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            </Card>
        {/if}
    {/if}

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
