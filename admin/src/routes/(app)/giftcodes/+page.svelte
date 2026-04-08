<script lang="ts">
    import { onMount } from 'svelte';
    import { api, type components } from '$lib/api';
    import { Button, TextField, Card } from '$lib/components';

    type GiftCodeResponse = components['schemas']['GiftCodeResponse'];
    type SendGiftCodeResult = components['schemas']['SendGiftCodeResult'];

    let giftCodes = $state<GiftCodeResponse[]>([]);
    let giftCodesLoaded = $state(false);
    let giftCodesLoading = $state(false);
    let giftCodeForm = $state<{
        emails: string;
        itemDescription: string;
        imageUrl: string;
        filloutUrl: string;
    }>({
        emails: '',
        itemDescription: '',
        imageUrl: '',
        filloutUrl: ''
    });
    let giftCodeSending = $state(false);
    let giftCodeError = $state('');
    let giftCodeSuccess = $state('');
    let giftCodeResults = $state<SendGiftCodeResult[]>([]);

    function formatDate(value: string) {
        return new Date(value).toLocaleString();
    }

    async function loadGiftCodes() {
        giftCodesLoading = true;
        try {
            const { data, error } = await api.GET('/api/admin/gift-codes');
            if (data) {
                giftCodes = data as GiftCodeResponse[];
                giftCodesLoaded = true;
            }
            if (error) {
                console.error('Failed to load gift codes:', error);
            }
        } catch (err) {
            console.error('Failed to load gift codes:', err);
        } finally {
            giftCodesLoading = false;
        }
    }

    function resetGiftCodeForm() {
        giftCodeForm = {
            emails: '',
            itemDescription: '',
            imageUrl: '',
            filloutUrl: ''
        };
        giftCodeError = '';
        giftCodeSuccess = '';
        giftCodeResults = [];
    }

    async function sendGiftCodes() {
        giftCodeSending = true;
        giftCodeError = '';
        giftCodeSuccess = '';
        giftCodeResults = [];

        const emailList = giftCodeForm.emails
            .split(/[\n,;]+/)
            .map((e) => e.trim())
            .filter((e) => e.length > 0 && e.includes('@'));

        if (emailList.length === 0) {
            giftCodeError = 'Please enter at least one valid email address';
            giftCodeSending = false;
            return;
        }

        if (!giftCodeForm.itemDescription.trim()) {
            giftCodeError = 'Please enter an item description';
            giftCodeSending = false;
            return;
        }

        if (!giftCodeForm.imageUrl.trim()) {
            giftCodeError = 'Please enter an image URL';
            giftCodeSending = false;
            return;
        }

        if (!giftCodeForm.filloutUrl.trim()) {
            giftCodeError = 'Please enter a Fillout URL';
            giftCodeSending = false;
            return;
        }

        try {
            const { data, error } = await api.POST('/api/admin/gift-codes/send', {
                body: {
                    emails: emailList,
                    itemDescription: giftCodeForm.itemDescription,
                    imageUrl: giftCodeForm.imageUrl,
                    filloutUrl: giftCodeForm.filloutUrl
                }
            });

            if (error) {
                giftCodeError = (error as any)?.message ?? 'Failed to send gift codes';
                return;
            }

            if (data) {
                giftCodeResults = data.results || [];
                giftCodeSuccess = `Sent ${data.successful}/${data.total} emails successfully`;

                if (data.successful > 0) {
                    await loadGiftCodes();
                }
            }
        } catch (err) {
            giftCodeError = err instanceof Error ? err.message : 'Failed to send gift codes';
        } finally {
            giftCodeSending = false;
        }
    }

    onMount(() => {
        loadGiftCodes();
    });
</script>

