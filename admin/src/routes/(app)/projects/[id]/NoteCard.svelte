<script lang="ts">
    import { api } from '$lib/api';
    import { Skeleton } from '$lib/components';
    import { Pencil } from 'lucide-svelte';

    interface Props {
        title: string;
        targetType: 'project' | 'user';
        targetId: number;
        content: string;
        loading?: boolean;
        // Tint overrides so the user (amber) and project (purple) cards can differ.
        cardClass?: string;
        labelClass?: string;
    }

    let {
        title,
        targetType,
        targetId,
        content = $bindable(''),
        loading = false,
        cardClass = 'border-rv-border',
        labelClass = 'text-rv-dim',
    }: Props = $props();

    let editing = $state(false);
    let draft = $state('');
    let saving = $state(false);
    let saveError = $state<string | null>(null);

    function startEdit() {
        draft = content;
        editing = true;
        saveError = null;
    }

    function cancelEdit() {
        editing = false;
        saveError = null;
    }

    async function save() {
        saving = true;
        saveError = null;
        try {
            const path =
                targetType === 'project'
                    ? ('/api/reviewer/projects/{id}/notes' as const)
                    : ('/api/reviewer/users/{id}/notes' as const);
            const { error } = await api.PUT(path, {
                params: { path: { id: targetId } },
                body: { content: draft },
            });
            if (error) throw new Error(`Failed to save ${targetType} note`);
            content = draft;
            editing = false;
        } catch (e) {
            saveError = e instanceof Error ? e.message : 'Save failed';
        } finally {
            saving = false;
        }
    }
</script>

<div class="rounded-lg border p-3 flex flex-col gap-2 transition-shadow duration-150 has-[.edit-pencil:hover]:shadow-[inset_0_0_0_999px_rgba(245,166,35,0.08)] {cardClass}">
    <div class="flex items-center gap-1.5">
        <span class="text-[11px] uppercase tracking-wider font-semibold {labelClass}">{title}</span>
        {#if !editing && !loading}
            <button
                class="edit-pencil bg-transparent border-none p-0 cursor-pointer {labelClass} hover:opacity-70 flex items-center"
                onclick={startEdit}
                title="Edit {title.toLowerCase()}"
                aria-label="Edit {title.toLowerCase()}"
            >
                <Pencil size={13} />
            </button>
        {/if}
    </div>
    {#if loading}
        <Skeleton class="h-4 w-2/3" />
    {:else if editing}
        <!-- svelte-ignore a11y_autofocus -->
        <textarea
            class="w-full bg-rv-bg border border-rv-border rounded-md p-2 text-rv-text text-[13px] leading-relaxed resize-y min-h-[70px] focus:outline-none focus:border-rv-accent"
            bind:value={draft}
            maxlength={1000}
            placeholder="Notes about this {targetType}..."
            autofocus
        ></textarea>
        <div class="flex items-center gap-1.5">
            <button
                class="bg-rv-surface2 border border-rv-border text-rv-text px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer transition-all duration-150 hover:border-rv-accent disabled:opacity-50 disabled:cursor-not-allowed"
                onclick={save}
                disabled={saving}
            >
                {saving ? 'Saving…' : 'Save'}
            </button>
            <button
                class="bg-transparent border border-rv-border text-rv-dim px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer transition-all duration-150 hover:text-rv-text disabled:opacity-50 disabled:cursor-not-allowed"
                onclick={cancelEdit}
                disabled={saving}
            >
                Cancel
            </button>
            {#if saveError}
                <span class="text-[11px] text-rv-red truncate">{saveError}</span>
            {/if}
        </div>
    {:else if content.trim()}
        <p class="m-0 text-[13px] leading-relaxed whitespace-pre-wrap break-words text-rv-text">{content}</p>
    {:else}
        <p class="m-0 text-[13px] text-rv-dim italic">None</p>
    {/if}
</div>