<div class="p-6"><div class="mx-auto max-w-6xl space-y-6">
<section class="space-y-4">
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 class="text-2xl font-semibold">Gift Codes</h2>
        <Button variant="ghost" onclick={loadGiftCodes}>
            Refresh
        </Button>
    </div>

    <Card class="p-6 space-y-6">
        <h3 class="text-lg font-semibold">Send Gift Code Emails</h3>

        <div class="grid gap-4 md:grid-cols-2">
            <div class="space-y-2 md:col-span-2">
                <label class="text-sm font-medium text-ds-text-secondary" for="gift-emails"
                    >Email Addresses *</label
                >
                <TextField
                    multiline
                    id="gift-emails"
                    rows={4}
                    placeholder="Enter email addresses (one per line, or comma/semicolon separated)&#10;example@email.com&#10;another@email.com"
                    bind:value={giftCodeForm.emails}
                />
            </div>
            <div class="space-y-2">
                <label class="text-sm font-medium text-ds-text-secondary" for="gift-description"
                    >Item Description *</label
                >
                <TextField
                    id="gift-description"
                    placeholder="e.g., Midnight Sticker Sheet"
                    bind:value={giftCodeForm.itemDescription}
                />
            </div>
            <div class="space-y-2">
                <label class="text-sm font-medium text-ds-text-secondary" for="gift-image"
                    >Image URL *</label
                >
                <TextField
                    id="gift-image"
                    placeholder="https://example.com/image.png"
                    bind:value={giftCodeForm.imageUrl}
                />
            </div>
            <div class="space-y-2 md:col-span-2">
                <label class="text-sm font-medium text-ds-text-secondary" for="gift-fillout"
                    >Fillout Form URL *</label
                >
                <TextField
                    id="gift-fillout"
                    placeholder="https://forms.fillout.com/your-form"
                    bind:value={giftCodeForm.filloutUrl}
                />
                <p class="text-xs text-ds-text-placeholder">
                    Parameters first_name, last_name, email, and lfd_rec will be automatically
                    appended
                </p>
            </div>
        </div>

        {#if giftCodeForm.imageUrl}
            <div class="flex items-center gap-4">
                <div
                    class="w-24 h-24 rounded-lg border border-ds-border overflow-hidden bg-ds-surface2"
                >
                    <img
                        src={giftCodeForm.imageUrl}
                        alt="Preview"
                        class="w-full h-full object-cover"
                        onerror={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                        }}
                    />
                </div>
                <p class="text-sm text-ds-text-secondary">Image Preview</p>
            </div>
        {/if}

        <div class="flex flex-wrap gap-3 items-center">
            <Button
                variant="approve"
                onclick={sendGiftCodes}
                disabled={giftCodeSending ||
                    !giftCodeForm.emails ||
                    !giftCodeForm.itemDescription ||
                    !giftCodeForm.imageUrl ||
                    !giftCodeForm.filloutUrl}
            >
                {giftCodeSending ? 'Sending...' : 'Send Gift Code Emails'}
            </Button>
            <Button
                variant="default"
                onclick={resetGiftCodeForm}
            >
                Clear Form
            </Button>
            {#if giftCodeError}
                <span class="text-red-600 text-sm">{giftCodeError}</span>
            {/if}
            {#if giftCodeSuccess}
                <span class="text-green-700 text-sm">{giftCodeSuccess}</span>
            {/if}
        </div>

        {#if giftCodeResults.length > 0}
            <div class="border-t border-ds-border pt-4 space-y-2">
                <h4 class="text-sm font-semibold text-ds-text-secondary">Send Results</h4>
                <div class="max-h-48 overflow-y-auto space-y-1">
                    {#each giftCodeResults as result}
                        <div class="flex items-center gap-2 text-sm">
                            {#if result.success}
                                <span class="text-green-700">&#x2713;</span>
                            {:else}
                                <span class="text-red-600">&#x2717;</span>
                            {/if}
                            <span class="text-ds-text-secondary">{result.email}</span>
                            {#if result.success}
                                <span class="text-ds-text-placeholder font-mono text-xs">{result.code}</span>
                            {:else}
                                <span class="text-red-600 text-xs">{result.error}</span>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
    </Card>

    {#if giftCodesLoading}
        <div class="py-12 text-center text-ds-text-secondary">Loading gift codes...</div>
    {:else if giftCodes.length === 0}
        <div class="py-12 text-center text-ds-text-secondary">No gift codes sent yet.</div>
    {:else}
        <div
            class="rounded-lg border border-ds-border bg-ds-surface backdrop-blur overflow-hidden"
        >
            <table class="w-full">
                <thead class="bg-ds-surface2/50">
                    <tr>
                        <th class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary"
                            >Date</th
                        >
                        <th class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary"
                            >Email</th
                        >
                        <th class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary"
                            >Code</th
                        >
                        <th class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary"
                            >Item</th
                        >
                        <th class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary"
                            >Status</th
                        >
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-700">
                    {#each giftCodes as giftCode (giftCode.giftCodeId)}
                        <tr class="hover:bg-ds-surface2/30">
                            <td class="px-4 py-3 text-sm text-ds-text-secondary"
                                >{formatDate(giftCode.createdAt)}</td
                            >
                            <td class="px-4 py-3">
                                <p class="text-sm font-medium text-ds-text">
                                    {giftCode.email}
                                </p>
                                {#if giftCode.firstName || giftCode.lastName}
                                    <p class="text-xs text-ds-text-secondary">
                                        {[giftCode.firstName, giftCode.lastName].filter(Boolean).join(' ')}
                                    </p>
                                {/if}
                            </td>
                            <td class="px-4 py-3">
                                <span class="font-mono text-sm text-ds-text-secondary"
                                    >{giftCode.code}</span
                                >
                            </td>
                            <td class="px-4 py-3">
                                <div class="flex items-center gap-2">
                                    {#if giftCode.imageUrl}
                                        <img
                                            src={giftCode.imageUrl}
                                            alt=""
                                            class="w-8 h-8 rounded object-cover"
                                        />
                                    {/if}
                                    <span class="text-sm text-ds-text-secondary"
                                        >{giftCode.itemDescription}</span
                                    >
                                </div>
                            </td>
                            <td class="px-4 py-3">
                                {#if giftCode.isClaimed}
                                    <span
                                        class="px-2 py-1 text-xs rounded bg-green-500/20 border border-green-400 text-green-700"
                                        >Claimed</span
                                    >
                                {:else if giftCode.emailSentAt}
                                    <span
                                        class="px-2 py-1 text-xs rounded bg-blue-500/20 border border-blue-400 text-blue-700"
                                        >Sent</span
                                    >
                                {:else}
                                    <span
                                        class="px-2 py-1 text-xs rounded bg-yellow-500/20 border border-yellow-400 text-yellow-600"
                                        >Pending</span
                                    >
                                {/if}
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</section>
</div></div>
