<script lang="ts">
    import { env } from "$env/dynamic/public";
    import type { PageData } from "./$types";

    type AdminLightUser = {
        userId: number;
        firstName: string | null;
        lastName: string | null;
        email: string;
        birthday: string | null;
        addressLine1: string | null;
        addressLine2: string | null;
        city: string | null;
        state: string | null;
        country: string | null;
        zipCode: string | null;
        hackatimeAccount: string | null;
        slackUserId: string | null;
        isFraud: boolean;
        isSus: boolean;
        createdAt: string;
        updatedAt: string;
    };

    type AdminSubmission = {
        submissionId: number;
        approvalStatus: string;
        approvedHours: number | null;
        hoursJustification: string | null; // User feedback - what user submits with their submission
        description: string | null;
        playableUrl: string | null;
        repoUrl: string | null;
        screenshotUrl: string | null;
        createdAt: string;
        updatedAt: string;
        project: {
            projectId: number;
            projectTitle: string;
            projectType: string;
            description: string | null;
            playableUrl: string | null;
            repoUrl: string | null;
            screenshotUrl: string | null;
            nowHackatimeHours: number | null;
            nowHackatimeProjects: string[] | null;
            approvedHours: number | null;
            hoursJustification: string | null; // Admin's justification - synced to Airtable
            adminComment: string | null;
            isFraud: boolean;
            user: AdminLightUser;
        };
    };

    type AdminProject = {
        projectId: number;
        projectTitle: string;
        description: string | null;
        projectType: string;
        nowHackatimeHours: number | null;
        nowHackatimeProjects: string[] | null;
        playableUrl: string | null;
        repoUrl: string | null;
        screenshotUrl: string | null;
        approvedHours: number | null;
        hoursJustification: string | null; // Admin's justification - synced to Airtable
        isLocked: boolean;
        isFraud: boolean;
        createdAt: string;
        updatedAt: string;
        user: AdminLightUser;
        submissions: {
            submissionId: number;
            approvalStatus: string;
            approvedHours: number | null;
            createdAt: string;
        }[];
    };

    type AdminUser = AdminLightUser & {
        role: string;
        onboardComplete: boolean;
        projects: AdminProject[];
    };

    type AdminMetrics = {
        totalHackatimeHours: number;
        totalApprovedHours: number;
        totalUsers: number;
        totalProjects: number;
        totalSubmittedHackatimeHours: number;
    };

    type ReviewerStats = {
        reviewerId: string;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
        approved: number;
        rejected: number;
        total: number;
        lastReviewedAt: string | null;
    };

    type Tab = "submissions" | "projects" | "users" | "shop" | "giftcodes" | "events";

    type Event = {
        eventId: number;
        slug: string;
        title: string;
        description: string | null;
        imageUrl: string | null;
        location: string | null;
        startDate: string;
        endDate: string;
        hourCost: number;
        isActive: boolean;
        createdAt: string;
        updatedAt: string;
        _count?: { pinnedBy: number };
    };
    type StatusFilter = "all" | "pending" | "approved" | "rejected";
    type SortField =
        | "createdAt"
        | "projectTitle"
        | "userName"
        | "approvalStatus"
        | "nowHackatimeHours"
        | "approvedHours";
    type SortDirection = "asc" | "desc";

    type Shop = {
        shopId: number;
        slug: string;
        description: string | null;
        isActive: boolean;
        isPublic: boolean;
        createdAt: string;
        updatedAt: string;
    };

    type ShopItemVariant = {
        variantId: number;
        itemId: number;
        name: string;
        cost: number;
        isActive: boolean;
        createdAt: string;
        updatedAt: string;
    };

    type ShopItem = {
        itemId: number;
        name: string;
        description: string | null;
        imageUrl: string | null;
        cost: number;
        maxPerUser: number | null;
        isActive: boolean;
        createdAt: string;
        updatedAt: string;
        variants?: ShopItemVariant[];
    };

    type ShopTransaction = {
        transactionId: number;
        userId: number;
        itemId: number;
        variantId: number | null;
        itemDescription: string;
        cost: number;
        isFulfilled: boolean;
        fulfilledAt: string | null;
        createdAt: string;
        user: {
            userId: number;
            firstName: string;
            lastName: string;
            email: string;
            addressLine1?: string | null;
            addressLine2?: string | null;
            city?: string | null;
            state?: string | null;
            zipCode?: string | null;
            country?: string | null;
        };
        item: {
            itemId: number;
            name: string;
        };
        variant?: {
            variantId: number;
            name: string;
        } | null;
    };

    type GiftCode = {
        id: string;
        code: string;
        email: string;
        firstName: string | null;
        lastName: string | null;
        itemDescription: string;
        imageUrl: string;
        filloutUrl: string;
        isClaimed: boolean;
        claimedAt: string | null;
        emailSentAt: string | null;
        createdAt: string;
    };

    const projectTypes = [
        "personal_website",
        "platformer_game",
        "website",
        "game",
        "terminal_cli",
        "desktop_app",
        "mobile_app",
        "wildcard",
    ] as const;
    const statusOptions = ["pending", "approved", "rejected"] as const;

    let { data }: { data: PageData } = $props();

    const toSubmissionDraft = (submission: AdminSubmission) => ({
        approvalStatus: submission.approvalStatus,
        approvedHours:
            submission.project.approvedHours !== null
                ? submission.project.approvedHours.toString()
                : submission.project.nowHackatimeHours !== null
                  ? submission.project.nowHackatimeHours.toFixed(1)
                  : "",
        // User feedback - what admin sends to user via email
        userFeedback: submission.hoursJustification ?? "",
        // Hours justification - admin's internal notes for Airtable
        hoursJustification: submission.project.hoursJustification ?? "",
        adminComment: submission.project.adminComment ?? "",
        sendEmailNotification: false,
    });

    const buildSubmissionDrafts = (list: AdminSubmission[]) => {
        const drafts: Record<
            number,
            {
                approvalStatus: string;
                approvedHours: string;
                userFeedback: string;
                hoursJustification: string;
                adminComment: string;
                sendEmailNotification: boolean;
            }
        > = {};
        for (const submission of list) {
            drafts[submission.submissionId] = toSubmissionDraft(submission);
        }
        return drafts;
    };

    let activeTab = $state<Tab>("submissions");
    let submissions = $state<AdminSubmission[]>(data.submissions ?? []);
    let projects = $state<AdminProject[]>(data.projects ?? []);
    let users = $state<AdminUser[]>(data.users ?? []);
    let metrics = $state<AdminMetrics>(
        data.metrics ?? {
            totalHackatimeHours: 0,
            totalApprovedHours: 0,
            totalUsers: 0,
            totalProjects: 0,
            totalSubmittedHackatimeHours: 0,
        },
    );
    let shops = $state<Shop[]>([]);
    let selectedShopId = $state<number | null>(null);
    let shopItems = $state<ShopItem[]>(data.shopItems ?? []);
    let shopTransactions = $state<ShopTransaction[]>(
        data.shopTransactions ?? [],
    );

    let submissionsLoaded = $state(false);
    let projectsLoaded = $state(false);
    let usersLoaded = $state(false);
    let shopLoaded = $state(false);
    let initialLoadDone = $state(false);

    let searchQuery = $state("");
    let selectedStatuses = $state<Set<string>>(new Set(["pending"]));
    let selectedProjectTypes = $state<Set<string>>(new Set());
    let sortField = $state<SortField>("createdAt");
    let sortDirection = $state<SortDirection>("asc");

    let showFraudProjects = $state(true);
    let showSusProjects = $state(true);
    let showFraudSubmissions = $state(true);
    let showSusSubmissions = $state(true);

    function getDefaultDateRange() {
        const today = new Date();
        const defaultStart = new Date(env.PUBLIC_HACKATIME_CUTOFF_DATE || "2025-10-10");
        return {
            startDate: defaultStart.toISOString().split("T")[0],
            endDate: today.toISOString().split("T")[0],
        };
    }

    function loadDateRangeFromStorage() {
        if (typeof window === "undefined") return getDefaultDateRange();
        const stored = localStorage.getItem("admin-submissions-date-range");
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                return {
                    startDate:
                        parsed.startDate || getDefaultDateRange().startDate,
                    endDate: parsed.endDate || getDefaultDateRange().endDate,
                };
            } catch {
                return getDefaultDateRange();
            }
        }
        return getDefaultDateRange();
    }

    function saveDateRangeToStorage(startDate: string, endDate: string) {
        if (typeof window !== "undefined") {
            localStorage.setItem(
                "admin-submissions-date-range",
                JSON.stringify({ startDate, endDate }),
            );
        }
    }

    const defaultDateRange = loadDateRangeFromStorage();
    let dateRangeStart = $state(defaultDateRange.startDate);
    let dateRangeEnd = $state(defaultDateRange.endDate);

    $effect(() => {
        saveDateRangeToStorage(dateRangeStart, dateRangeEnd);
    });

    function generateBillyLink(hackatimeAccount: string | null): string | null {
        if (!hackatimeAccount || hackatimeAccount.trim() === "") return null;
        const start = dateRangeStart || getDefaultDateRange().startDate;
        const end = dateRangeEnd || getDefaultDateRange().endDate;
        return `https://billy.3kh0.net/?u=${hackatimeAccount}&d=${start}-${end}`;
    }

    const statusIdFor = (submissionId: number) =>
        `submission-${submissionId}-status`;
    const hoursIdFor = (submissionId: number) =>
        `submission-${submissionId}-hours`;
    const userFeedbackIdFor = (submissionId: number) =>
        `submission-${submissionId}-user-feedback`;
    const justificationIdFor = (submissionId: number) =>
        `submission-${submissionId}-justification`;

    const apiUrl = data.apiUrl;

    let submissionsLoading = $state(false);
    let projectsLoading = $state(false);
    let usersLoading = $state(false);
    let metricsLoading = $state(false);
    let shopLoading = $state(false);
    let eventsLoaded = $state(false);
    let eventsLoading = $state(false);
    let events = $state<Event[]>([]);
    let eventForm = $state<{
        slug: string;
        title: string;
        description: string;
        imageUrl: string;
        location: string;
        startDate: string;
        endDate: string;
        hourCost: string;
        isActive: boolean;
    }>({
        slug: "",
        title: "",
        description: "",
        imageUrl: "",
        location: "",
        startDate: "",
        endDate: "",
        hourCost: "",
        isActive: true,
    });
    let editingEventSlug = $state<string | null>(null);
    let eventFormSaving = $state(false);
    let eventFormError = $state("");
    let eventFormSuccess = $state("");

    let showShopManager = $state(false);
    let shopForm = $state<{ slug: string; description: string; isActive: boolean; isPublic: boolean }>({
        slug: "",
        description: "",
        isActive: true,
        isPublic: true,
    });
    let editingShopId = $state<number | null>(null);
    let shopFormSaving = $state(false);
    let shopFormError = $state("");
    let shopFormSuccess = $state("");

    let shopItemForm = $state<{
        name: string;
        description: string;
        imageUrl: string;
        cost: string;
        maxPerUser: string;
    }>({
        name: "",
        description: "",
        imageUrl: "",
        cost: "",
        maxPerUser: "",
    });
    let editingItemId = $state<number | null>(null);
    let shopItemSaving = $state(false);
    let shopItemError = $state("");
    let shopItemSuccess = $state("");
    let shopSubTab = $state<"items" | "transactions" | "transactions-by-user">(
        "items",
    );
    let selectedItemFilter = $state<number | null>(null);
    let fulfillmentFilter = $state<"all" | "fulfilled" | "unfulfilled">("all");

    let variantForm = $state<{ name: string; cost: string }>({
        name: "",
        cost: "",
    });
    let addingVariantToItemId = $state<number | null>(null);
    let editingVariantId = $state<number | null>(null);
    let variantSaving = $state(false);
    let variantError = $state("");
    let variantSuccess = $state("");
    let expandedItemVariants = $state<Record<number, boolean>>({});
    let refundingTransaction = $state<number | null>(null);
    let fulfillingTransaction = $state<number | null>(null);
    let unfulfillingTransaction = $state<number | null>(null);

    let giftCodes = $state<GiftCode[]>([]);
    let giftCodesLoaded = $state(false);
    let giftCodesLoading = $state(false);
    let giftCodeForm = $state<{
        emails: string;
        itemDescription: string;
        imageUrl: string;
        filloutUrl: string;
    }>({
        emails: "",
        itemDescription: "",
        imageUrl: "",
        filloutUrl: "",
    });
    let giftCodeSending = $state(false);
    let giftCodeError = $state("");
    let giftCodeSuccess = $state("");
    let giftCodeResults = $state<
        Array<{ email: string; code: string; success: boolean; error?: string }>
    >([]);

    let reviewerLeaderboard = $state<ReviewerStats[]>([]);
    let leaderboardLoading = $state(false);
    let leaderboardLoaded = $state(false);

    type GlobalSettings = {
        id: string;
        submissionsFrozen: boolean;
        submissionsFrozenAt: string | null;
        submissionsFrozenBy: string | null;
        updatedAt: string;
    };
    let globalSettings = $state<GlobalSettings | null>(null);
    let globalSettingsLoading = $state(false);

    type PriorityUser = {
        userId: number;
        email: string;
        firstName: string | null;
        lastName: string | null;
        totalApprovedHours: number;
        potentialHoursIfApproved: number;
        reason: string;
    };

    let priorityUsers = $state<PriorityUser[]>([]);
    let priorityUsersLoading = $state(false);
    let priorityUsersLoaded = $state(false);
    let priorityFilterEnabled = $state(false);

    type TimelineEvent = {
        type: string;
        timestamp: string;
        actor: { userId: number; firstName: string | null; lastName: string | null; email: string } | null;
        details: Record<string, any>;
    };

    type ProjectTimeline = {
        projectId: number;
        projectTitle: string;
        user: { userId: number; firstName: string | null; lastName: string | null; email: string };
        timeline: TimelineEvent[];
    };

    let timelineByProject = $state<Record<number, ProjectTimeline>>({});
    let timelineLoading = $state<Record<number, boolean>>({});
    let timelineOpen = $state<Record<number, boolean>>({});

    async function loadTimeline(projectId: number) {
        if (timelineByProject[projectId]) {
            timelineOpen = { ...timelineOpen, [projectId]: !timelineOpen[projectId] };
            return;
        }
        timelineLoading = { ...timelineLoading, [projectId]: true };
        try {
            const res = await fetch(`${apiUrl}/api/admin/projects/${projectId}/timeline`, { credentials: "include" });
            if (res.ok) {
                const data = await res.json();
                timelineByProject = { ...timelineByProject, [projectId]: data };
                timelineOpen = { ...timelineOpen, [projectId]: true };
            }
        } catch (e) {
            console.error("Failed to load timeline", e);
        } finally {
            timelineLoading = { ...timelineLoading, [projectId]: false };
        }
    }

    function timelineEventLabel(type: string): string {
        switch (type) {
            case "project_created": return "Project Created";
            case "submission": return "Submitted";
            case "resubmission": return "Resubmitted";
            case "project_updated": return "Project Updated";
            case "admin_review": return "Admin Reviewed Project";
            case "admin_update": return "Admin Updated Project Review";
            default: return type;
        }
    }

    function timelineEventColor(type: string): string {
        switch (type) {
            case "project_created": return "border-blue-500 bg-blue-500/10";
            case "submission": return "border-green-500 bg-green-500/10";
            case "resubmission": return "border-yellow-500 bg-yellow-500/10";
            case "project_updated": return "border-cyan-500 bg-cyan-500/10";
            case "admin_review": return "border-purple-500 bg-purple-500/10";
            case "admin_update": return "border-orange-500 bg-orange-500/10";
            default: return "border-gray-500 bg-gray-500/10";
        }
    }

    function timelineDotColor(type: string): string {
        switch (type) {
            case "project_created": return "bg-blue-500";
            case "submission": return "bg-green-500";
            case "resubmission": return "bg-yellow-500";
            case "project_updated": return "bg-cyan-500";
            case "admin_review": return "bg-purple-500";
            case "admin_update": return "bg-orange-500";
            default: return "bg-gray-500";
        }
    }

    const filteredTransactions = $derived(() => {
        let transactions = shopTransactions;

        if (selectedItemFilter !== null) {
            transactions = transactions.filter(
                (t) => t.itemId === selectedItemFilter,
            );
        }

        if (fulfillmentFilter === "fulfilled") {
            transactions = transactions.filter((t) => t.isFulfilled);
        } else if (fulfillmentFilter === "unfulfilled") {
            transactions = transactions.filter((t) => !t.isFulfilled);
        }

        return transactions;
    });

    const transactionsByUser = $derived(() => {
        const grouped = new Map<
            number,
            {
                user: {
                    userId: number;
                    firstName: string;
                    lastName: string;
                    email: string;
                    addressLine1?: string | null;
                    addressLine2?: string | null;
                    city?: string | null;
                    state?: string | null;
                    zipCode?: string | null;
                    country?: string | null;
                };
                transactions: ShopTransaction[];
                totalCost: number;
                fulfilledCount: number;
                pendingCount: number;
            }
        >();

        let transactionsToGroup = shopTransactions;

        if (selectedItemFilter !== null) {
            transactionsToGroup = transactionsToGroup.filter(
                (t) => t.itemId === selectedItemFilter,
            );
        }

        if (fulfillmentFilter === "fulfilled") {
            transactionsToGroup = transactionsToGroup.filter(
                (t) => t.isFulfilled,
            );
        } else if (fulfillmentFilter === "unfulfilled") {
            transactionsToGroup = transactionsToGroup.filter(
                (t) => !t.isFulfilled,
            );
        }

        for (const transaction of transactionsToGroup) {
            if (!grouped.has(transaction.userId)) {
                grouped.set(transaction.userId, {
                    user: transaction.user,
                    transactions: [],
                    totalCost: 0,
                    fulfilledCount: 0,
                    pendingCount: 0,
                });
            }
            const userGroup = grouped.get(transaction.userId)!;
            userGroup.transactions.push(transaction);
            userGroup.totalCost += transaction.cost;
            if (transaction.isFulfilled) {
                userGroup.fulfilledCount++;
            } else {
                userGroup.pendingCount++;
            }
        }

        return Array.from(grouped.values()).sort(
            (a, b) => b.totalCost - a.totalCost,
        );
    });

    let submissionDrafts = $state<
        Record<
            number,
            {
                approvalStatus: string;
                approvedHours: string;
                userFeedback: string;
                hoursJustification: string;
                adminComment: string;
                sendEmailNotification: boolean;
            }
        >
    >(buildSubmissionDrafts(data.submissions ?? []));
    let submissionSaving = $state<Record<number, boolean>>({});
    let submissionErrors = $state<Record<number, string>>({});
    let submissionSuccess = $state<Record<number, string>>({});
    let submissionRecalculating = $state<Record<number, boolean>>({});
    let addressExpanded = $state<Record<number, boolean>>({});
    let selectedSubmissionByProject = $state<Record<number, number>>({});
    let submissionCountFilter = $state<string>("all");

    let projectBusy = $state<Record<number, boolean>>({});
    let projectErrors = $state<Record<number, string>>({});
    let projectSuccess = $state<Record<number, string>>({});
    let recalcAllBusy = $state(false);
    let bulkProjectMessage = $state("");
    let bulkProjectError = $state("");

    function setSubmissionDraft(entry: AdminSubmission, force = false) {
        if (!force && submissionDrafts[entry.submissionId]) {
            return;
        }

        submissionDrafts = {
            ...submissionDrafts,
            [entry.submissionId]: toSubmissionDraft(entry),
        };
    }

    function formatDate(value: string) {
        return new Date(value).toLocaleString();
    }

    function formatHours(value: number | null) {
        if (value === null || value === undefined) {
            return "—";
        }
        return value.toFixed(1);
    }

    function fullName(user: AdminLightUser) {
        const first = user.firstName ?? "";
        const last = user.lastName ?? "";
        const name = `${first} ${last}`.trim();
        return name || "Unknown";
    }

    function formatTotalHoursValue(value: number) {
        return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
    }

    function formatCount(value: number) {
        return value.toLocaleString();
    }

    let submissionsLoadPromise: Promise<void> | null = null;
    async function loadSubmissions(autoRecalculate = false) {
        if (submissionsLoading && submissionsLoadPromise) {
            return submissionsLoadPromise;
        }
        submissionsLoading = true;
        submissionsLoadPromise = (async () => {
            try {
                const response = await fetch(
                    `${apiUrl}/api/admin/submissions`,
                    {
                        credentials: "include",
                    },
                );
                if (response.ok) {
                    const next: AdminSubmission[] = await response.json();
                    submissions = next;
                    submissionDrafts = buildSubmissionDrafts(next);
                    submissionErrors = {};
                    submissionSuccess = {};
                    submissionsLoaded = true;

                    if (autoRecalculate) {
                        const pendingSubmissions = next.filter(
                            (s) => s.approvalStatus === "pending",
                        );
                        for (const submission of pendingSubmissions) {
                            recalculateSubmissionHours(
                                submission.submissionId,
                                submission.project.projectId,
                            );
                        }
                    }
                }
            } finally {
                submissionsLoading = false;
                submissionsLoadPromise = null;
            }
        })();
        return submissionsLoadPromise;
    }

    let projectsLoadPromise: Promise<void> | null = null;
    async function loadProjects() {
        if (projectsLoading && projectsLoadPromise) {
            return projectsLoadPromise;
        }
        projectsLoading = true;
        projectsLoadPromise = (async () => {
            try {
                const response = await fetch(`${apiUrl}/api/admin/projects`, {
                    credentials: "include",
                });
                if (response.ok) {
                    projects = await response.json();
                    projectErrors = {};
                    projectSuccess = {};
                    projectsLoaded = true;
                }
            } finally {
                projectsLoading = false;
                projectsLoadPromise = null;
            }
        })();
        return projectsLoadPromise;
    }

    let usersLoadPromise: Promise<void> | null = null;
    async function loadUsers() {
        if (usersLoading && usersLoadPromise) {
            return usersLoadPromise;
        }
        usersLoading = true;
        usersLoadPromise = (async () => {
            try {
                const response = await fetch(`${apiUrl}/api/admin/users`, {
                    credentials: "include",
                });
                if (response.ok) {
                    users = await response.json();
                    usersLoaded = true;
                }
            } finally {
                usersLoading = false;
                usersLoadPromise = null;
            }
        })();
        return usersLoadPromise;
    }

    let slackEditingUserId = $state<number | null>(null);
    let slackEditValue = $state("");
    let slackLookupLoading = $state(false);
    let slackSaving = $state(false);
    let slackError = $state("");
    let slackLookupResult = $state<{
        found: boolean;
        slackUserId?: string;
        displayName?: string;
        message?: string;
    } | null>(null);

    function startSlackEdit(user: AdminUser) {
        slackEditingUserId = user.userId;
        slackEditValue = user.slackUserId ?? "";
        slackError = "";
        slackLookupResult = null;
    }

    function cancelSlackEdit() {
        slackEditingUserId = null;
        slackEditValue = "";
        slackError = "";
        slackLookupResult = null;
    }

    async function lookupSlackByEmail(email: string) {
        slackLookupLoading = true;
        slackError = "";
        slackLookupResult = null;
        try {
            const response = await fetch(
                `${apiUrl}/api/admin/slack/lookup-by-email?email=${encodeURIComponent(email)}`,
                {
                    credentials: "include",
                },
            );
            if (response.ok) {
                slackLookupResult = await response.json();
                if (slackLookupResult?.found && slackLookupResult.slackUserId) {
                    slackEditValue = slackLookupResult.slackUserId;
                }
            }
        } catch (e) {
            slackError = "Failed to lookup Slack user";
        } finally {
            slackLookupLoading = false;
        }
    }

    async function saveSlackId(userId: number) {
        slackSaving = true;
        slackError = "";
        try {
            const response = await fetch(
                `${apiUrl}/api/admin/users/${userId}/slack`,
                {
                    method: "PUT",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        slackUserId: slackEditValue.trim() || null,
                    }),
                },
            );
            if (response.ok) {
                const updatedUser = await response.json();
                users = users.map((u) =>
                    u.userId === userId
                        ? { ...u, slackUserId: updatedUser.slackUserId }
                        : u,
                );
                cancelSlackEdit();
            } else {
                const err = await response.json();
                slackError = err.message || "Failed to save";
            }
        } catch (e) {
            slackError = "Failed to save Slack ID";
        } finally {
            slackSaving = false;
        }
    }

    async function loadShops() {
        try {
            const response = await fetch(`${apiUrl}/api/shop/admin/shops`, {
                credentials: "include",
            });
            if (response.ok) {
                shops = await response.json();
                if (shops.length > 0 && !selectedShopId) {
                    selectedShopId = shops[0].shopId;
                }
            }
        } catch (err) {
            console.error("Failed to load shops:", err);
        }
    }

    async function loadShopItems() {
        if (!selectedShopId) return;
        try {
            const response = await fetch(
                `${apiUrl}/api/shop/admin/shops/${selectedShopId}/items`,
                { credentials: "include" },
            );
            if (response.ok) {
                shopItems = await response.json();
            }
        } catch (err) {
            console.error("Failed to load shop items:", err);
        }
    }

    async function loadShopTransactions() {
        try {
            const url = selectedShopId
                ? `${apiUrl}/api/shop/admin/transactions?shopId=${selectedShopId}`
                : `${apiUrl}/api/shop/admin/transactions`;
            const response = await fetch(url, { credentials: "include" });
            if (response.ok) {
                shopTransactions = await response.json();
            }
        } catch (err) {
            console.error("Failed to load shop transactions:", err);
        }
    }

    async function loadShopData() {
        shopLoading = true;
        try {
            await loadShops();
            if (selectedShopId) {
                await Promise.all([loadShopItems(), loadShopTransactions()]);
            }
            shopLoaded = true;
        } finally {
            shopLoading = false;
        }
    }

    async function onShopSelected(shopId: number) {
        selectedShopId = shopId;
        shopItems = [];
        shopTransactions = [];
        await Promise.all([loadShopItems(), loadShopTransactions()]);
    }

    function resetShopForm() {
        shopForm = { slug: "", description: "", isActive: true, isPublic: true };
        editingShopId = null;
        shopFormError = "";
        shopFormSuccess = "";
    }

    function startEditShop(shop: Shop) {
        editingShopId = shop.shopId;
        shopForm = {
            slug: shop.slug,
            description: shop.description || "",
            isActive: shop.isActive,
            isPublic: shop.isPublic,
        };
        shopFormError = "";
        shopFormSuccess = "";
    }

    async function saveShop() {
        shopFormSaving = true;
        shopFormError = "";
        shopFormSuccess = "";

        const payload = {
            slug: shopForm.slug,
            description: shopForm.description || undefined,
            isActive: shopForm.isActive,
            isPublic: shopForm.isPublic,
        };

        try {
            let response;
            if (editingShopId) {
                response = await fetch(
                    `${apiUrl}/api/shop/admin/shops/${editingShopId}`,
                    {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify(payload),
                    },
                );
            } else {
                response = await fetch(`${apiUrl}/api/shop/admin/shops`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload),
                });
            }

            if (!response.ok) {
                const { message } = await response
                    .json()
                    .catch(() => ({ message: "Failed to save shop" }));
                shopFormError = message ?? "Failed to save shop";
                return;
            }

            shopFormSuccess = editingShopId
                ? "Shop updated successfully"
                : "Shop created successfully";
            resetShopForm();
            await loadShops();
        } catch (err) {
            shopFormError =
                err instanceof Error ? err.message : "Failed to save shop";
        } finally {
            shopFormSaving = false;
        }
    }

    async function deleteShop(shopId: number) {
        const confirmDelete =
            typeof window !== "undefined"
                ? window.confirm(
                      "Delete this shop and ALL its items? This cannot be undone.",
                  )
                : true;
        if (!confirmDelete) return;

        try {
            const response = await fetch(
                `${apiUrl}/api/shop/admin/shops/${shopId}`,
                { method: "DELETE", credentials: "include" },
            );
            if (response.ok) {
                if (selectedShopId === shopId) {
                    selectedShopId = null;
                    shopItems = [];
                    shopTransactions = [];
                }
                await loadShops();
                if (shops.length > 0 && !selectedShopId) {
                    selectedShopId = shops[0].shopId;
                    await Promise.all([
                        loadShopItems(),
                        loadShopTransactions(),
                    ]);
                }
            }
        } catch (err) {
            console.error("Failed to delete shop:", err);
        }
    }

    function resetItemForm() {
        shopItemForm = {
            name: "",
            description: "",
            imageUrl: "",
            cost: "",
            maxPerUser: "",
        };
        editingItemId = null;
        shopItemError = "";
        shopItemSuccess = "";
    }

    function startEditItem(item: ShopItem) {
        editingItemId = item.itemId;
        shopItemForm = {
            name: item.name,
            description: item.description || "",
            imageUrl: item.imageUrl || "",
            cost: item.cost.toString(),
            maxPerUser: item.maxPerUser?.toString() || "",
        };
        shopItemError = "";
        shopItemSuccess = "";
    }

    async function saveShopItem() {
        shopItemSaving = true;
        shopItemError = "";
        shopItemSuccess = "";

        const payload = {
            name: shopItemForm.name,
            description: shopItemForm.description || undefined,
            imageUrl: shopItemForm.imageUrl || undefined,
            cost: parseFloat(shopItemForm.cost),
            maxPerUser: shopItemForm.maxPerUser
                ? parseInt(shopItemForm.maxPerUser)
                : null,
        };

        try {
            let response;
            if (editingItemId) {
                response = await fetch(
                    `${apiUrl}/api/shop/admin/items/${editingItemId}`,
                    {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify(payload),
                    },
                );
            } else {
                response = await fetch(
                    `${apiUrl}/api/shop/admin/shops/${selectedShopId}/items`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify(payload),
                    },
                );
            }

            if (!response.ok) {
                const { message } = await response
                    .json()
                    .catch(() => ({ message: "Failed to save item" }));
                shopItemError = message ?? "Failed to save item";
                return;
            }

            shopItemSuccess = editingItemId
                ? "Item updated successfully"
                : "Item created successfully";
            resetItemForm();
            await loadShopItems();
        } catch (err) {
            shopItemError =
                err instanceof Error ? err.message : "Failed to save item";
        } finally {
            shopItemSaving = false;
        }
    }

    async function toggleItemActive(item: ShopItem) {
        try {
            const response = await fetch(
                `${apiUrl}/api/shop/admin/items/${item.itemId}`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ isActive: !item.isActive }),
                },
            );

            if (response.ok) {
                await loadShopItems();
            }
        } catch (err) {
            console.error("Failed to toggle item:", err);
        }
    }

    async function deleteShopItem(itemId: number) {
        const confirmDelete =
            typeof window !== "undefined"
                ? window.confirm(
                      "Delete this shop item? This cannot be undone.",
                  )
                : true;
        if (!confirmDelete) return;

        try {
            const response = await fetch(
                `${apiUrl}/api/shop/admin/items/${itemId}`,
                {
                    method: "DELETE",
                    credentials: "include",
                },
            );

            if (response.ok) {
                await loadShopItems();
            }
        } catch (err) {
            console.error("Failed to delete item:", err);
        }
    }

    function resetVariantForm() {
        variantForm = { name: "", cost: "" };
        addingVariantToItemId = null;
        editingVariantId = null;
        variantError = "";
        variantSuccess = "";
    }

    function startAddVariant(itemId: number) {
        resetVariantForm();
        addingVariantToItemId = itemId;
        expandedItemVariants[itemId] = true;
    }

    function startEditVariant(variant: ShopItemVariant) {
        variantForm = { name: variant.name, cost: variant.cost.toString() };
        editingVariantId = variant.variantId;
        addingVariantToItemId = variant.itemId;
        variantError = "";
        variantSuccess = "";
    }

    async function saveVariant() {
        if (!addingVariantToItemId) return;

        variantSaving = true;
        variantError = "";
        variantSuccess = "";

        const payload = {
            name: variantForm.name,
            cost: parseFloat(variantForm.cost),
        };

        try {
            let response;
            if (editingVariantId) {
                response = await fetch(
                    `${apiUrl}/api/shop/admin/variants/${editingVariantId}`,
                    {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify(payload),
                    },
                );
            } else {
                response = await fetch(
                    `${apiUrl}/api/shop/admin/items/${addingVariantToItemId}/variants`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify(payload),
                    },
                );
            }

            if (!response.ok) {
                const { message } = await response
                    .json()
                    .catch(() => ({ message: "Failed to save variant" }));
                variantError = message ?? "Failed to save variant";
                return;
            }

            variantSuccess = editingVariantId
                ? "Variant updated"
                : "Variant created";
            resetVariantForm();
            await loadShopItems();
        } catch (err) {
            variantError =
                err instanceof Error ? err.message : "Failed to save variant";
        } finally {
            variantSaving = false;
        }
    }

    async function toggleVariantActive(variant: ShopItemVariant) {
        try {
            const response = await fetch(
                `${apiUrl}/api/shop/admin/variants/${variant.variantId}`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ isActive: !variant.isActive }),
                },
            );

            if (response.ok) {
                await loadShopItems();
            }
        } catch (err) {
            console.error("Failed to toggle variant:", err);
        }
    }

    async function deleteVariant(variantId: number) {
        const confirmDelete =
            typeof window !== "undefined"
                ? window.confirm("Delete this variant? This cannot be undone.")
                : true;
        if (!confirmDelete) return;

        try {
            const response = await fetch(
                `${apiUrl}/api/shop/admin/variants/${variantId}`,
                {
                    method: "DELETE",
                    credentials: "include",
                },
            );

            if (response.ok) {
                await loadShopItems();
            }
        } catch (err) {
            console.error("Failed to delete variant:", err);
        }
    }

    async function handleRefundTransaction(transactionId: number) {
        const confirmRefund =
            typeof window !== "undefined"
                ? window.confirm(
                      "Refund this transaction? The hours will be returned to the user.",
                  )
                : true;
        if (!confirmRefund) return;

        refundingTransaction = transactionId;
        try {
            const response = await fetch(
                `${apiUrl}/api/shop/admin/transactions/${transactionId}`,
                {
                    method: "DELETE",
                    credentials: "include",
                },
            );

            if (response.ok) {
                shopTransactions = shopTransactions.filter(
                    (t) => t.transactionId !== transactionId,
                );
            } else {
                console.error("Failed to refund transaction");
            }
        } catch (err) {
            console.error("Failed to refund transaction:", err);
        } finally {
            refundingTransaction = null;
        }
    }

    async function handleMarkFulfilled(transactionId: number) {
        const confirmFulfill =
            typeof window !== "undefined"
                ? window.confirm("Mark this transaction as fulfilled?")
                : true;
        if (!confirmFulfill) return;

        fulfillingTransaction = transactionId;
        try {
            const response = await fetch(
                `${apiUrl}/api/shop/admin/transactions/${transactionId}/fulfill`,
                {
                    method: "PUT",
                    credentials: "include",
                },
            );

            if (response.ok) {
                const updatedTransaction = await response.json();
                shopTransactions = shopTransactions.map((t) =>
                    t.transactionId === transactionId ? updatedTransaction : t,
                );
            } else {
                console.error("Failed to mark transaction as fulfilled");
            }
        } catch (err) {
            console.error("Failed to mark transaction as fulfilled:", err);
        } finally {
            fulfillingTransaction = null;
        }
    }

    async function handleUnfulfillTransaction(transactionId: number) {
        const confirmUnfulfill =
            typeof window !== "undefined"
                ? window.confirm(
                      "Remove fulfilled status from this transaction?",
                  )
                : true;
        if (!confirmUnfulfill) return;

        unfulfillingTransaction = transactionId;
        try {
            const response = await fetch(
                `${apiUrl}/api/shop/admin/transactions/${transactionId}/fulfill`,
                {
                    method: "DELETE",
                    credentials: "include",
                },
            );

            if (response.ok) {
                const updatedTransaction = await response.json();
                shopTransactions = shopTransactions.map((t) =>
                    t.transactionId === transactionId ? updatedTransaction : t,
                );
            } else {
                console.error("Failed to unfulfill transaction");
            }
        } catch (err) {
            console.error("Failed to unfulfill transaction:", err);
        } finally {
            unfulfillingTransaction = null;
        }
    }

    async function loadMetrics() {
        metricsLoading = true;
        try {
            const response = await fetch(`${apiUrl}/api/admin/metrics`, {
                credentials: "include",
            });

            if (response.ok) {
                const result = await response.json();
                metrics = result.totals ?? result;
            }
        } finally {
            metricsLoading = false;
        }
    }

    async function recalculateAllProjectsHours() {
        if (recalcAllBusy) {
            return;
        }

        recalcAllBusy = true;
        bulkProjectMessage = "";
        bulkProjectError = "";

        try {
            const response = await fetch(
                `${apiUrl}/api/admin/projects/recalculate-all`,
                {
                    method: "POST",
                    credentials: "include",
                },
            );

            if (!response.ok) {
                const { message } = await response
                    .json()
                    .catch(() => ({
                        message: "Failed to recalculate projects",
                    }));
                bulkProjectError = message ?? "Failed to recalculate projects";
                return;
            }

            const body = await response.json().catch(() => ({}));
            const updatedCount =
                typeof body?.updated === "number" ? body.updated : 0;
            bulkProjectMessage = `Recalculated ${updatedCount} project${updatedCount === 1 ? "" : "s"}.`;

            await Promise.all([
                loadProjects(),
                loadSubmissions(),
                loadUsers(),
                loadMetrics(),
            ]);
        } catch (err) {
            bulkProjectError =
                err instanceof Error
                    ? err.message
                    : "Failed to recalculate projects";
        } finally {
            recalcAllBusy = false;
        }
    }

    async function saveSubmission(submissionId: number, sendEmail?: boolean) {
        const draft = submissionDrafts[submissionId];
        if (!draft) {
            return;
        }

        submissionSaving = { ...submissionSaving, [submissionId]: true };
        submissionErrors = { ...submissionErrors, [submissionId]: "" };
        submissionSuccess = { ...submissionSuccess, [submissionId]: "" };

        // Use the sendEmail parameter if provided, otherwise use the toggle state
        const shouldSendEmail =
            sendEmail !== undefined ? sendEmail : draft.sendEmailNotification;

        const payload = {
            approvalStatus: draft.approvalStatus,
            approvedHours:
                draft.approvedHours === ""
                    ? null
                    : parseFloat(draft.approvedHours),
            userFeedback: draft.userFeedback === "" ? null : draft.userFeedback,
            hoursJustification:
                draft.hoursJustification === ""
                    ? null
                    : draft.hoursJustification,
            adminComment:
                draft.adminComment === "" ? null : draft.adminComment,
            sendEmail: shouldSendEmail,
        };

        try {
            const response = await fetch(
                `${apiUrl}/api/reviewer/submissions/${submissionId}/review`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload),
                },
            );

            if (!response.ok) {
                const { message } = await response
                    .json()
                    .catch(() => ({ message: "Failed to update submission" }));
                submissionErrors = {
                    ...submissionErrors,
                    [submissionId]: message ?? "Failed to update submission",
                };
                return;
            }

            submissionSuccess = {
                ...submissionSuccess,
                [submissionId]: "Submission updated",
            };
            // Invalidate timeline cache for the project
            const sub = submissions.find(s => s.submissionId === submissionId);
            if (sub) {
                const { [sub.project.projectId]: _, ...rest } = timelineByProject;
                timelineByProject = rest;
            }
            if (activeTab === "submissions") {
                await loadSubmissions();
            }
            if (activeTab === "projects") {
                await loadProjects();
            }
            await loadMetrics();
        } catch (err) {
            submissionErrors = {
                ...submissionErrors,
                [submissionId]:
                    err instanceof Error
                        ? err.message
                        : "Failed to update submission",
            };
        } finally {
            submissionSaving = { ...submissionSaving, [submissionId]: false };
        }
    }

    async function quickApprove(submission: AdminSubmission) {
        submissionSaving = {
            ...submissionSaving,
            [submission.submissionId]: true,
        };
        submissionErrors = {
            ...submissionErrors,
            [submission.submissionId]: "",
        };
        submissionSuccess = {
            ...submissionSuccess,
            [submission.submissionId]: "",
        };

        const draft = submissionDrafts[submission.submissionId];
        const userFeedback = draft?.userFeedback || "";
        const hoursJustification = draft?.hoursJustification || "";
        const approvedHours = draft?.approvedHours
            ? parseFloat(draft.approvedHours)
            : null;

        try {
            const response = await fetch(
                `${apiUrl}/api/reviewer/submissions/${submission.submissionId}/quick-approve`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        userFeedback,
                        hoursJustification,
                        approvedHours,
                    }),
                },
            );

            if (!response.ok) {
                const { message } = await response
                    .json()
                    .catch(() => ({
                        message: "Failed to quick approve submission",
                    }));
                submissionErrors = {
                    ...submissionErrors,
                    [submission.submissionId]:
                        message ?? "Failed to quick approve submission",
                };
                return;
            }

            submissionSuccess = {
                ...submissionSuccess,
                [submission.submissionId]:
                    "Submission quick approved and synced to Airtable",
            };

            // Invalidate timeline cache for the project
            const { [submission.project.projectId]: _, ...restTimeline } = timelineByProject;
            timelineByProject = restTimeline;

            const currentSubmissionId = submission.submissionId;
            if (activeTab === "submissions") {
                await loadSubmissions();
            }
            if (activeTab === "projects") {
                await loadProjects();
            }
            await loadMetrics();

            advanceToNextSubmission(currentSubmissionId);
        } catch (err) {
            submissionErrors = {
                ...submissionErrors,
                [submission.submissionId]:
                    err instanceof Error
                        ? err.message
                        : "Failed to quick approve submission",
            };
        } finally {
            submissionSaving = {
                ...submissionSaving,
                [submission.submissionId]: false,
            };
        }
    }

    async function quickDeny(submissionId: number) {
        submissionDrafts[submissionId] = {
            ...submissionDrafts[submissionId],
            approvalStatus: "rejected",
            approvedHours: "0",
        };
        const shouldSendEmail =
            submissionDrafts[submissionId].sendEmailNotification;
        await saveSubmission(submissionId, shouldSendEmail);

        advanceToNextSubmission(submissionId);
    }

    async function recalculateSubmissionHours(
        submissionId: number,
        projectId: number,
    ) {
        submissionRecalculating = {
            ...submissionRecalculating,
            [submissionId]: true,
        };

        try {
            const response = await fetch(
                `${apiUrl}/api/admin/projects/${projectId}/recalculate`,
                {
                    method: "POST",
                    credentials: "include",
                },
            );

            if (response.ok) {
                const responseData = await response.json();
                const updatedProject = responseData?.project;
                if (updatedProject) {
                    const submission = submissions.find(
                        (s) => s.submissionId === submissionId,
                    );
                    if (submission) {
                        submission.project.nowHackatimeHours =
                            updatedProject.nowHackatimeHours;
                        submissionDrafts[submissionId] = {
                            ...submissionDrafts[submissionId],
                            approvedHours:
                                updatedProject.nowHackatimeHours?.toFixed(1) ??
                                "",
                        };
                    }
                }
            }
        } catch (err) {
            console.error("Failed to recalculate hours:", err);
        } finally {
            submissionRecalculating = {
                ...submissionRecalculating,
                [submissionId]: false,
            };
        }
    }

    async function recalculateProject(projectId: number) {
        projectBusy = { ...projectBusy, [projectId]: true };
        projectErrors = { ...projectErrors, [projectId]: "" };
        projectSuccess = { ...projectSuccess, [projectId]: "" };

        try {
            const response = await fetch(
                `${apiUrl}/api/admin/projects/${projectId}/recalculate`,
                {
                    method: "POST",
                    credentials: "include",
                },
            );

            if (!response.ok) {
                const { message } = await response
                    .json()
                    .catch(() => ({ message: "Failed to recalculate hours" }));
                projectErrors = {
                    ...projectErrors,
                    [projectId]: message ?? "Failed to recalculate hours",
                };
                return;
            }

            projectSuccess = {
                ...projectSuccess,
                [projectId]: "Hours recalculated",
            };
            await Promise.all([
                activeTab === "projects" ? loadProjects() : Promise.resolve(),
                activeTab === "submissions"
                    ? loadSubmissions()
                    : Promise.resolve(),
                activeTab === "users" ? loadUsers() : Promise.resolve(),
            ]);
            await loadMetrics();
        } catch (err) {
            projectErrors = {
                ...projectErrors,
                [projectId]:
                    err instanceof Error
                        ? err.message
                        : "Failed to recalculate hours",
            };
        } finally {
            projectBusy = { ...projectBusy, [projectId]: false };
        }
    }

    async function deleteProject(projectId: number) {
        const confirmDelete =
            typeof window !== "undefined"
                ? window.confirm("Delete this project? This cannot be undone.")
                : true;
        if (!confirmDelete) {
            return;
        }

        projectBusy = { ...projectBusy, [projectId]: true };
        projectErrors = { ...projectErrors, [projectId]: "" };
        projectSuccess = { ...projectSuccess, [projectId]: "" };

        try {
            const response = await fetch(
                `${apiUrl}/api/admin/projects/${projectId}`,
                {
                    method: "DELETE",
                    credentials: "include",
                },
            );

            if (!response.ok) {
                const { message } = await response
                    .json()
                    .catch(() => ({ message: "Failed to delete project" }));
                projectErrors = {
                    ...projectErrors,
                    [projectId]: message ?? "Failed to delete project",
                };
                return;
            }

            projectSuccess = {
                ...projectSuccess,
                [projectId]: "Project removed",
            };
            await Promise.all([
                activeTab === "projects" ? loadProjects() : Promise.resolve(),
                activeTab === "submissions"
                    ? loadSubmissions()
                    : Promise.resolve(),
                activeTab === "users" ? loadUsers() : Promise.resolve(),
            ]);
            await loadMetrics();
        } catch (err) {
            projectErrors = {
                ...projectErrors,
                [projectId]:
                    err instanceof Error
                        ? err.message
                        : "Failed to delete project",
            };
        } finally {
            projectBusy = { ...projectBusy, [projectId]: false };
        }
    }

    async function toggleFraudFlag(projectId: number, currentValue: boolean) {
        try {
            const response = await fetch(
                `${apiUrl}/api/admin/projects/${projectId}/fraud-flag`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ isFraud: !currentValue }),
                },
            );

            if (response.ok) {
                await Promise.all([
                    activeTab === "submissions"
                        ? loadSubmissions()
                        : Promise.resolve(),
                    activeTab === "projects"
                        ? loadProjects()
                        : Promise.resolve(),
                    activeTab === "users" ? loadUsers() : Promise.resolve(),
                ]);
            }
        } catch (err) {
            console.error("Failed to toggle fraud flag:", err);
        }
    }

    async function loadGlobalSettings() {
        globalSettingsLoading = true;
        try {
            const response = await fetch(`${apiUrl}/api/admin/settings`, {
                credentials: "include",
            });
            if (response.ok) {
                globalSettings = await response.json();
            }
        } catch (err) {
            console.error("Failed to load global settings:", err);
        } finally {
            globalSettingsLoading = false;
        }
    }

    async function toggleGlobalSubmissionsFrozen() {
        if (!globalSettings) return;
        globalSettingsLoading = true;
        try {
            const response = await fetch(
                `${apiUrl}/api/admin/settings/submissions-frozen`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        submissionsFrozen: !globalSettings.submissionsFrozen,
                    }),
                },
            );

            if (response.ok) {
                globalSettings = await response.json();
            }
        } catch (err) {
            console.error("Failed to toggle submissions frozen:", err);
        } finally {
            globalSettingsLoading = false;
        }
    }

    async function toggleSusFlag(userId: number, currentValue: boolean) {
        try {
            const response = await fetch(
                `${apiUrl}/api/admin/users/${userId}/sus-flag`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ isSus: !currentValue }),
                },
            );

            if (response.ok) {
                await Promise.all([
                    activeTab === "submissions"
                        ? loadSubmissions()
                        : Promise.resolve(),
                    activeTab === "projects"
                        ? loadProjects()
                        : Promise.resolve(),
                    activeTab === "users" ? loadUsers() : Promise.resolve(),
                ]);
            }
        } catch (err) {
            console.error("Failed to toggle sus flag:", err);
        }
    }

    async function showSubmissionsTab() {
        if (activeTab === "submissions") return;
        activeTab = "submissions";
        if (!submissionsLoaded && !submissionsLoading) {
            await Promise.all([loadSubmissions(false), loadGlobalSettings()]);
        } else if (!globalSettings) {
            await loadGlobalSettings();
        }
    }

    async function showProjectsTab() {
        if (activeTab === "projects") return;
        activeTab = "projects";
        if (!projectsLoaded && !projectsLoading) {
            await loadProjects();
        }
    }

    async function showUsersTab() {
        if (activeTab === "users") return;
        activeTab = "users";
        if (!usersLoaded && !usersLoading) {
            await loadUsers();
        }
    }

    async function showShopTab() {
        activeTab = "shop";
        if (!shopLoaded && !shopLoading) {
            await loadShopData();
        }
    }

    async function loadGiftCodes() {
        giftCodesLoading = true;
        try {
            const response = await fetch(`${apiUrl}/api/admin/gift-codes`, {
                credentials: "include",
            });
            if (response.ok) {
                giftCodes = await response.json();
                giftCodesLoaded = true;
            }
        } catch (err) {
            console.error("Failed to load gift codes:", err);
        } finally {
            giftCodesLoading = false;
        }
    }

    async function loadReviewerLeaderboard() {
        leaderboardLoading = true;
        try {
            const response = await fetch(
                `${apiUrl}/api/admin/reviewer-leaderboard`,
                {
                    credentials: "include",
                },
            );
            if (response.ok) {
                reviewerLeaderboard = await response.json();
                leaderboardLoaded = true;
            }
        } catch (err) {
            console.error("Failed to load reviewer leaderboard:", err);
        } finally {
            leaderboardLoading = false;
        }
    }

    async function loadPriorityUsers() {
        if (priorityUsersLoaded && priorityUsers.length > 0) return;
        priorityUsersLoading = true;
        try {
            const response = await fetch(`${apiUrl}/api/admin/priority-users`, {
                credentials: "include",
            });
            if (response.ok) {
                priorityUsers = await response.json();
                priorityUsersLoaded = true;
            }
        } catch (err) {
            console.error("Failed to load priority users:", err);
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

    function getNextPendingSubmission(
        currentSubmissionId: number,
    ): { projectId: number; submissionId: number } | null {
        const projectIds = Object.keys(filteredGroupedSubmissions).map(Number);

        for (const projectId of projectIds) {
            const projectSubmissions = filteredGroupedSubmissions[projectId];
            for (const submission of projectSubmissions) {
                if (
                    submission.submissionId !== currentSubmissionId &&
                    submission.approvalStatus === "pending"
                ) {
                    return { projectId, submissionId: submission.submissionId };
                }
            }
        }
        return null;
    }

    function advanceToNextSubmission(currentSubmissionId: number) {
        const next = getNextPendingSubmission(currentSubmissionId);
        if (next) {
            selectedSubmissionByProject = {
                ...selectedSubmissionByProject,
                [next.projectId]: next.submissionId,
            };
            const element = document.getElementById(
                `submission-card-${next.projectId}`,
            );
            if (element) {
                element.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        }
    }

    async function showGiftCodesTab() {
        activeTab = "giftcodes";
        if (!giftCodesLoaded && !giftCodesLoading) {
            await loadGiftCodes();
        }
    }

    async function showEventsTab() {
        activeTab = "events";
        if (!eventsLoaded && !eventsLoading) {
            await loadEvents();
        }
    }

    async function loadEvents() {
        eventsLoading = true;
        try {
            const response = await fetch(`${apiUrl}/api/events/admin`, {
                credentials: "include",
            });
            if (response.ok) {
                events = await response.json();
                eventsLoaded = true;
            }
        } catch (err) {
            console.error("Failed to load events:", err);
        } finally {
            eventsLoading = false;
        }
    }

    function resetEventForm() {
        eventForm = { slug: "", title: "", description: "", imageUrl: "", location: "", startDate: "", endDate: "", hourCost: "", isActive: true };
        editingEventSlug = null;
        eventFormError = "";
        eventFormSuccess = "";
    }

    function startEditEvent(event: Event) {
        editingEventSlug = event.slug;
        eventForm = {
            slug: event.slug,
            title: event.title,
            description: event.description || "",
            imageUrl: event.imageUrl || "",
            location: event.location || "",
            startDate: event.startDate ? new Date(event.startDate).toISOString().slice(0, 10) : "",
            endDate: event.endDate ? new Date(event.endDate).toISOString().slice(0, 10) : "",
            hourCost: String(event.hourCost),
            isActive: event.isActive,
        };
        eventFormError = "";
        eventFormSuccess = "";
    }

    async function saveEvent() {
        eventFormSaving = true;
        eventFormError = "";
        eventFormSuccess = "";

        const payload: Record<string, unknown> = {
            slug: eventForm.slug,
            title: eventForm.title,
            description: eventForm.description || undefined,
            imageUrl: eventForm.imageUrl || undefined,
            location: eventForm.location || undefined,
            startDate: eventForm.startDate || undefined,
            endDate: eventForm.endDate || undefined,
            hourCost: parseFloat(eventForm.hourCost),
            ...(editingEventSlug ? { isActive: eventForm.isActive } : {}),
        };

        try {
            let response;
            if (editingEventSlug) {
                response = await fetch(
                    `${apiUrl}/api/events/admin/${editingEventSlug}`,
                    {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify(payload),
                    },
                );
            } else {
                response = await fetch(`${apiUrl}/api/events/admin`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload),
                });
            }

            if (!response.ok) {
                const { message } = await response.json().catch(() => ({
                    message: "Failed to save event",
                }));
                eventFormError = message ?? "Failed to save event";
                return;
            }

            eventFormSuccess = editingEventSlug ? "Event updated successfully" : "Event created successfully";
            resetEventForm();
            await loadEvents();
        } catch (err) {
            eventFormError = err instanceof Error ? err.message : "Failed to save event";
        } finally {
            eventFormSaving = false;
        }
    }

    async function deleteEvent(slug: string) {
        const confirmDelete = window.confirm("Delete this event? This cannot be undone.");
        if (!confirmDelete) return;

        try {
            const response = await fetch(
                `${apiUrl}/api/events/admin/${slug}`,
                { method: "DELETE", credentials: "include" },
            );
            if (response.ok) {
                await loadEvents();
            }
        } catch (err) {
            console.error("Failed to delete event:", err);
        }
    }

    function resetGiftCodeForm() {
        giftCodeForm = {
            emails: "",
            itemDescription: "",
            imageUrl: "",
            filloutUrl: "",
        };
        giftCodeError = "";
        giftCodeSuccess = "";
        giftCodeResults = [];
    }

    async function sendGiftCodes() {
        giftCodeSending = true;
        giftCodeError = "";
        giftCodeSuccess = "";
        giftCodeResults = [];

        const emailList = giftCodeForm.emails
            .split(/[\n,;]+/)
            .map((e) => e.trim())
            .filter((e) => e.length > 0 && e.includes("@"));

        if (emailList.length === 0) {
            giftCodeError = "Please enter at least one valid email address";
            giftCodeSending = false;
            return;
        }

        if (!giftCodeForm.itemDescription.trim()) {
            giftCodeError = "Please enter an item description";
            giftCodeSending = false;
            return;
        }

        if (!giftCodeForm.imageUrl.trim()) {
            giftCodeError = "Please enter an image URL";
            giftCodeSending = false;
            return;
        }

        if (!giftCodeForm.filloutUrl.trim()) {
            giftCodeError = "Please enter a Fillout URL";
            giftCodeSending = false;
            return;
        }

        try {
            const response = await fetch(
                `${apiUrl}/api/admin/gift-codes/send`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        emails: emailList,
                        itemDescription: giftCodeForm.itemDescription,
                        imageUrl: giftCodeForm.imageUrl,
                        filloutUrl: giftCodeForm.filloutUrl,
                    }),
                },
            );

            if (!response.ok) {
                const { message } = await response
                    .json()
                    .catch(() => ({ message: "Failed to send gift codes" }));
                giftCodeError = message ?? "Failed to send gift codes";
                return;
            }

            const result = await response.json();
            giftCodeResults = result.results || [];
            giftCodeSuccess = `Sent ${result.successful}/${result.total} emails successfully`;

            if (result.successful > 0) {
                await loadGiftCodes();
            }
        } catch (err) {
            giftCodeError =
                err instanceof Error
                    ? err.message
                    : "Failed to send gift codes";
        } finally {
            giftCodeSending = false;
        }
    }

    $effect(() => {
        if (!initialLoadDone && typeof window !== "undefined") {
            initialLoadDone = true;
            if (activeTab === "submissions") {
                loadSubmissions(false);
            }
        }
    });

    $effect(() => {
        if (submissions.length === 0) {
            return;
        }

        submissionsLoaded = true;

        let updated = false;
        const drafts = { ...submissionDrafts };
        const selected = { ...selectedSubmissionByProject };

        const groups = groupedSubmissions;
        for (const projectId in groups) {
            const projectIdNum = Number(projectId);
            if (!selected[projectIdNum] && groups[projectIdNum]?.length > 0) {
                selected[projectIdNum] = groups[projectIdNum][0].submissionId;
                updated = true;
            }
        }

        for (const submission of submissions) {
            if (!drafts[submission.submissionId]) {
                drafts[submission.submissionId] = toSubmissionDraft(submission);
                updated = true;
            }
        }

        if (updated) {
            submissionDrafts = drafts;
            selectedSubmissionByProject = selected;
        }
    });

    $effect(() => {
        if (projects.length > 0) {
            projectsLoaded = true;
        }
    });

    $effect(() => {
        if (users.length > 0) {
            usersLoaded = true;
        }
    });

    function matchesSearch(
        submission: AdminSubmission,
        query: string,
    ): boolean {
        if (!query.trim()) return true;
        const lowerQuery = query.toLowerCase();
        const fullName =
            `${submission.project.user.firstName ?? ""} ${submission.project.user.lastName ?? ""}`
                .trim()
                .toLowerCase();
        return (
            submission.project.projectTitle
                .toLowerCase()
                .includes(lowerQuery) ||
            fullName.includes(lowerQuery) ||
            submission.project.user.email.toLowerCase().includes(lowerQuery) ||
            (submission.project.description
                ?.toLowerCase()
                .includes(lowerQuery) ??
                false) ||
            (submission.description?.toLowerCase().includes(lowerQuery) ??
                false)
        );
    }

    function matchesStatusFilters(submission: AdminSubmission): boolean {
        if (selectedStatuses.size === 0) return true;
        return selectedStatuses.has(submission.approvalStatus);
    }

    function matchesProjectTypeFilters(submission: AdminSubmission): boolean {
        if (selectedProjectTypes.size === 0) return true;
        return selectedProjectTypes.has(submission.project.projectType);
    }

    function matchesPriorityFilter(submission: AdminSubmission): boolean {
        if (!priorityFilterEnabled || !priorityUsersLoaded) return true;
        const priorityUserIds = new Set(priorityUsers.map((u) => u.userId));
        return priorityUserIds.has(submission.project.user.userId);
    }

    function matchesFraudFilter(submission: AdminSubmission): boolean {
        if (showFraudSubmissions) return true;
        return !submission.project.isFraud;
    }

    function matchesSusFilter(submission: AdminSubmission): boolean {
        if (showSusSubmissions) return true;
        return !submission.project.user.isSus;
    }

    function compareSubmissions(
        a: AdminSubmission,
        b: AdminSubmission,
    ): number {
        let comparison = 0;

        switch (sortField) {
            case "createdAt":
                comparison =
                    new Date(a.createdAt).getTime() -
                    new Date(b.createdAt).getTime();
                break;
            case "projectTitle":
                comparison = a.project.projectTitle.localeCompare(
                    b.project.projectTitle,
                );
                break;
            case "userName": {
                const nameA =
                    `${a.project.user.firstName ?? ""} ${a.project.user.lastName ?? ""}`.trim();
                const nameB =
                    `${b.project.user.firstName ?? ""} ${b.project.user.lastName ?? ""}`.trim();
                comparison = nameA.localeCompare(nameB);
                break;
            }
            case "approvalStatus":
                comparison = a.approvalStatus.localeCompare(b.approvalStatus);
                break;
            case "nowHackatimeHours":
                comparison =
                    (a.project.nowHackatimeHours ?? 0) -
                    (b.project.nowHackatimeHours ?? 0);
                break;
            case "approvedHours":
                comparison =
                    (a.project.approvedHours ?? 0) -
                    (b.project.approvedHours ?? 0);
                break;
        }

        return sortDirection === "asc" ? comparison : -comparison;
    }

    let groupedSubmissions = $derived.by(() => {
        const groups: Record<number, AdminSubmission[]> = {};

        for (const submission of submissions) {
            if (!groups[submission.project.projectId]) {
                groups[submission.project.projectId] = [];
            }
            groups[submission.project.projectId].push(submission);
        }

        for (const projectId in groups) {
            groups[Number(projectId)].sort(
                (a, b) =>
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime(),
            );
        }

        return groups;
    });

    let filteredGroupedSubmissions = $derived.by(() => {
        const filtered: Record<number, AdminSubmission[]> = {};
        const groups = groupedSubmissions;

        for (const projectId in groups) {
            const projectIdNum = Number(projectId);
            const projectSubmissions = groups[projectIdNum].filter(
                (s: AdminSubmission) =>
                    matchesSearch(s, searchQuery) &&
                    matchesStatusFilters(s) &&
                    matchesProjectTypeFilters(s) &&
                    matchesPriorityFilter(s) &&
                    matchesFraudFilter(s) &&
                    matchesSusFilter(s),
            );

            if (projectSubmissions.length > 0) {
                const count = projectSubmissions.length;
                if (
                    submissionCountFilter === "all" ||
                    (submissionCountFilter === "single" && count === 1) ||
                    (submissionCountFilter === "multiple" && count > 1)
                ) {
                    filtered[projectIdNum] = projectSubmissions;
                }
            }
        }

        return filtered;
    });

    let sortedGroupedSubmissionsEntries = $derived.by(() => {
        const entries = Object.entries(filteredGroupedSubmissions);
        return entries.sort(
            ([projectIdA, submissionsA], [projectIdB, submissionsB]) => {
                const firstSubmissionA = submissionsA[0];
                const firstSubmissionB = submissionsB[0];
                return compareSubmissions(firstSubmissionA, firstSubmissionB);
            },
        );
    });

    let filteredSubmissions = $derived(
        submissions
            .filter((s) => matchesSearch(s, searchQuery))
            .filter((s) => matchesStatusFilters(s))
            .filter((s) => matchesProjectTypeFilters(s))
            .filter((s) => matchesPriorityFilter(s))
            .filter((s) => matchesFraudFilter(s))
            .filter((s) => matchesSusFilter(s))
            .sort(compareSubmissions),
    );

    let statusCounts = $derived({
        all: submissions.length,
        pending: submissions.filter((s) => s.approvalStatus === "pending")
            .length,
        approved: submissions.filter((s) => s.approvalStatus === "approved")
            .length,
        rejected: submissions.filter((s) => s.approvalStatus === "rejected")
            .length,
    });

    function toggleStatus(status: string) {
        const newSet = new Set(selectedStatuses);
        if (newSet.has(status)) {
            newSet.delete(status);
        } else {
            newSet.add(status);
        }
        selectedStatuses = newSet;
    }

    function toggleProjectType(projectType: string) {
        const newSet = new Set(selectedProjectTypes);
        if (newSet.has(projectType)) {
            newSet.delete(projectType);
        } else {
            newSet.add(projectType);
        }
        selectedProjectTypes = newSet;
    }

    function formatProjectType(type: string): string {
        return type
            .split("_")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    }

    function normalizeUrl(url: string | null): string | null {
        if (!url) return null;
        const trimmed = url.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            return trimmed;
        }
        return `https://${trimmed}`;
    }
</script>

<svelte:head>
    <title>Admin Panel - Midnight</title>
</svelte:head>

<div class="min-h-screen bg-gray-950 text-white p-4 md:p-6 overflow-x-hidden">
    <div class="max-w-7xl mx-auto space-y-8 w-full">
        <header
            class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
        >
            <div>
                <h1 class="text-4xl font-bold">Admin Panel</h1>
                <p class="text-gray-300">Signed in as {data.user.email}</p>
            </div>
            <div class="flex gap-2">
                <button
                    class={`px-4 py-2 rounded-lg border transition-colors ${activeTab === "submissions" ? "bg-purple-600 border-purple-400" : "bg-gray-800 border-gray-700 hover:bg-gray-700"}`}
                    onclick={showSubmissionsTab}
                >
                    Submissions
                </button>
                <button
                    class={`px-4 py-2 rounded-lg border transition-colors ${activeTab === "projects" ? "bg-purple-600 border-purple-400" : "bg-gray-800 border-gray-700 hover:bg-gray-700"}`}
                    onclick={showProjectsTab}
                >
                    Projects
                </button>
                <button
                    class={`px-4 py-2 rounded-lg border transition-colors ${activeTab === "users" ? "bg-purple-600 border-purple-400" : "bg-gray-800 border-gray-700 hover:bg-gray-700"}`}
                    onclick={showUsersTab}
                >
                    Users
                </button>
                <button
                    class={`px-4 py-2 rounded-lg border transition-colors ${activeTab === "shop" ? "bg-purple-600 border-purple-400" : "bg-gray-800 border-gray-700 hover:bg-gray-700"}`}
                    onclick={showShopTab}
                >
                    Shop
                </button>
                <button
                    class={`px-4 py-2 rounded-lg border transition-colors ${activeTab === "giftcodes" ? "bg-purple-600 border-purple-400" : "bg-gray-800 border-gray-700 hover:bg-gray-700"}`}
                    onclick={showGiftCodesTab}
                >
                    Gift Codes
                </button>
                <button
                    class={`px-4 py-2 rounded-lg border transition-colors ${activeTab === "events" ? "bg-purple-600 border-purple-400" : "bg-gray-800 border-gray-700 hover:bg-gray-700"}`}
                    onclick={showEventsTab}
                >
                    Events
                </button>
            </div>
        </header>

        <section class="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div
                class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-2"
            >
                <p class="text-sm text-gray-400 uppercase tracking-wide">
                    Total Hackatime Hours
                </p>
                <p class="text-3xl font-bold text-white">
                    {formatTotalHoursValue(metrics.totalHackatimeHours)}
                </p>
            </div>
            <div
                class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-2"
            >
                <p class="text-sm text-gray-400 uppercase tracking-wide">
                    Total Approved Hours
                </p>
                <p class="text-3xl font-bold text-white">
                    {formatTotalHoursValue(metrics.totalApprovedHours)}
                </p>
            </div>
            <div
                class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-2"
            >
                <p class="text-sm text-gray-400 uppercase tracking-wide">
                    Submitted Projects Hours
                </p>
                <p class="text-3xl font-bold text-white">
                    {formatTotalHoursValue(
                        metrics.totalSubmittedHackatimeHours,
                    )}
                </p>
            </div>
            <div
                class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-2"
            >
                <p class="text-sm text-gray-400 uppercase tracking-wide">
                    Projects
                </p>
                <p class="text-3xl font-bold text-white">
                    {formatCount(metrics.totalProjects)}
                </p>
            </div>
            <div
                class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-2"
            >
                <p class="text-sm text-gray-400 uppercase tracking-wide">
                    Users
                </p>
                <p class="text-3xl font-bold text-white">
                    {formatCount(metrics.totalUsers)}
                </p>
            </div>
        </section>

        <div
            class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
        >
            <div class="flex gap-2">
                <button
                    class="px-4 py-2 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                    onclick={loadMetrics}
                    disabled={metricsLoading}
                >
                    {metricsLoading ? "Refreshing totals..." : "Refresh totals"}
                </button>
                <button
                    class="px-4 py-2 rounded-lg border border-purple-500 bg-purple-600 hover:bg-purple-500 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                    onclick={recalculateAllProjectsHours}
                    disabled={recalcAllBusy}
                >
                    {recalcAllBusy
                        ? "Recalculating projects..."
                        : "Recalculate all projects"}
                </button>
            </div>
            <div class="text-sm">
                {#if bulkProjectError}
                    <span class="text-red-400">{bulkProjectError}</span>
                {:else if bulkProjectMessage}
                    <span class="text-green-400">{bulkProjectMessage}</span>
                {/if}
            </div>
        </div>

        {#if activeTab === "submissions"}
            <section class="space-y-4">
                <div
                    class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
                >
                    <h2 class="text-2xl font-semibold">
                        Submission Review Platform
                    </h2>
                    <div class="flex items-center gap-3">
                        {#if globalSettings}
                            <button
                                class={`px-4 py-2 rounded-lg border transition-colors flex items-center gap-2 ${
                                    globalSettings.submissionsFrozen
                                        ? "bg-blue-600/20 border-blue-500 text-blue-300 hover:bg-blue-600/30"
                                        : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                                }`}
                                onclick={toggleGlobalSubmissionsFrozen}
                                disabled={globalSettingsLoading}
                            >
                                {#if globalSettingsLoading}
                                    <span class="animate-spin">⟳</span>
                                {:else}
                                    <span
                                        >{globalSettings.submissionsFrozen
                                            ? "🧊"
                                            : "▶️"}</span
                                    >
                                {/if}
                                {globalSettings.submissionsFrozen
                                    ? "Submissions Frozen"
                                    : "Freeze All Submissions"}
                            </button>
                        {/if}
                        <button
                            class="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 transition-colors"
                            onclick={() => loadSubmissions(false)}
                        >
                            Refresh
                        </button>
                    </div>
                </div>

                {#if globalSettings?.submissionsFrozen}
                    <div
                        class="rounded-xl border border-blue-500 bg-blue-600/10 p-4 flex items-center gap-3"
                    >
                        <span class="text-2xl">🧊</span>
                        <div>
                            <p class="font-semibold text-blue-300">
                                Submissions are currently frozen
                            </p>
                            <p class="text-sm text-blue-400">
                                Users cannot submit or resubmit projects until
                                unfrozen.
                            </p>
                        </div>
                    </div>
                {/if}

                <div
                    class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-6"
                >
                    <div class="grid gap-4 md:grid-cols-2">
                        <div>
                            <div class="text-sm font-medium text-gray-300 mb-2">
                                Date Range for Billy Links
                            </div>
                            <div
                                class="flex flex-col gap-3 md:flex-row md:items-end md:gap-4"
                            >
                                <div class="flex-1">
                                    <label
                                        for="date-range-start"
                                        class="block text-xs text-gray-400 mb-1"
                                        >Start Date</label
                                    >
                                    <input
                                        id="date-range-start"
                                        type="date"
                                        class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        bind:value={dateRangeStart}
                                    />
                                </div>
                                <div class="flex-1">
                                    <label
                                        for="date-range-end"
                                        class="block text-xs text-gray-400 mb-1"
                                        >End Date</label
                                    >
                                    <input
                                        id="date-range-end"
                                        type="date"
                                        class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        bind:value={dateRangeEnd}
                                    />
                                </div>
                                <div>
                                    <button
                                        class="px-4 py-2 rounded-lg border border-gray-600 bg-gray-800 text-gray-400 text-sm hover:bg-gray-700 transition-colors whitespace-nowrap"
                                        onclick={() => {
                                            const defaultRange =
                                                getDefaultDateRange();
                                            dateRangeStart =
                                                defaultRange.startDate;
                                            dateRangeEnd = defaultRange.endDate;
                                        }}
                                    >
                                        Reset
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label
                                for="search-submissions"
                                class="block text-sm font-medium text-gray-300 mb-2"
                                >Search</label
                            >
                            <input
                                id="search-submissions"
                                type="text"
                                placeholder="Search by project title, user name, email, or description..."
                                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                bind:value={searchQuery}
                            />
                        </div>
                    </div>

                    <div class="grid gap-4 md:grid-cols-6">
                        <div>
                            <div
                                class="block text-sm font-medium text-gray-300 mb-2"
                            >
                                Priority Filter
                            </div>
                            <div class="flex flex-wrap gap-2">
                                <button
                                    class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                                        priorityFilterEnabled
                                            ? "bg-yellow-600 border-yellow-400 text-white"
                                            : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                                    }`}
                                    onclick={togglePriorityFilter}
                                    disabled={priorityUsersLoading}
                                >
                                    {priorityUsersLoading
                                        ? "Loading..."
                                        : "⭐ Priority (50+ hrs)"}
                                    {#if priorityFilterEnabled}
                                        <span class="ml-1">✓</span>
                                    {/if}
                                </button>
                                {#if priorityFilterEnabled && priorityUsersLoaded}
                                    <span
                                        class="px-2 py-1.5 text-xs text-gray-400 self-center"
                                    >
                                        ({priorityUsers.length} users)
                                    </span>
                                {/if}
                            </div>
                        </div>
                        <div>
                            <div
                                class="block text-sm font-medium text-gray-300 mb-2"
                            >
                                Filter by Submission Count
                            </div>
                            <div class="flex flex-wrap gap-2">
                                <button
                                    class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                                        submissionCountFilter === "all"
                                            ? "bg-purple-600 border-purple-400 text-white"
                                            : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                                    }`}
                                    onclick={() =>
                                        (submissionCountFilter = "all")}
                                >
                                    All
                                </button>
                                <button
                                    class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                                        submissionCountFilter === "single"
                                            ? "bg-purple-600 border-purple-400 text-white"
                                            : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                                    }`}
                                    onclick={() =>
                                        (submissionCountFilter = "single")}
                                >
                                    Single
                                </button>
                                <button
                                    class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                                        submissionCountFilter === "multiple"
                                            ? "bg-purple-600 border-purple-400 text-white"
                                            : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                                    }`}
                                    onclick={() =>
                                        (submissionCountFilter = "multiple")}
                                >
                                    Multiple
                                </button>
                            </div>
                        </div>
                        <div>
                            <div
                                class="block text-sm font-medium text-gray-300 mb-2"
                            >
                                Filter by Status
                            </div>
                            <div class="flex flex-wrap gap-2">
                                {#each statusOptions as status}
                                    <button
                                        class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                                            selectedStatuses.has(status)
                                                ? status === "pending"
                                                    ? "bg-yellow-600 border-yellow-400 text-white"
                                                    : status === "approved"
                                                      ? "bg-green-600 border-green-400 text-white"
                                                      : "bg-red-600 border-red-400 text-white"
                                                : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                                        }`}
                                        onclick={() => toggleStatus(status)}
                                    >
                                        {status.charAt(0).toUpperCase() +
                                            status.slice(1)}
                                        {#if selectedStatuses.has(status)}
                                            <span class="ml-1">✓</span>
                                        {/if}
                                    </button>
                                {/each}
                                {#if selectedStatuses.size > 0}
                                    <button
                                        class="px-3 py-1.5 rounded-lg border border-gray-600 bg-gray-800 text-gray-400 text-sm hover:bg-gray-700 transition-colors"
                                        onclick={() =>
                                            (selectedStatuses = new Set())}
                                    >
                                        Clear
                                    </button>
                                {/if}
                            </div>
                        </div>

                        <div>
                            <div
                                class="block text-sm font-medium text-gray-300 mb-2"
                            >
                                Filter by Project Type
                            </div>
                            <div
                                class="flex flex-wrap gap-2 max-h-32 overflow-y-auto"
                            >
                                {#each projectTypes as projectType}
                                    <button
                                        class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                                            selectedProjectTypes.has(
                                                projectType,
                                            )
                                                ? "bg-purple-600 border-purple-400 text-white"
                                                : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                                        }`}
                                        onclick={() =>
                                            toggleProjectType(projectType)}
                                    >
                                        {formatProjectType(projectType)}
                                        {#if selectedProjectTypes.has(projectType)}
                                            <span class="ml-1">✓</span>
                                        {/if}
                                    </button>
                                {/each}
                                {#if selectedProjectTypes.size > 0}
                                    <button
                                        class="px-3 py-1.5 rounded-lg border border-gray-600 bg-gray-800 text-gray-400 text-sm hover:bg-gray-700 transition-colors"
                                        onclick={() =>
                                            (selectedProjectTypes = new Set())}
                                    >
                                        Clear
                                    </button>
                                {/if}
                            </div>
                        </div>

                        <div>
                            <div
                                class="block text-sm font-medium text-gray-300 mb-2"
                            >
                                Filter Fraud/Sus
                            </div>
                            <div class="flex flex-col gap-2">
                                <label
                                    class="flex items-center gap-2 cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        bind:checked={showFraudSubmissions}
                                        class="w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500 focus:ring-2"
                                    />
                                    <span class="text-sm text-gray-300"
                                        >Show fraud</span
                                    >
                                </label>
                                <label
                                    class="flex items-center gap-2 cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        bind:checked={showSusSubmissions}
                                        class="w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500 focus:ring-2"
                                    />
                                    <span class="text-sm text-gray-300"
                                        >Show sus</span
                                    >
                                </label>
                            </div>
                        </div>

                        <div>
                            <div
                                class="block text-sm font-medium text-gray-300 mb-2"
                            >
                                Sort By
                            </div>
                            <div class="flex gap-2">
                                <select
                                    class="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    bind:value={sortField}
                                >
                                    <option value="createdAt"
                                        >Date Created</option
                                    >
                                    <option value="projectTitle"
                                        >Project Title</option
                                    >
                                    <option value="userName">User Name</option>
                                    <option value="approvalStatus"
                                        >Status</option
                                    >
                                    <option value="nowHackatimeHours"
                                        >Hackatime Hours</option
                                    >
                                    <option value="approvedHours"
                                        >Approved Hours</option
                                    >
                                </select>
                                <button
                                    class="px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-white transition-colors"
                                    onclick={() =>
                                        (sortDirection =
                                            sortDirection === "asc"
                                                ? "desc"
                                                : "asc")}
                                    title={sortDirection === "asc"
                                        ? "Sort ascending"
                                        : "Sort descending"}
                                >
                                    {sortDirection === "asc" ? "↑" : "↓"}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="text-sm text-gray-400">
                        Showing {Object.keys(filteredGroupedSubmissions).length}
                        project{Object.keys(filteredGroupedSubmissions)
                            .length === 1
                            ? ""
                            : "s"} with {Object.values(
                            filteredGroupedSubmissions,
                        ).reduce((sum, subs) => sum + subs.length, 0)} submission{Object.values(
                            filteredGroupedSubmissions,
                        ).reduce((sum, subs) => sum + subs.length, 0) === 1
                            ? ""
                            : "s"} of {submissions.length} total
                    </div>
                </div>

                <div
                    class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-4"
                >
                    <div class="flex items-center justify-between">
                        <h3
                            class="text-lg font-semibold flex items-center gap-2"
                        >
                            🏆 Reviewer Leaderboard
                        </h3>
                        <button
                            class="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 transition-colors text-sm"
                            onclick={loadReviewerLeaderboard}
                            disabled={leaderboardLoading}
                        >
                            {leaderboardLoading
                                ? "Loading..."
                                : leaderboardLoaded
                                  ? "Refresh"
                                  : "Load Leaderboard"}
                        </button>
                    </div>

                    {#if leaderboardLoaded && reviewerLeaderboard.length > 0}
                        <div class="overflow-x-auto">
                            <table class="w-full">
                                <thead class="bg-gray-800/50">
                                    <tr>
                                        <th
                                            class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                            >#</th
                                        >
                                        <th
                                            class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                            >Reviewer</th
                                        >
                                        <th
                                            class="px-4 py-3 text-center text-sm font-semibold text-green-400"
                                            >Approved</th
                                        >
                                        <th
                                            class="px-4 py-3 text-center text-sm font-semibold text-red-400"
                                            >Rejected</th
                                        >
                                        <th
                                            class="px-4 py-3 text-center text-sm font-semibold text-purple-400"
                                            >Total</th
                                        >
                                        <th
                                            class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                            >Last Review</th
                                        >
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-700">
                                    {#each reviewerLeaderboard as reviewer, index}
                                        <tr
                                            class="hover:bg-gray-800/30 {index ===
                                            0
                                                ? 'bg-yellow-500/10'
                                                : index === 1
                                                  ? 'bg-gray-400/10'
                                                  : index === 2
                                                    ? 'bg-amber-600/10'
                                                    : ''}"
                                        >
                                            <td
                                                class="px-4 py-3 text-sm font-bold {index ===
                                                0
                                                    ? 'text-yellow-400'
                                                    : index === 1
                                                      ? 'text-gray-300'
                                                      : index === 2
                                                        ? 'text-amber-500'
                                                        : 'text-gray-400'}"
                                            >
                                                {#if index === 0}🥇{:else if index === 1}🥈{:else if index === 2}🥉{:else}{index +
                                                        1}{/if}
                                            </td>
                                            <td class="px-4 py-3">
                                                <p
                                                    class="text-sm font-medium text-white"
                                                >
                                                    {reviewer.firstName || ""}
                                                    {reviewer.lastName || ""}
                                                </p>
                                                <p
                                                    class="text-xs text-gray-400"
                                                >
                                                    {reviewer.email ||
                                                        `ID: ${reviewer.reviewerId}`}
                                                </p>
                                            </td>
                                            <td
                                                class="px-4 py-3 text-center text-sm font-semibold text-green-400"
                                                >{reviewer.approved}</td
                                            >
                                            <td
                                                class="px-4 py-3 text-center text-sm font-semibold text-red-400"
                                                >{reviewer.rejected}</td
                                            >
                                            <td
                                                class="px-4 py-3 text-center text-sm font-bold text-purple-400"
                                                >{reviewer.total}</td
                                            >
                                            <td
                                                class="px-4 py-3 text-sm text-gray-400"
                                            >
                                                {reviewer.lastReviewedAt
                                                    ? formatDate(
                                                          reviewer.lastReviewedAt,
                                                      )
                                                    : "—"}
                                            </td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                    {:else if leaderboardLoaded}
                        <p class="text-gray-400 text-sm">
                            No reviews recorded yet.
                        </p>
                    {:else}
                        <p class="text-gray-500 text-sm">
                            Click "Load Leaderboard" to see reviewer stats.
                        </p>
                    {/if}
                </div>

                {#if submissionsLoading}
                    <div class="py-12 text-center text-gray-300">
                        Loading submissions...
                    </div>
                {:else if Object.keys(filteredGroupedSubmissions).length === 0}
                    <div class="py-12 text-center text-gray-300">
                        No submissions match your filters.
                    </div>
                {:else}
                    <div class="grid gap-6">
                        {#each sortedGroupedSubmissionsEntries as [projectIdStr, projectSubmissions]}
                            {@const projectId = Number(projectIdStr)}
                            {@const selectedSubmissionId =
                                selectedSubmissionByProject[projectId] ??
                                projectSubmissions[0].submissionId}
                            {@const selectedSubmission =
                                projectSubmissions.find(
                                    (s: AdminSubmission) =>
                                        s.submissionId === selectedSubmissionId,
                                ) ?? projectSubmissions[0]}
                            <div
                                id="submission-card-{projectId}"
                                class={`rounded-2xl border bg-gray-900/70 backdrop-blur p-4 md:p-6 space-y-4 min-w-0 max-w-full overflow-hidden ${
                                    selectedSubmission.project.user.isSus
                                        ? "border-yellow-500"
                                        : selectedSubmission.project.isFraud
                                          ? "border-red-500"
                                          : "border-gray-700"
                                }`}
                            >
                                {#if selectedSubmission.project.isFraud}
                                    <div
                                        class="bg-red-600/20 border-2 border-red-500 rounded-lg p-3 mb-4"
                                    >
                                        <p
                                            class="text-red-300 font-bold text-center uppercase tracking-wide"
                                        >
                                            ⚠️ FRAUD FLAGGED
                                        </p>
                                    </div>
                                {/if}
                                {#if selectedSubmission.project.user.isSus}
                                    <div
                                        class="bg-yellow-600/20 border-2 border-yellow-500 rounded-lg p-3 mb-4"
                                    >
                                        <p
                                            class="text-yellow-300 font-bold text-center uppercase tracking-wide"
                                        >
                                            ⚠️ SUS FLAGGED
                                        </p>
                                    </div>
                                {/if}
                                {#if projectSubmissions.length > 1}
                                    <div
                                        class="mb-4 pb-4 border-b border-gray-700"
                                    >
                                        <h4
                                            class="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3"
                                        >
                                            Submissions ({projectSubmissions.length})
                                        </h4>
                                        <div class="flex flex-wrap gap-2">
                                            {#each projectSubmissions as sub}
                                                <button
                                                    class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                                                        selectedSubmissionId ===
                                                        sub.submissionId
                                                            ? selectedSubmission
                                                                  .project.user
                                                                  .isSus
                                                                ? "bg-yellow-600 border-yellow-400 text-white"
                                                                : "bg-purple-600 border-purple-400 text-white"
                                                            : selectedSubmission
                                                                    .project
                                                                    .user.isSus
                                                              ? "bg-yellow-600/20 border-yellow-500 text-yellow-300 hover:bg-yellow-600/30"
                                                              : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                                                    }`}
                                                    onclick={() =>
                                                        (selectedSubmissionByProject =
                                                            {
                                                                ...selectedSubmissionByProject,
                                                                [projectId]:
                                                                    sub.submissionId,
                                                            })}
                                                >
                                                    {formatDate(sub.createdAt)}
                                                    <span
                                                        class={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                                                            sub.approvalStatus ===
                                                            "approved"
                                                                ? "bg-green-500/20 text-green-300"
                                                                : sub.approvalStatus ===
                                                                    "rejected"
                                                                  ? "bg-red-500/20 text-red-300"
                                                                  : "bg-yellow-500/20 text-yellow-300"
                                                        }`}
                                                    >
                                                        {sub.approvalStatus}
                                                    </span>
                                                </button>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}
                                <div
                                    class="flex flex-col gap-4 md:flex-row md:gap-6"
                                >
                                    {#if selectedSubmission.screenshotUrl || selectedSubmission.project.screenshotUrl}
                                        <div
                                            class="w-full md:w-64 flex-shrink-0"
                                        >
                                            <h4
                                                class="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-2"
                                            >
                                                Screenshot Preview
                                            </h4>
                                            <a
                                                href={selectedSubmission.screenshotUrl ||
                                                    selectedSubmission.project
                                                        .screenshotUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                <img
                                                    src={selectedSubmission.screenshotUrl ||
                                                        selectedSubmission
                                                            .project
                                                            .screenshotUrl}
                                                    alt="Project screenshot"
                                                    loading="lazy"
                                                    decoding="async"
                                                    class="w-full h-48 object-cover rounded-lg border border-gray-700 hover:border-purple-500 transition-colors cursor-pointer"
                                                />
                                            </a>
                                        </div>
                                    {/if}

                                    <div class="flex-1 space-y-4 min-w-0">
                                        <div
                                            class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"
                                        >
                                            <div>
                                                <h3
                                                    class="text-2xl font-semibold"
                                                >
                                                    {selectedSubmission.project
                                                        .projectTitle}
                                                </h3>
                                                <p
                                                    class="text-sm text-gray-400"
                                                >
                                                    Submitted {formatDate(
                                                        selectedSubmission.createdAt,
                                                    )}
                                                </p>
                                            </div>
                                            <span
                                                class={`px-3 py-1 rounded-full text-sm border self-start ${
                                                    selectedSubmission.project
                                                        .user.isSus
                                                        ? "bg-yellow-500/20 border-yellow-400 text-yellow-300"
                                                        : selectedSubmission.approvalStatus ===
                                                            "approved"
                                                          ? "bg-green-500/20 border-green-400 text-green-300"
                                                          : selectedSubmission.approvalStatus ===
                                                              "rejected"
                                                            ? "bg-red-500/20 border-red-400 text-red-300"
                                                            : "bg-yellow-500/20 border-yellow-400 text-yellow-200"
                                                }`}
                                            >
                                                {selectedSubmission.project.user
                                                    .isSus
                                                    ? "SUS"
                                                    : selectedSubmission.approvalStatus.toUpperCase()}
                                            </span>
                                        </div>

                                        <div class="grid gap-4 md:grid-cols-2">
                                            <div class="space-y-2">
                                                <h4
                                                    class="text-sm font-semibold uppercase tracking-wide text-gray-400"
                                                >
                                                    User Info
                                                </h4>
                                                <p class="text-lg font-medium">
                                                    {fullName(
                                                        selectedSubmission
                                                            .project.user,
                                                    )}
                                                </p>
                                                <p
                                                    class="text-sm text-gray-300"
                                                >
                                                    {selectedSubmission.project
                                                        .user.email}
                                                </p>
                                                <div
                                                    class="flex items-center gap-2 mb-2"
                                                >
                                                    <button
                                                        class={`px-3 py-1 text-xs rounded border transition-colors ${
                                                            selectedSubmission
                                                                .project.user
                                                                .isSus
                                                                ? "bg-yellow-600/20 border-yellow-500 text-yellow-300 hover:bg-yellow-600/30"
                                                                : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                                                        }`}
                                                        onclick={() =>
                                                            toggleSusFlag(
                                                                selectedSubmission
                                                                    .project
                                                                    .user
                                                                    .userId,
                                                                selectedSubmission
                                                                    .project
                                                                    .user.isSus,
                                                            )}
                                                    >
                                                        {selectedSubmission
                                                            .project.user.isSus
                                                            ? "⚠️ Sus Flagged"
                                                            : "Flag as Sus"}
                                                    </button>
                                                </div>
                                                {#if selectedSubmission.project.user.hackatimeAccount}
                                                    <p
                                                        class="text-sm text-purple-300"
                                                    >
                                                        🕐 Hackatime: <span
                                                            class="font-mono"
                                                            >{selectedSubmission
                                                                .project.user
                                                                .hackatimeAccount}</span
                                                        >
                                                    </p>
                                                {/if}
                                                <p
                                                    class="text-sm {selectedSubmission
                                                        .project.user
                                                        .slackUserId
                                                        ? 'text-green-300'
                                                        : 'text-gray-500'}"
                                                >
                                                    💬 Slack: {selectedSubmission
                                                        .project.user
                                                        .slackUserId
                                                        ? selectedSubmission
                                                              .project.user
                                                              .slackUserId
                                                        : "Not linked"}
                                                </p>
                                                <p
                                                    class="text-sm text-gray-400"
                                                >
                                                    {selectedSubmission.project
                                                        .user.city
                                                        ? `${selectedSubmission.project.user.city}, `
                                                        : ""}{selectedSubmission
                                                        .project.user.state}
                                                </p>
                                                <button
                                                    class="text-xs text-left text-blue-400 hover:text-blue-300 transition-colors"
                                                    onclick={() =>
                                                        (addressExpanded[
                                                            selectedSubmission.submissionId
                                                        ] =
                                                            !addressExpanded[
                                                                selectedSubmission
                                                                    .submissionId
                                                            ])}
                                                >
                                                    {addressExpanded[
                                                        selectedSubmission
                                                            .submissionId
                                                    ]
                                                        ? "▼"
                                                        : "▶"} Full Address
                                                </button>
                                                {#if addressExpanded[selectedSubmission.submissionId]}
                                                    <div
                                                        class="mt-2 p-3 bg-gray-800/50 rounded-lg border border-gray-700 text-xs text-gray-300 space-y-1"
                                                    >
                                                        {#if selectedSubmission.project.user.addressLine1}
                                                            <p>
                                                                {selectedSubmission
                                                                    .project
                                                                    .user
                                                                    .addressLine1}
                                                            </p>
                                                        {/if}
                                                        {#if selectedSubmission.project.user.addressLine2}
                                                            <p>
                                                                {selectedSubmission
                                                                    .project
                                                                    .user
                                                                    .addressLine2}
                                                            </p>
                                                        {/if}
                                                        <p>
                                                            {[
                                                                selectedSubmission
                                                                    .project
                                                                    .user.city,
                                                                selectedSubmission
                                                                    .project
                                                                    .user.state,
                                                                selectedSubmission
                                                                    .project
                                                                    .user
                                                                    .zipCode,
                                                            ]
                                                                .filter(Boolean)
                                                                .join(", ")}
                                                        </p>
                                                        {#if selectedSubmission.project.user.country}
                                                            <p>
                                                                {selectedSubmission
                                                                    .project
                                                                    .user
                                                                    .country}
                                                            </p>
                                                        {/if}
                                                        {#if selectedSubmission.project.user.birthday}
                                                            <p
                                                                class="pt-2 border-t border-gray-700"
                                                            >
                                                                Birthday: {formatDate(
                                                                    selectedSubmission
                                                                        .project
                                                                        .user
                                                                        .birthday,
                                                                )}
                                                            </p>
                                                        {/if}
                                                    </div>
                                                {/if}
                                            </div>
                                            <div class="space-y-2">
                                                <h4
                                                    class="text-sm font-semibold uppercase tracking-wide text-gray-400"
                                                >
                                                    Project Info
                                                </h4>
                                                <div
                                                    class="flex items-center gap-2 mb-2"
                                                >
                                                    <button
                                                        class={`px-3 py-1 text-xs rounded border transition-colors ${
                                                            selectedSubmission
                                                                .project.isFraud
                                                                ? "bg-red-600/20 border-red-500 text-red-300 hover:bg-red-600/30"
                                                                : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                                                        }`}
                                                        onclick={() =>
                                                            toggleFraudFlag(
                                                                selectedSubmission
                                                                    .project
                                                                    .projectId,
                                                                selectedSubmission
                                                                    .project
                                                                    .isFraud,
                                                            )}
                                                    >
                                                        {selectedSubmission
                                                            .project.isFraud
                                                            ? "🚫 Fraud Flagged"
                                                            : "Flag as Fraud"}
                                                    </button>
                                                </div>
                                                <div
                                                    class="flex items-center gap-2"
                                                >
                                                    <p
                                                        class="text-sm text-gray-300"
                                                    >
                                                        Hackatime hours: <span
                                                            class="font-semibold text-purple-300"
                                                            >{formatHours(
                                                                selectedSubmission
                                                                    .project
                                                                    .nowHackatimeHours,
                                                            )}</span
                                                        >
                                                    </p>
                                                    <button
                                                        class="px-2 py-1 text-xs rounded bg-purple-700 hover:bg-purple-600 border border-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        onclick={() =>
                                                            recalculateSubmissionHours(
                                                                selectedSubmission.submissionId,
                                                                selectedSubmission
                                                                    .project
                                                                    .projectId,
                                                            )}
                                                        disabled={submissionRecalculating[
                                                            selectedSubmission
                                                                .submissionId
                                                        ]}
                                                    >
                                                        {submissionRecalculating[
                                                            selectedSubmission
                                                                .submissionId
                                                        ]
                                                            ? "⟳ Calculating..."
                                                            : "⟳ Recalc"}
                                                    </button>
                                                </div>
                                                {#if selectedSubmission.project.nowHackatimeProjects?.length}
                                                    <p
                                                        class="text-sm text-gray-400"
                                                    >
                                                        Projects: {selectedSubmission.project.nowHackatimeProjects.join(
                                                            ", ",
                                                        )}
                                                    </p>
                                                {/if}
                                                {#if selectedSubmission.project.approvedHours !== null}
                                                    <p
                                                        class="text-sm text-green-300"
                                                    >
                                                        Approved hours: <span
                                                            class="font-semibold"
                                                            >{formatHours(
                                                                selectedSubmission
                                                                    .project
                                                                    .approvedHours,
                                                            )}</span
                                                        >
                                                    </p>
                                                {/if}
                                            </div>
                                        </div>

                                        {#if selectedSubmission.description || selectedSubmission.project.description}
                                            <div class="space-y-2">
                                                <h4
                                                    class="text-sm font-semibold uppercase tracking-wide text-gray-400"
                                                >
                                                    Description
                                                </h4>
                                                <p
                                                    class="text-sm text-gray-300 break-words"
                                                >
                                                    {selectedSubmission.description ||
                                                        selectedSubmission
                                                            .project
                                                            .description}
                                                </p>
                                            </div>
                                        {/if}

                                        {#if selectedSubmission.hoursJustification}
                                            <div
                                                class="space-y-2 bg-blue-950/30 border border-blue-800 rounded-lg p-4"
                                            >
                                                <h4
                                                    class="text-sm font-semibold uppercase tracking-wide text-blue-300"
                                                >
                                                    User Feedback
                                                </h4>
                                                <p
                                                    class="text-sm text-gray-300 break-words"
                                                >
                                                    {selectedSubmission.hoursJustification}
                                                </p>
                                            </div>
                                        {/if}

                                        {#if selectedSubmission.project.hoursJustification}
                                            <div
                                                class="space-y-2 bg-purple-950/30 border border-purple-800 rounded-lg p-4"
                                            >
                                                <h4
                                                    class="text-sm font-semibold uppercase tracking-wide text-purple-300"
                                                >
                                                    Hours Justification (Admin
                                                    Only)
                                                </h4>
                                                <p
                                                    class="text-sm text-gray-300 break-words"
                                                >
                                                    {selectedSubmission.project
                                                        .hoursJustification}
                                                </p>
                                            </div>
                                        {/if}

                                        {#if selectedSubmission.project.adminComment}
                                            <div
                                                class="space-y-2 bg-orange-950/30 border border-orange-800 rounded-lg p-4"
                                            >
                                                <h4
                                                    class="text-sm font-semibold uppercase tracking-wide text-orange-300"
                                                >
                                                    Admin Comment
                                                </h4>
                                                <p
                                                    class="text-sm text-gray-300 break-words"
                                                >
                                                    {selectedSubmission.project.adminComment}
                                                </p>
                                            </div>
                                        {/if}

                                        <div class="flex flex-wrap gap-2">
                                            <h4
                                                class="text-sm font-semibold uppercase tracking-wide text-gray-400 w-full"
                                            >
                                                Quick Actions
                                            </h4>
                                            {#if selectedSubmission.playableUrl || selectedSubmission.project.playableUrl}
                                                {@const normalizedPlayableUrl =
                                                    normalizeUrl(
                                                        selectedSubmission.playableUrl ||
                                                            selectedSubmission
                                                                .project
                                                                .playableUrl,
                                                    )}
                                                {#if normalizedPlayableUrl}
                                                    <a
                                                        href={normalizedPlayableUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 border border-blue-400 text-white text-sm transition-colors"
                                                    >
                                                        🎮 View Live Demo
                                                    </a>
                                                {/if}
                                            {/if}
                                            {#if selectedSubmission.repoUrl || selectedSubmission.project.repoUrl}
                                                <a
                                                    href={selectedSubmission.repoUrl ||
                                                        selectedSubmission
                                                            .project.repoUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    class="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 border border-gray-500 text-white text-sm transition-colors"
                                                >
                                                    💻 View Repository
                                                </a>
                                                <a
                                                    href={`https://airlock.hackclub.com/?r=${selectedSubmission.repoUrl || selectedSubmission.project.repoUrl}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    class="px-4 py-2 rounded-lg bg-orange-700 hover:bg-orange-600 border border-orange-500 text-white text-sm transition-colors"
                                                >
                                                    Open in Airlock
                                                </a>
                                            {/if}
                                            {#if selectedSubmission.screenshotUrl || selectedSubmission.project.screenshotUrl}
                                                <a
                                                    href={selectedSubmission.screenshotUrl ||
                                                        selectedSubmission
                                                            .project
                                                            .screenshotUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    class="px-4 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 border border-purple-500 text-white text-sm transition-colors"
                                                >
                                                    📸 Full Screenshot
                                                </a>
                                            {/if}
                                            {#if generateBillyLink(selectedSubmission.project.user.hackatimeAccount)}
                                                {@const billyLinkResult =
                                                    generateBillyLink(
                                                        selectedSubmission
                                                            .project.user
                                                            .hackatimeAccount,
                                                    )}
                                                <a
                                                    href={billyLinkResult}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    class="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 border border-green-400 text-white text-sm transition-colors"
                                                >
                                                    Billy
                                                </a>
                                            {:else}
                                                <span
                                                    class="px-4 py-2 rounded-lg bg-gray-600 border border-gray-500 text-gray-400 text-sm cursor-not-allowed"
                                                    title="Hackatime account not available"
                                                >
                                                    Billy
                                                </span>
                                            {/if}
                                        </div>
                                    </div>
                                </div>

                                <div
                                    class="border-t border-gray-700 pt-4 space-y-4"
                                >
                                    <h4
                                        class="text-sm font-semibold uppercase tracking-wide text-gray-400"
                                    >
                                        Review Controls
                                    </h4>

                                    <div class="grid gap-4 md:grid-cols-3">
                                        <div class="space-y-2">
                                            <label
                                                class="text-sm font-medium text-gray-300"
                                                for={statusIdFor(
                                                    selectedSubmission.submissionId,
                                                )}>Status</label
                                            >
                                            <select
                                                id={statusIdFor(
                                                    selectedSubmission.submissionId,
                                                )}
                                                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                bind:value={
                                                    submissionDrafts[
                                                        selectedSubmission
                                                            .submissionId
                                                    ].approvalStatus
                                                }
                                            >
                                                {#each statusOptions as option}
                                                    <option value={option}
                                                        >{option}</option
                                                    >
                                                {/each}
                                            </select>
                                        </div>
                                        <div class="space-y-2">
                                            <label
                                                class="text-sm font-medium text-gray-300"
                                                for={hoursIdFor(
                                                    selectedSubmission.submissionId,
                                                )}>Approved Hours</label
                                            >
                                            <input
                                                id={hoursIdFor(
                                                    selectedSubmission.submissionId,
                                                )}
                                                type="number"
                                                step="0.1"
                                                min="0"
                                                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                bind:value={
                                                    submissionDrafts[
                                                        selectedSubmission
                                                            .submissionId
                                                    ].approvedHours
                                                }
                                            />
                                        </div>
                                        <div class="space-y-2">
                                            <label
                                                class="text-sm font-medium text-gray-300"
                                                for={userFeedbackIdFor(
                                                    selectedSubmission.submissionId,
                                                )}
                                                >User Feedback (sent via email)</label
                                            >
                                            <textarea
                                                id={userFeedbackIdFor(
                                                    selectedSubmission.submissionId,
                                                )}
                                                class="w-full min-w-0 rounded-lg border border-blue-600 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                                                rows="2"
                                                placeholder="Feedback to send to the user..."
                                                bind:value={
                                                    submissionDrafts[
                                                        selectedSubmission
                                                            .submissionId
                                                    ].userFeedback
                                                }
                                            ></textarea>
                                        </div>
                                        <div class="space-y-2">
                                            <label
                                                class="text-sm font-medium text-gray-300"
                                                for={justificationIdFor(
                                                    selectedSubmission.submissionId,
                                                )}
                                                >Hours Justification (admin
                                                only, synced to Airtable)</label
                                            >
                                            <textarea
                                                id={justificationIdFor(
                                                    selectedSubmission.submissionId,
                                                )}
                                                class="w-full min-w-0 rounded-lg border border-purple-600 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
                                                rows="2"
                                                placeholder="Internal justification for Airtable..."
                                                bind:value={
                                                    submissionDrafts[
                                                        selectedSubmission
                                                            .submissionId
                                                    ].hoursJustification
                                                }
                                            ></textarea>
                                        </div>
                                        <div class="space-y-2">
                                            <label
                                                class="text-sm font-medium text-gray-300"
                                                for="submission-{selectedSubmission.submissionId}-admin-comment"
                                                >Admin Comment (internal, logged in timeline)</label
                                            >
                                            <textarea
                                                id="submission-{selectedSubmission.submissionId}-admin-comment"
                                                class="w-full min-w-0 rounded-lg border border-orange-600 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-y"
                                                rows="2"
                                                placeholder="Internal comment (visible to admins only)..."
                                                bind:value={
                                                    submissionDrafts[
                                                        selectedSubmission
                                                            .submissionId
                                                    ].adminComment
                                                }
                                            ></textarea>
                                        </div>
                                    </div>

                                    <div class="flex items-center gap-3 py-3">
                                        <label
                                            class="flex items-center gap-2 cursor-pointer"
                                        >
                                            <input
                                                type="checkbox"
                                                class="w-4 h-4 rounded border-gray-700 bg-gray-800 text-purple-600 focus:ring-2 focus:ring-purple-500 focus:ring-offset-gray-900"
                                                bind:checked={
                                                    submissionDrafts[
                                                        selectedSubmission
                                                            .submissionId
                                                    ].sendEmailNotification
                                                }
                                            />
                                            <span
                                                class="text-sm font-medium text-gray-300"
                                                >Send email notification on
                                                status change</span
                                            >
                                        </label>
                                    </div>

                                    <div
                                        class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                                    >
                                        <div class="flex flex-wrap gap-2">
                                            {#if selectedSubmission.approvalStatus !== "approved"}
                                                <button
                                                    class="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 border border-green-400 transition-colors disabled:bg-gray-700 disabled:cursor-not-allowed"
                                                    onclick={() =>
                                                        quickApprove(
                                                            selectedSubmission,
                                                        )}
                                                    disabled={submissionSaving[
                                                        selectedSubmission
                                                            .submissionId
                                                    ]}
                                                >
                                                    ✓ Quick Approve
                                                </button>
                                            {/if}
                                            {#if selectedSubmission.approvalStatus !== "rejected"}
                                                <button
                                                    class="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 border border-red-400 transition-colors disabled:bg-gray-700 disabled:cursor-not-allowed"
                                                    onclick={() =>
                                                        quickDeny(
                                                            selectedSubmission.submissionId,
                                                        )}
                                                    disabled={submissionSaving[
                                                        selectedSubmission
                                                            .submissionId
                                                    ]}
                                                >
                                                    ✕ Quick Deny
                                                </button>
                                            {/if}
                                            <button
                                                class="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 transition-colors disabled:bg-gray-700 disabled:cursor-not-allowed"
                                                onclick={() =>
                                                    saveSubmission(
                                                        selectedSubmission.submissionId,
                                                    )}
                                                disabled={submissionSaving[
                                                    selectedSubmission
                                                        .submissionId
                                                ]}
                                            >
                                                {submissionSaving[
                                                    selectedSubmission
                                                        .submissionId
                                                ]
                                                    ? "Saving..."
                                                    : "💾 Save Changes"}
                                            </button>
                                            <button
                                                class="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
                                                onclick={() =>
                                                    setSubmissionDraft(
                                                        selectedSubmission,
                                                        true,
                                                    )}
                                            >
                                                ↺ Reset
                                            </button>
                                        </div>
                                        <div class="text-sm">
                                            {#if submissionErrors[selectedSubmission.submissionId]}
                                                <span class="text-red-400"
                                                    >{submissionErrors[
                                                        selectedSubmission
                                                            .submissionId
                                                    ]}</span
                                                >
                                            {:else if submissionSuccess[selectedSubmission.submissionId]}
                                                <span class="text-green-400"
                                                    >{submissionSuccess[
                                                        selectedSubmission
                                                            .submissionId
                                                    ]}</span
                                                >
                                            {/if}
                                        </div>
                                    </div>
                                </div>

                                <!-- Timeline Section -->
                                <div class="border-t border-gray-700 pt-4">
                                    <button
                                        class="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-200 transition-colors"
                                        onclick={() => loadTimeline(selectedSubmission.project.projectId)}
                                    >
                                        {#if timelineLoading[selectedSubmission.project.projectId]}
                                            <span class="animate-spin">&#8635;</span> Loading Timeline...
                                        {:else}
                                            <span>{timelineOpen[selectedSubmission.project.projectId] ? '▼' : '▶'}</span>
                                            Project Timeline
                                        {/if}
                                    </button>

                                    {#if timelineOpen[selectedSubmission.project.projectId] && timelineByProject[selectedSubmission.project.projectId]}
                                        {@const timeline = timelineByProject[selectedSubmission.project.projectId].timeline}
                                        <div class="mt-4 relative ml-3">
                                            <!-- Vertical line -->
                                            <div class="absolute left-1 top-0 bottom-0 w-0.5 bg-gray-700"></div>

                                            <div class="space-y-3">
                                                {#each timeline as event, i}
                                                    <div class="relative pl-6">
                                                        <!-- Dot -->
                                                        <div class="absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full {timelineDotColor(event.type)} ring-2 ring-gray-900"></div>

                                                        <div class="rounded-lg border p-3 {timelineEventColor(event.type)}">
                                                            <div class="flex flex-wrap items-center gap-2 mb-1">
                                                                <span class="text-xs font-bold uppercase tracking-wide text-gray-200">
                                                                    {timelineEventLabel(event.type)}
                                                                </span>
                                                                <span class="text-xs text-gray-400">
                                                                    {formatDate(event.timestamp)}
                                                                </span>
                                                                {#if event.actor}
                                                                    <span class="text-xs text-gray-400">
                                                                        by {event.actor.firstName ?? ''} {event.actor.lastName ?? ''} ({event.actor.email})
                                                                    </span>
                                                                {/if}
                                                            </div>

                                                            {#if event.type === 'admin_review' && event.details.newStatus}
                                                                <div class="flex items-center gap-2 text-xs">
                                                                    {#if event.details.changes?.previousStatus}
                                                                        <span class="px-1.5 py-0.5 rounded {event.details.changes.previousStatus === 'approved' ? 'bg-green-500/20 text-green-300' : event.details.changes.previousStatus === 'rejected' ? 'bg-red-500/20 text-red-300' : 'bg-yellow-500/20 text-yellow-300'}">
                                                                            {event.details.changes.previousStatus}
                                                                        </span>
                                                                        <span class="text-gray-500">&rarr;</span>
                                                                    {/if}
                                                                    <span class="px-1.5 py-0.5 rounded {event.details.newStatus === 'approved' ? 'bg-green-500/20 text-green-300' : event.details.newStatus === 'rejected' ? 'bg-red-500/20 text-red-300' : 'bg-yellow-500/20 text-yellow-300'}">
                                                                        {event.details.newStatus}
                                                                    </span>
                                                                    {#if event.details.approvedHours != null}
                                                                        <span class="text-gray-400">({event.details.approvedHours}h)</span>
                                                                    {/if}
                                                                    {#if event.details.changes?.quickApprove}
                                                                        <span class="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-600 text-[10px]">Quick Approve</span>
                                                                    {/if}
                                                                </div>
                                                            {/if}

                                                            {#if event.type === 'admin_update' && event.details.changes}
                                                                <div class="text-xs text-gray-300 space-y-0.5">
                                                                    {#if event.details.changes.adminComment !== undefined}
                                                                        <p>Comment: <span class="text-gray-100">"{event.details.changes.adminComment}"</span></p>
                                                                    {/if}
                                                                    {#if event.details.changes.approvedHours !== undefined}
                                                                        <p>Approved hours set to <span class="font-semibold text-gray-100">{event.details.changes.approvedHours}</span></p>
                                                                    {/if}
                                                                    {#if event.details.changes.userFeedback !== undefined}
                                                                        <p>User feedback updated</p>
                                                                    {/if}
                                                                    {#if event.details.changes.hoursJustification !== undefined}
                                                                        <p>Hours justification updated</p>
                                                                    {/if}
                                                                </div>
                                                            {/if}

                                                            {#if event.details.changes?.adminComment !== undefined && event.type === 'admin_review'}
                                                                <p class="text-xs text-gray-300 mt-1">Comment: <span class="text-gray-100">"{event.details.changes.adminComment}"</span></p>
                                                            {/if}

                                                            {#if event.type === 'project_updated' && event.details.changedFields}
                                                                <div class="text-xs text-gray-300 space-y-0.5">
                                                                    {#each Object.entries(event.details.changedFields) as [field, change]}
                                                                        <p><span class="text-gray-400">{field}:</span> changed</p>
                                                                    {/each}
                                                                </div>
                                                            {/if}

                                                            {#if (event.type === 'submission' || event.type === 'resubmission') && event.details.hackatimeHours != null}
                                                                <p class="text-xs text-gray-400">Hackatime hours at submission: <span class="text-gray-200 font-semibold">{event.details.hackatimeHours}</span></p>
                                                            {/if}
                                                        </div>
                                                    </div>
                                                {/each}
                                            </div>
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </section>
        {:else if activeTab === "projects"}
            <section class="space-y-4">
                <div
                    class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
                >
                    <h2 class="text-2xl font-semibold">Projects</h2>
                    <div class="flex flex-wrap items-center gap-4">
                        <div class="flex items-center gap-3">
                            <label
                                class="flex items-center gap-2 cursor-pointer"
                            >
                                <input
                                    type="checkbox"
                                    bind:checked={showFraudProjects}
                                    class="w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500 focus:ring-2"
                                />
                                <span class="text-sm text-gray-300"
                                    >Show fraud projects</span
                                >
                            </label>
                            <label
                                class="flex items-center gap-2 cursor-pointer"
                            >
                                <input
                                    type="checkbox"
                                    bind:checked={showSusProjects}
                                    class="w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500 focus:ring-2"
                                />
                                <span class="text-sm text-gray-300"
                                    >Show sus projects</span
                                >
                            </label>
                        </div>
                        <button
                            class="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 transition-colors"
                            onclick={async () => {
                                await loadProjects();
                                await loadUsers();
                            }}
                        >
                            Refresh
                        </button>
                    </div>
                </div>

                {#if projectsLoading}
                    <div class="py-12 text-center text-gray-300">
                        Loading projects...
                    </div>
                {:else}
                    {@const filteredProjects = projects.filter((project) => {
                        if (!showFraudProjects && project.isFraud) return false;
                        if (!showSusProjects && project.user.isSus)
                            return false;
                        return true;
                    })}
                    {#if filteredProjects.length === 0}
                        <div class="py-12 text-center text-gray-300">
                            No projects available.
                        </div>
                    {:else}
                        <div class="grid gap-6">
                            {#each filteredProjects as project (project.projectId)}
                                <div
                                    class={`rounded-2xl border bg-gray-900/70 backdrop-blur p-6 space-y-4 ${
                                        project.user.isSus
                                            ? "border-yellow-500"
                                            : project.isFraud
                                              ? "border-red-500"
                                              : "border-gray-700"
                                    }`}
                                >
                                    {#if project.isFraud}
                                        <div
                                            class="bg-red-600/20 border-2 border-red-500 rounded-lg p-3 mb-4"
                                        >
                                            <p
                                                class="text-red-300 font-bold text-center uppercase tracking-wide"
                                            >
                                                ⚠️ FRAUD FLAGGED
                                            </p>
                                        </div>
                                    {/if}
                                    {#if project.user.isSus}
                                        <div
                                            class="bg-yellow-600/20 border-2 border-yellow-500 rounded-lg p-3 mb-4"
                                        >
                                            <p
                                                class="text-yellow-300 font-bold text-center uppercase tracking-wide"
                                            >
                                                ⚠️ SUS FLAGGED
                                            </p>
                                        </div>
                                    {/if}
                                    <div
                                        class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"
                                    >
                                        <div>
                                            <h3 class="text-xl font-semibold">
                                                {project.projectTitle}
                                            </h3>
                                            <p class="text-sm text-gray-400">
                                                Owner: {fullName(project.user)} ({project
                                                    .user.email})
                                            </p>
                                        </div>
                                        <div
                                            class="flex flex-wrap gap-2 text-sm text-gray-300"
                                        >
                                            <span
                                                class="rounded-full border border-gray-600 px-3 py-1"
                                                >Type: {project.projectType}</span
                                            >
                                            <span
                                                class="rounded-full border border-gray-600 px-3 py-1"
                                                >Hackatime: {formatHours(
                                                    project.nowHackatimeHours,
                                                )}</span
                                            >
                                            <span
                                                class="rounded-full border border-gray-600 px-3 py-1"
                                                >{project.isLocked
                                                    ? "Locked"
                                                    : "Unlocked"}</span
                                            >
                                        </div>
                                    </div>

                                    {#if project.description}
                                        <p
                                            class="text-sm text-gray-300 leading-relaxed"
                                        >
                                            {project.description}
                                        </p>
                                    {/if}

                                    <div class="grid gap-4 md:grid-cols-3">
                                        <div class="space-y-2">
                                            <h4
                                                class="text-sm font-semibold uppercase tracking-wide text-gray-400"
                                            >
                                                Hackatime projects
                                            </h4>
                                            {#if project.nowHackatimeProjects?.length}
                                                <ul
                                                    class="text-sm text-gray-300 list-disc list-inside space-y-1"
                                                >
                                                    {#each project.nowHackatimeProjects as name}
                                                        <li>{name}</li>
                                                    {/each}
                                                </ul>
                                            {:else}
                                                <p
                                                    class="text-sm text-gray-500"
                                                >
                                                    No projects linked.
                                                </p>
                                            {/if}
                                        </div>
                                        <div class="space-y-2">
                                            <h4
                                                class="text-sm font-semibold uppercase tracking-wide text-gray-400"
                                            >
                                                Latest submission
                                            </h4>
                                            {#if project.submissions.length > 0}
                                                <p
                                                    class="text-sm text-gray-300"
                                                >
                                                    {project.submissions[0]
                                                        .approvalStatus} • {formatDate(
                                                        project.submissions[0]
                                                            .createdAt,
                                                    )}
                                                </p>
                                                <p
                                                    class="text-sm text-gray-400"
                                                >
                                                    Approved hours: {formatHours(
                                                        project.submissions[0]
                                                            .approvedHours,
                                                    )}
                                                </p>
                                            {:else}
                                                <p
                                                    class="text-sm text-gray-500"
                                                >
                                                    No submissions yet.
                                                </p>
                                            {/if}
                                        </div>
                                        <div class="space-y-2">
                                            <h4
                                                class="text-sm font-semibold uppercase tracking-wide text-gray-400"
                                            >
                                                Links
                                            </h4>
                                            {#if project.playableUrl}
                                                {@const normalizedPlayableUrl =
                                                    normalizeUrl(
                                                        project.playableUrl,
                                                    )}
                                                {#if normalizedPlayableUrl}
                                                    <a
                                                        class="text-purple-300 hover:text-purple-200 text-sm break-words"
                                                        href={normalizedPlayableUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        >Playable</a
                                                    >
                                                {/if}
                                            {/if}
                                            {#if project.repoUrl}
                                                <a
                                                    class="text-purple-300 hover:text-purple-200 text-sm break-words"
                                                    href={project.repoUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    >Repository</a
                                                >
                                            {/if}
                                            {#if project.screenshotUrl}
                                                <a
                                                    class="text-purple-300 hover:text-purple-200 text-sm break-words"
                                                    href={project.screenshotUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    >Screenshot</a
                                                >
                                            {/if}
                                        </div>
                                    </div>

                                    <div
                                        class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
                                    >
                                        <div class="flex flex-wrap gap-3">
                                            <button
                                                class="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 transition-colors disabled:bg-gray-700 disabled:cursor-not-allowed"
                                                onclick={() =>
                                                    recalculateProject(
                                                        project.projectId,
                                                    )}
                                                disabled={projectBusy[
                                                    project.projectId
                                                ]}
                                            >
                                                {projectBusy[project.projectId]
                                                    ? "Processing..."
                                                    : "Recalculate hours"}
                                            </button>
                                            <button
                                                class={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                                                    project.user.isSus
                                                        ? "bg-yellow-600/20 border-yellow-500 text-yellow-300 hover:bg-yellow-600/30"
                                                        : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                                                }`}
                                                onclick={() =>
                                                    toggleSusFlag(
                                                        project.user.userId,
                                                        project.user.isSus,
                                                    )}
                                            >
                                                {project.user.isSus
                                                    ? "⚠️ Sus Flagged"
                                                    : "Flag as Sus"}
                                            </button>
                                            <button
                                                class={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                                                    project.isFraud
                                                        ? "bg-red-600/20 border-red-500 text-red-300 hover:bg-red-600/30"
                                                        : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                                                }`}
                                                onclick={() =>
                                                    toggleFraudFlag(
                                                        project.projectId,
                                                        project.isFraud,
                                                    )}
                                            >
                                                {project.isFraud
                                                    ? "🚫 Fraud Flagged"
                                                    : "Flag as Fraud"}
                                            </button>
                                            <button
                                                class="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 transition-colors disabled:bg-gray-700 disabled:cursor-not-allowed"
                                                onclick={() =>
                                                    deleteProject(
                                                        project.projectId,
                                                    )}
                                                disabled={projectBusy[
                                                    project.projectId
                                                ]}
                                            >
                                                Delete project
                                            </button>
                                        </div>
                                        <div class="text-sm">
                                            {#if projectErrors[project.projectId]}
                                                <span class="text-red-400"
                                                    >{projectErrors[
                                                        project.projectId
                                                    ]}</span
                                                >
                                            {:else if projectSuccess[project.projectId]}
                                                <span class="text-green-400"
                                                    >{projectSuccess[
                                                        project.projectId
                                                    ]}</span
                                                >
                                            {/if}
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                {/if}
            </section>
        {:else if activeTab === "users"}
            <section class="space-y-4">
                <div class="flex items-center justify-between">
                    <h2 class="text-2xl font-semibold">Users</h2>
                    <button
                        class="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 transition-colors"
                        onclick={loadUsers}
                    >
                        Refresh
                    </button>
                </div>

                {#if usersLoading}
                    <div class="py-12 text-center text-gray-300">
                        Loading users...
                    </div>
                {:else if users.length === 0}
                    <div class="py-12 text-center text-gray-300">
                        No users available.
                    </div>
                {:else}
                    <div class="grid gap-6">
                        {#each users as user (user.userId)}
                            <div
                                class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-4"
                            >
                                <div
                                    class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"
                                >
                                    <div>
                                        <h3 class="text-xl font-semibold">
                                            {fullName(user)}
                                        </h3>
                                        <p class="text-sm text-gray-300">
                                            {user.email}
                                        </p>
                                    </div>
                                    <div
                                        class="flex flex-wrap gap-2 text-sm text-gray-300"
                                    >
                                        <span
                                            class="rounded-full border border-gray-600 px-3 py-1 capitalize"
                                            >{user.role}</span
                                        >
                                        <span
                                            class="rounded-full border border-gray-600 px-3 py-1"
                                            >{user.onboardComplete
                                                ? "Onboarding complete"
                                                : "Onboarding pending"}</span
                                        >
                                        <span
                                            class="rounded-full border border-gray-600 px-3 py-1"
                                        >
                                            Projects: {user.projects.length}
                                        </span>
                                    </div>
                                </div>

                                <div
                                    class="grid gap-4 md:grid-cols-3 text-sm text-gray-300"
                                >
                                    <div>
                                        <p>
                                            Joined {formatDate(user.createdAt)}
                                        </p>
                                        <p>
                                            Updated {formatDate(user.updatedAt)}
                                        </p>
                                    </div>
                                    <div>
                                        <p>{user.addressLine1}</p>
                                        <p>{user.addressLine2}</p>
                                        <p>
                                            {[
                                                user.city,
                                                user.state,
                                                user.zipCode,
                                            ]
                                                .filter(Boolean)
                                                .join(", ")}
                                        </p>
                                        <p>{user.country}</p>
                                    </div>
                                    <div class="space-y-2">
                                        <p>
                                            🕐 Hackatime: {user.hackatimeAccount ??
                                                "Not linked"}
                                        </p>
                                        {#if slackEditingUserId === user.userId}
                                            <div
                                                class="space-y-2 p-3 bg-gray-800 rounded-lg border border-gray-700"
                                            >
                                                <div class="flex gap-2">
                                                    <input
                                                        type="text"
                                                        class="flex-1 rounded-lg border border-gray-600 bg-gray-900 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                                                        placeholder="Slack User ID (e.g., U12345678)"
                                                        bind:value={
                                                            slackEditValue
                                                        }
                                                    />
                                                    <button
                                                        class="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded transition-colors disabled:opacity-50"
                                                        onclick={() =>
                                                            lookupSlackByEmail(
                                                                user.email,
                                                            )}
                                                        disabled={slackLookupLoading}
                                                    >
                                                        {slackLookupLoading
                                                            ? "..."
                                                            : "Lookup"}
                                                    </button>
                                                </div>
                                                {#if slackLookupResult}
                                                    <p
                                                        class="text-xs {slackLookupResult.found
                                                            ? 'text-green-400'
                                                            : 'text-yellow-400'}"
                                                    >
                                                        {slackLookupResult.found
                                                            ? `Found: ${slackLookupResult.displayName}`
                                                            : slackLookupResult.message}
                                                    </p>
                                                {/if}
                                                {#if slackError}
                                                    <p
                                                        class="text-xs text-red-400"
                                                    >
                                                        {slackError}
                                                    </p>
                                                {/if}
                                                <div class="flex gap-2">
                                                    <button
                                                        class="px-2 py-1 text-xs bg-green-600 hover:bg-green-500 rounded transition-colors disabled:opacity-50"
                                                        onclick={() =>
                                                            saveSlackId(
                                                                user.userId,
                                                            )}
                                                        disabled={slackSaving}
                                                    >
                                                        {slackSaving
                                                            ? "Saving..."
                                                            : "Save"}
                                                    </button>
                                                    <button
                                                        class="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                                                        onclick={cancelSlackEdit}
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        {:else}
                                            <div
                                                class="flex items-center gap-2"
                                            >
                                                <span
                                                    class={user.slackUserId
                                                        ? "text-green-400"
                                                        : "text-gray-500"}
                                                >
                                                    💬 Slack: {user.slackUserId
                                                        ? user.slackUserId
                                                        : "Not linked"}
                                                </span>
                                                <button
                                                    class="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                                                    onclick={() =>
                                                        startSlackEdit(user)}
                                                >
                                                    Edit
                                                </button>
                                            </div>
                                        {/if}
                                    </div>
                                </div>

                                {#if user.projects.length > 0}
                                    <div class="space-y-3">
                                        <h4
                                            class="text-sm font-semibold uppercase tracking-wide text-gray-400"
                                        >
                                            Projects
                                        </h4>
                                        <div class="grid gap-3">
                                            {#each user.projects as project (project.projectId)}
                                                <div
                                                    class="rounded-xl border border-gray-700 bg-gray-800/60 p-4 space-y-2"
                                                >
                                                    <div
                                                        class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"
                                                    >
                                                        <div>
                                                            <p
                                                                class="font-medium"
                                                            >
                                                                {project.projectTitle}
                                                            </p>
                                                            <p
                                                                class="text-xs uppercase tracking-wide text-gray-400"
                                                            >
                                                                {project.projectType}
                                                            </p>
                                                        </div>
                                                        <div
                                                            class="flex flex-wrap gap-2 text-xs text-gray-300"
                                                        >
                                                            <span
                                                                class="rounded-full border border-gray-600 px-2 py-1"
                                                                >Hackatime {formatHours(
                                                                    project.nowHackatimeHours,
                                                                )}</span
                                                            >
                                                            <span
                                                                class="rounded-full border border-gray-600 px-2 py-1"
                                                                >{project.isLocked
                                                                    ? "Locked"
                                                                    : "Unlocked"}</span
                                                            >
                                                        </div>
                                                    </div>
                                                    {#if project.submissions.length > 0}
                                                        <p
                                                            class="text-xs text-gray-400"
                                                        >
                                                            Latest submission: {project
                                                                .submissions[0]
                                                                .approvalStatus}
                                                            • {formatDate(
                                                                project
                                                                    .submissions[0]
                                                                    .createdAt,
                                                            )}
                                                        </p>
                                                    {:else}
                                                        <p
                                                            class="text-xs text-gray-500"
                                                        >
                                                            No submissions yet.
                                                        </p>
                                                    {/if}
                                                </div>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                {/if}
            </section>
        {:else if activeTab === "shop"}
            <section class="space-y-4">
                <div
                    class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
                >
                    <h2 class="text-2xl font-semibold">Shop Management</h2>
                    <div class="flex items-center gap-2">
                        {#if shops.length > 0}
                            <select
                                class="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                value={selectedShopId}
                                onchange={(e) => {
                                    const val = parseInt((e.target as HTMLSelectElement).value, 10);
                                    if (val) onShopSelected(val);
                                }}
                            >
                                {#each shops as shop (shop.shopId)}
                                    <option value={shop.shopId}>
                                        {shop.slug}
                                        {!shop.isActive ? " (inactive)" : ""}
                                        {!shop.isPublic ? " (hidden)" : ""}
                                    </option>
                                {/each}
                            </select>
                        {/if}
                        <button
                            class={`px-4 py-2 rounded-lg border transition-colors ${showShopManager ? "bg-yellow-600 border-yellow-400" : "bg-gray-800 border-gray-700 hover:bg-gray-700"}`}
                            onclick={() => (showShopManager = !showShopManager)}
                        >
                            Manage Shops
                        </button>
                    </div>
                </div>

                {#if showShopManager}
                    <div class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-6">
                        <h3 class="text-lg font-semibold">
                            {editingShopId ? "Edit Shop" : "Create New Shop"}
                        </h3>
                        <div class="grid gap-4 md:grid-cols-2">
                            <div class="space-y-2">
                                <label class="text-sm font-medium text-gray-300" for="shop-slug">Slug *</label>
                                <input
                                    id="shop-slug"
                                    type="text"
                                    class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    placeholder="my-shop"
                                    bind:value={shopForm.slug}
                                />
                            </div>
                            <div class="space-y-2">
                                <label class="text-sm font-medium text-gray-300" for="shop-description">Description</label>
                                <input
                                    id="shop-description"
                                    type="text"
                                    class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    placeholder="Shop description..."
                                    bind:value={shopForm.description}
                                />
                            </div>
                            <div class="flex items-center gap-4">
                                <label class="flex items-center gap-2 text-sm text-gray-300">
                                    <input type="checkbox" bind:checked={shopForm.isActive} class="rounded" />
                                    Active
                                </label>
                                <label class="flex items-center gap-2 text-sm text-gray-300">
                                    <input type="checkbox" bind:checked={shopForm.isPublic} class="rounded" />
                                    Public
                                </label>
                            </div>
                        </div>

                        <div class="flex flex-wrap gap-3 items-center">
                            <button
                                class="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 transition-colors disabled:bg-gray-700 disabled:cursor-not-allowed"
                                onclick={saveShop}
                                disabled={shopFormSaving || !shopForm.slug}
                            >
                                {shopFormSaving ? "Saving..." : editingShopId ? "Update Shop" : "Create Shop"}
                            </button>
                            {#if editingShopId}
                                <button
                                    class="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
                                    onclick={resetShopForm}
                                >
                                    Cancel Edit
                                </button>
                            {/if}
                            {#if shopFormError}
                                <span class="text-red-400 text-sm">{shopFormError}</span>
                            {/if}
                            {#if shopFormSuccess}
                                <span class="text-green-400 text-sm">{shopFormSuccess}</span>
                            {/if}
                        </div>

                        {#if shops.length > 0}
                            <div class="space-y-2">
                                {#each shops as shop (shop.shopId)}
                                    <div class="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800 px-4 py-3">
                                        <div class="flex items-center gap-3">
                                            <span class="font-medium">{shop.slug}</span>
                                            {#if shop.description}
                                                <span class="text-sm text-gray-400">{shop.description}</span>
                                            {/if}
                                            {#if !shop.isActive}
                                                <span class="px-2 py-0.5 text-xs bg-red-900/50 text-red-400 rounded">Inactive</span>
                                            {/if}
                                            {#if !shop.isPublic}
                                                <span class="px-2 py-0.5 text-xs bg-yellow-900/50 text-yellow-400 rounded">Hidden</span>
                                            {/if}
                                        </div>
                                        <div class="flex gap-2">
                                            <button
                                                class="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded transition-colors"
                                                onclick={() => startEditShop(shop)}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                class="px-3 py-1 text-xs bg-red-600 hover:bg-red-500 rounded transition-colors"
                                                onclick={() => deleteShop(shop.shopId)}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                {/if}

                {#if !selectedShopId && shops.length === 0}
                    <div class="py-12 text-center text-gray-300">
                        No shops yet. Create one using "Manage Shops" above.
                    </div>
                {:else if !selectedShopId}
                    <div class="py-12 text-center text-gray-300">
                        Select a shop above to manage its items and transactions.
                    </div>
                {:else}
                <div
                    class="flex gap-2"
                >
                    <button
                        class={`px-4 py-2 rounded-lg border transition-colors ${shopSubTab === "items" ? "bg-purple-600 border-purple-400" : "bg-gray-800 border-gray-700 hover:bg-gray-700"}`}
                        onclick={() => (shopSubTab = "items")}
                    >
                        Items ({shopItems.length})
                    </button>
                    <button
                        class={`px-4 py-2 rounded-lg border transition-colors ${shopSubTab === "transactions" ? "bg-purple-600 border-purple-400" : "bg-gray-800 border-gray-700 hover:bg-gray-700"}`}
                        onclick={() => (shopSubTab = "transactions")}
                    >
                        Transactions ({shopTransactions.length})
                    </button>
                    <button
                        class={`px-4 py-2 rounded-lg border transition-colors ${shopSubTab === "transactions-by-user" ? "bg-purple-600 border-purple-400" : "bg-gray-800 border-gray-700 hover:bg-gray-700"}`}
                        onclick={() =>
                            (shopSubTab = "transactions-by-user")}
                    >
                        By User
                    </button>
                    <button
                        class="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 transition-colors"
                        onclick={loadShopData}
                    >
                        Refresh
                    </button>
                </div>

                {#if shopLoading}
                    <div class="py-12 text-center text-gray-300">
                        Loading shop data...
                    </div>
                {:else if shopSubTab === "items"}
                    <div
                        class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-6"
                    >
                        <h3 class="text-lg font-semibold">
                            {editingItemId ? "Edit Item" : "Create New Item"}
                        </h3>

                        <div class="grid gap-4 md:grid-cols-2">
                            <div class="space-y-2">
                                <label
                                    class="text-sm font-medium text-gray-300"
                                    for="item-name">Name *</label
                                >
                                <input
                                    id="item-name"
                                    type="text"
                                    class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    placeholder="Item name"
                                    bind:value={shopItemForm.name}
                                />
                            </div>
                            <div class="space-y-2">
                                <label
                                    class="text-sm font-medium text-gray-300"
                                    for="item-cost">Cost (hours) *</label
                                >
                                <input
                                    id="item-cost"
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    placeholder="0"
                                    bind:value={shopItemForm.cost}
                                />
                            </div>
                            <div class="space-y-2">
                                <label
                                    class="text-sm font-medium text-gray-300"
                                    for="item-max-per-user">Max per User</label
                                >
                                <input
                                    id="item-max-per-user"
                                    type="number"
                                    step="1"
                                    min="1"
                                    class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    placeholder="Unlimited"
                                    bind:value={shopItemForm.maxPerUser}
                                />
                            </div>
                            <div class="space-y-2">
                                <label
                                    class="text-sm font-medium text-gray-300"
                                    for="item-image">Image URL</label
                                >
                                <input
                                    id="item-image"
                                    type="text"
                                    class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    placeholder="https://..."
                                    bind:value={shopItemForm.imageUrl}
                                />
                            </div>
                            <div class="space-y-2">
                                <label
                                    class="text-sm font-medium text-gray-300"
                                    for="item-description">Description</label
                                >
                                <textarea
                                    id="item-description"
                                    class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    rows="2"
                                    placeholder="Item description..."
                                    bind:value={shopItemForm.description}
                                ></textarea>
                            </div>
                        </div>

                        <div class="flex flex-wrap gap-3 items-center">
                            <button
                                class="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 transition-colors disabled:bg-gray-700 disabled:cursor-not-allowed"
                                onclick={saveShopItem}
                                disabled={shopItemSaving ||
                                    !shopItemForm.name ||
                                    !shopItemForm.cost}
                            >
                                {shopItemSaving
                                    ? "Saving..."
                                    : editingItemId
                                      ? "Update Item"
                                      : "Create Item"}
                            </button>
                            {#if editingItemId}
                                <button
                                    class="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
                                    onclick={resetItemForm}
                                >
                                    Cancel Edit
                                </button>
                            {/if}
                            {#if shopItemError}
                                <span class="text-red-400 text-sm"
                                    >{shopItemError}</span
                                >
                            {/if}
                            {#if shopItemSuccess}
                                <span class="text-green-400 text-sm"
                                    >{shopItemSuccess}</span
                                >
                            {/if}
                        </div>
                    </div>

                    {#if shopItems.length === 0}
                        <div class="py-12 text-center text-gray-300">
                            No shop items yet. Create one above!
                        </div>
                    {:else}
                        <div class="grid gap-4">
                            {#each shopItems as item (item.itemId)}
                                <div
                                    class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-4"
                                >
                                    <div
                                        class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"
                                    >
                                        <div class="flex gap-4">
                                            {#if item.imageUrl}
                                                <img
                                                    src={item.imageUrl}
                                                    alt={item.name}
                                                    class="w-20 h-20 object-cover rounded-lg border border-gray-700"
                                                />
                                            {:else}
                                                <div
                                                    class="w-20 h-20 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center text-2xl"
                                                >
                                                    🛍️
                                                </div>
                                            {/if}
                                            <div>
                                                <h3
                                                    class="text-xl font-semibold flex items-center gap-2"
                                                >
                                                    {item.name}
                                                    {#if !item.isActive}
                                                        <span
                                                            class="px-2 py-0.5 text-xs rounded bg-red-500/20 border border-red-400 text-red-300"
                                                            >Inactive</span
                                                        >
                                                    {/if}
                                                    {#if item.maxPerUser}
                                                        <span
                                                            class="px-2 py-0.5 text-xs rounded bg-orange-500/20 border border-orange-400 text-orange-300"
                                                            >Max {item.maxPerUser}/user</span
                                                        >
                                                    {/if}
                                                    {#if item.variants && item.variants.length > 0}
                                                        <span
                                                            class="px-2 py-0.5 text-xs rounded bg-blue-500/20 border border-blue-400 text-blue-300"
                                                            >{item.variants
                                                                .length} variant{item
                                                                .variants
                                                                .length > 1
                                                                ? "s"
                                                                : ""}</span
                                                        >
                                                    {/if}
                                                </h3>
                                                <p
                                                    class="text-sm text-purple-300 font-semibold"
                                                >
                                                    {item.cost} hours {item.variants &&
                                                    item.variants.length > 0
                                                        ? "(base)"
                                                        : ""}
                                                </p>
                                                {#if item.description}
                                                    <p
                                                        class="text-sm text-gray-400 mt-1"
                                                    >
                                                        {item.description}
                                                    </p>
                                                {/if}
                                                <p
                                                    class="text-xs text-gray-500 mt-2"
                                                >
                                                    Updated {formatDate(
                                                        item.updatedAt,
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                        <div class="flex flex-wrap gap-2">
                                            <button
                                                class="px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500 text-blue-300 hover:bg-blue-600/30 text-sm transition-colors"
                                                onclick={() => {
                                                    expandedItemVariants[
                                                        item.itemId
                                                    ] =
                                                        !expandedItemVariants[
                                                            item.itemId
                                                        ];
                                                }}
                                            >
                                                {expandedItemVariants[
                                                    item.itemId
                                                ]
                                                    ? "Hide"
                                                    : "Show"} Variants
                                            </button>
                                            <button
                                                class="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm transition-colors"
                                                onclick={() =>
                                                    startEditItem(item)}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${item.isActive ? "bg-yellow-600/20 border-yellow-500 text-yellow-300 hover:bg-yellow-600/30" : "bg-green-600/20 border-green-500 text-green-300 hover:bg-green-600/30"}`}
                                                onclick={() =>
                                                    toggleItemActive(item)}
                                            >
                                                {item.isActive
                                                    ? "Deactivate"
                                                    : "Activate"}
                                            </button>
                                            <button
                                                class="px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-500 text-red-300 hover:bg-red-600/30 text-sm transition-colors"
                                                onclick={() =>
                                                    deleteShopItem(item.itemId)}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>

                                    {#if expandedItemVariants[item.itemId]}
                                        <div
                                            class="border-t border-gray-700 pt-4 space-y-3"
                                        >
                                            <div
                                                class="flex items-center justify-between"
                                            >
                                                <h4
                                                    class="text-sm font-semibold text-gray-300"
                                                >
                                                    Variants
                                                </h4>
                                                <button
                                                    class="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm transition-colors"
                                                    onclick={() =>
                                                        startAddVariant(
                                                            item.itemId,
                                                        )}
                                                >
                                                    + Add Variant
                                                </button>
                                            </div>

                                            {#if addingVariantToItemId === item.itemId}
                                                <div
                                                    class="bg-gray-800/50 rounded-lg p-4 space-y-3"
                                                >
                                                    <div
                                                        class="grid gap-3 md:grid-cols-3"
                                                    >
                                                        <div>
                                                            <label
                                                                class="text-xs text-gray-400"
                                                                >Variant Name *</label
                                                            >
                                                            <input
                                                                type="text"
                                                                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                                placeholder="e.g., XL, $200"
                                                                bind:value={
                                                                    variantForm.name
                                                                }
                                                            />
                                                        </div>
                                                        <div>
                                                            <label
                                                                class="text-xs text-gray-400"
                                                                >Cost (hours) *</label
                                                            >
                                                            <input
                                                                type="number"
                                                                step="0.1"
                                                                min="0"
                                                                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                                bind:value={
                                                                    variantForm.cost
                                                                }
                                                            />
                                                        </div>
                                                        <div
                                                            class="flex items-end gap-2"
                                                        >
                                                            <button
                                                                class="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm transition-colors disabled:bg-gray-700 disabled:cursor-not-allowed"
                                                                onclick={saveVariant}
                                                                disabled={variantSaving ||
                                                                    !variantForm.name ||
                                                                    !variantForm.cost}
                                                            >
                                                                {variantSaving
                                                                    ? "Saving..."
                                                                    : editingVariantId
                                                                      ? "Update"
                                                                      : "Add"}
                                                            </button>
                                                            <button
                                                                class="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm transition-colors"
                                                                onclick={resetVariantForm}
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    </div>
                                                    {#if variantError}
                                                        <p
                                                            class="text-red-400 text-xs"
                                                        >
                                                            {variantError}
                                                        </p>
                                                    {/if}
                                                    {#if variantSuccess}
                                                        <p
                                                            class="text-green-400 text-xs"
                                                        >
                                                            {variantSuccess}
                                                        </p>
                                                    {/if}
                                                </div>
                                            {/if}

                                            {#if item.variants && item.variants.length > 0}
                                                <div class="space-y-2">
                                                    {#each item.variants as variant (variant.variantId)}
                                                        <div
                                                            class="flex items-center justify-between bg-gray-800/30 rounded-lg px-4 py-2"
                                                        >
                                                            <div
                                                                class="flex items-center gap-3"
                                                            >
                                                                <span
                                                                    class="font-medium text-white"
                                                                    >{variant.name}</span
                                                                >
                                                                <span
                                                                    class="text-purple-300 text-sm"
                                                                    >{variant.cost}
                                                                    hours</span
                                                                >
                                                                {#if !variant.isActive}
                                                                    <span
                                                                        class="px-2 py-0.5 text-xs rounded bg-red-500/20 border border-red-400 text-red-300"
                                                                        >Inactive</span
                                                                    >
                                                                {/if}
                                                            </div>
                                                            <div
                                                                class="flex gap-2"
                                                            >
                                                                <button
                                                                    class="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs transition-colors"
                                                                    onclick={() =>
                                                                        startEditVariant(
                                                                            variant,
                                                                        )}
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    class={`px-2 py-1 rounded text-xs transition-colors ${variant.isActive ? "bg-yellow-600/20 text-yellow-300 hover:bg-yellow-600/30" : "bg-green-600/20 text-green-300 hover:bg-green-600/30"}`}
                                                                    onclick={() =>
                                                                        toggleVariantActive(
                                                                            variant,
                                                                        )}
                                                                >
                                                                    {variant.isActive
                                                                        ? "Deactivate"
                                                                        : "Activate"}
                                                                </button>
                                                                <button
                                                                    class="px-2 py-1 rounded bg-red-600/20 text-red-300 hover:bg-red-600/30 text-xs transition-colors"
                                                                    onclick={() =>
                                                                        deleteVariant(
                                                                            variant.variantId,
                                                                        )}
                                                                >
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        </div>
                                                    {/each}
                                                </div>
                                            {:else}
                                                <p
                                                    class="text-gray-500 text-sm"
                                                >
                                                    No variants yet. Add one to
                                                    offer different options.
                                                </p>
                                            {/if}
                                        </div>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    {/if}
                {:else if shopSubTab === "transactions"}
                    {#if shopTransactions.length === 0}
                        <div class="py-12 text-center text-gray-300">
                            No transactions yet.
                        </div>
                    {:else}
                        <div class="mb-4 flex items-center gap-3">
                            <label class="text-sm font-medium text-gray-300"
                                >Filter by Item:</label
                            >
                            <select
                                class="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                bind:value={selectedItemFilter}
                            >
                                <option value={null}>All Items</option>
                                {#each shopItems as item (item.itemId)}
                                    <option value={item.itemId}
                                        >{item.name}</option
                                    >
                                {/each}
                            </select>
                            <label class="text-sm font-medium text-gray-300"
                                >Status:</label
                            >
                            <div class="flex gap-2">
                                <button
                                    class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${fulfillmentFilter === "all" ? "bg-purple-600 border-purple-400 text-white" : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"}`}
                                    onclick={() => (fulfillmentFilter = "all")}
                                >
                                    All
                                </button>
                                <button
                                    class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${fulfillmentFilter === "fulfilled" ? "bg-green-600 border-green-400 text-white" : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"}`}
                                    onclick={() =>
                                        (fulfillmentFilter = "fulfilled")}
                                >
                                    Fulfilled
                                </button>
                                <button
                                    class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${fulfillmentFilter === "unfulfilled" ? "bg-yellow-600 border-yellow-400 text-white" : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"}`}
                                    onclick={() =>
                                        (fulfillmentFilter = "unfulfilled")}
                                >
                                    Unfulfilled
                                </button>
                            </div>
                        </div>
                        <div
                            class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur overflow-hidden"
                        >
                            <table class="w-full">
                                <thead class="bg-gray-800/50">
                                    <tr>
                                        <th
                                            class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                            >Date</th
                                        >
                                        <th
                                            class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                            >User</th
                                        >
                                        <th
                                            class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                            >Item</th
                                        >
                                        <th
                                            class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                            >Cost</th
                                        >
                                        <th
                                            class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                            >Status</th
                                        >
                                        <th
                                            class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                            >Actions</th
                                        >
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-700">
                                    {#each filteredTransactions() as transaction (transaction.transactionId)}
                                        <tr class="hover:bg-gray-800/30">
                                            <td
                                                class="px-4 py-3 text-sm text-gray-300"
                                                >{formatDate(
                                                    transaction.createdAt,
                                                )}</td
                                            >
                                            <td class="px-4 py-3">
                                                <p
                                                    class="text-sm font-medium text-white"
                                                >
                                                    {transaction.user.firstName}
                                                    {transaction.user.lastName}
                                                </p>
                                                <p class="text-xs text-gray-400">
                                                    {transaction.user.email}
                                                </p>
                                                {#if transaction.user.addressLine1 || transaction.user.city || transaction.user.state}
                                                    <div class="text-xs text-gray-500 mt-1">
                                                        {#if transaction.user.addressLine1}
                                                            <p>{transaction.user.addressLine1}</p>
                                                        {/if}
                                                        {#if transaction.user.addressLine2}
                                                            <p>{transaction.user.addressLine2}</p>
                                                        {/if}
                                                        <p>{[transaction.user.city, transaction.user.state, transaction.user.zipCode].filter(Boolean).join(', ')}</p>
                                                        {#if transaction.user.country}
                                                            <p>{transaction.user.country}</p>
                                                        {/if}
                                                    </div>
                                                {/if}
                                            </td>
                                            <td class="px-4 py-3">
                                                <p
                                                    class="text-sm font-medium text-white"
                                                >
                                                    {transaction.item.name}
                                                    {#if transaction.variant}
                                                        <span
                                                            class="text-blue-300"
                                                        >
                                                            ({transaction.variant
                                                                .name})</span
                                                        >
                                                    {/if}
                                                </p>
                                                <p class="text-xs text-gray-400">
                                                    {transaction.itemDescription}
                                                </p>
                                            </td>
                                            <td
                                                class="px-4 py-3 text-sm font-semibold text-purple-300"
                                                >{transaction.cost} hours</td
                                            >
                                            <td class="px-4 py-3">
                                                {#if transaction.isFulfilled}
                                                    <div
                                                        class="flex flex-col gap-1"
                                                    >
                                                        <span
                                                            class="px-2 py-1 text-xs rounded bg-green-500/20 border border-green-400 text-green-300 w-fit"
                                                            >Fulfilled</span
                                                        >
                                                        {#if transaction.fulfilledAt}
                                                            <span
                                                                class="text-xs text-gray-500"
                                                                >{formatDate(
                                                                    transaction.fulfilledAt,
                                                                )}</span
                                                            >
                                                        {/if}
                                                    </div>
                                                {:else}
                                                    <span
                                                        class="px-2 py-1 text-xs rounded bg-yellow-500/20 border border-yellow-400 text-yellow-300"
                                                        >Pending</span
                                                    >
                                                {/if}
                                            </td>
                                            <td class="px-4 py-3">
                                                <div class="flex gap-2">
                                                    {#if transaction.isFulfilled}
                                                        <button
                                                            class="px-3 py-1.5 rounded-lg bg-yellow-600/20 border border-yellow-500 text-yellow-300 hover:bg-yellow-600/30 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                            onclick={() =>
                                                                handleUnfulfillTransaction(
                                                                    transaction.transactionId,
                                                                )}
                                                            disabled={unfulfillingTransaction ===
                                                                transaction.transactionId}
                                                        >
                                                            {unfulfillingTransaction ===
                                                            transaction.transactionId
                                                                ? "Removing..."
                                                                : "Unfulfill"}
                                                        </button>
                                                    {:else}
                                                        <button
                                                            class="px-3 py-1.5 rounded-lg bg-green-600/20 border border-green-500 text-green-300 hover:bg-green-600/30 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                            onclick={() =>
                                                                handleMarkFulfilled(
                                                                    transaction.transactionId,
                                                                )}
                                                            disabled={fulfillingTransaction ===
                                                                transaction.transactionId}
                                                        >
                                                            {fulfillingTransaction ===
                                                            transaction.transactionId
                                                                ? "Marking..."
                                                                : "Mark Fulfilled"}
                                                        </button>
                                                    {/if}
                                                    <button
                                                        class="px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-500 text-red-300 hover:bg-red-600/30 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        onclick={() =>
                                                            handleRefundTransaction(
                                                                transaction.transactionId,
                                                            )}
                                                        disabled={refundingTransaction ===
                                                            transaction.transactionId}
                                                    >
                                                        {refundingTransaction ===
                                                        transaction.transactionId
                                                            ? "Refunding..."
                                                            : "Refund"}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                    {/if}
                {:else if shopSubTab === "transactions-by-user"}
                    {#if shopTransactions.length === 0}
                        <div class="py-12 text-center text-gray-300">
                            No transactions yet.
                        </div>
                    {:else}
                        <div class="mb-4 flex items-center gap-3">
                            <label class="text-sm font-medium text-gray-300"
                                >Filter by Item:</label
                            >
                            <select
                                class="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                bind:value={selectedItemFilter}
                            >
                                <option value={null}>All Items</option>
                                {#each shopItems as item (item.itemId)}
                                    <option value={item.itemId}
                                        >{item.name}</option
                                    >
                                {/each}
                            </select>
                            <label class="text-sm font-medium text-gray-300"
                                >Status:</label
                            >
                            <div class="flex gap-2">
                                <button
                                    class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${fulfillmentFilter === "all" ? "bg-purple-600 border-purple-400 text-white" : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"}`}
                                    onclick={() => (fulfillmentFilter = "all")}
                                >
                                    All
                                </button>
                                <button
                                    class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${fulfillmentFilter === "fulfilled" ? "bg-green-600 border-green-400 text-white" : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"}`}
                                    onclick={() =>
                                        (fulfillmentFilter = "fulfilled")}
                                >
                                    Fulfilled
                                </button>
                                <button
                                    class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${fulfillmentFilter === "unfulfilled" ? "bg-yellow-600 border-yellow-400 text-white" : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"}`}
                                    onclick={() =>
                                        (fulfillmentFilter = "unfulfilled")}
                                >
                                    Unfulfilled
                                </button>
                            </div>
                        </div>
                        <div class="space-y-4">
                            {#each transactionsByUser() as userGroup (userGroup.user.userId)}
                                <div
                                    class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur overflow-hidden"
                                >
                                    <div
                                        class="bg-gray-800/50 px-6 py-4 border-b border-gray-700"
                                    >
                                        <div
                                            class="flex items-center justify-between"
                                        >
                                            <div>
                                                <h3
                                                    class="text-lg font-semibold text-white"
                                                >
                                                    {userGroup.user.firstName}
                                                    {userGroup.user.lastName}
                                                </h3>
                                                <p
                                                    class="text-sm text-gray-400"
                                                >
                                                    {userGroup.user.email}
                                                </p>
                                                {#if userGroup.user.addressLine1 || userGroup.user.city || userGroup.user.state}
                                                    <div class="text-xs text-gray-500 mt-1">
                                                        {#if userGroup.user.addressLine1}
                                                            <p>{userGroup.user.addressLine1}</p>
                                                        {/if}
                                                        {#if userGroup.user.addressLine2}
                                                            <p>{userGroup.user.addressLine2}</p>
                                                        {/if}
                                                        <p>{[userGroup.user.city, userGroup.user.state, userGroup.user.zipCode].filter(Boolean).join(', ')}</p>
                                                        {#if userGroup.user.country}
                                                            <p>{userGroup.user.country}</p>
                                                        {/if}
                                                    </div>
                                                {/if}
                                            </div>
                                            <div class="flex gap-4 text-sm">
                                                <div class="text-right">
                                                    <p class="text-gray-400">
                                                        Total Orders
                                                    </p>
                                                    <p
                                                        class="text-lg font-semibold text-white"
                                                    >
                                                        {userGroup.transactions
                                                            .length}
                                                    </p>
                                                </div>
                                                <div class="text-right">
                                                    <p class="text-gray-400">
                                                        Total Cost
                                                    </p>
                                                    <p
                                                        class="text-lg font-semibold text-purple-300"
                                                    >
                                                        {userGroup.totalCost} hours
                                                    </p>
                                                </div>
                                                <div class="text-right">
                                                    <p class="text-gray-400">
                                                        Status
                                                    </p>
                                                    <p class="text-sm">
                                                        <span
                                                            class="text-green-300"
                                                            >{userGroup.fulfilledCount}
                                                            fulfilled</span
                                                        >
                                                        {#if userGroup.pendingCount > 0}
                                                            <span
                                                                class="text-gray-500"
                                                            >
                                                                /
                                                            </span>
                                                            <span
                                                                class="text-yellow-300"
                                                                >{userGroup.pendingCount}
                                                                pending</span
                                                            >
                                                        {/if}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <table class="w-full">
                                        <thead class="bg-gray-800/30">
                                            <tr>
                                                <th
                                                    class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                                    >Date</th
                                                >
                                                <th
                                                    class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                                    >Item</th
                                                >
                                                <th
                                                    class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                                    >Cost</th
                                                >
                                                <th
                                                    class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                                    >Status</th
                                                >
                                                <th
                                                    class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                                    >Actions</th
                                                >
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-gray-700">
                                            {#each userGroup.transactions as transaction (transaction.transactionId)}
                                                <tr
                                                    class="hover:bg-gray-800/30"
                                                >
                                                    <td
                                                        class="px-4 py-3 text-sm text-gray-300"
                                                        >{formatDate(
                                                            transaction.createdAt,
                                                        )}</td
                                                    >
                                                    <td class="px-4 py-3">
                                                        <p
                                                            class="text-sm font-medium text-white"
                                                        >
                                                            {transaction.item
                                                                .name}
                                                            {#if transaction.variant}
                                                                <span
                                                                    class="text-blue-300"
                                                                >
                                                                    ({transaction
                                                                        .variant
                                                                        .name})</span
                                                                >
                                                            {/if}
                                                        </p>
                                                        <p
                                                            class="text-xs text-gray-400"
                                                        >
                                                            {transaction.itemDescription}
                                                        </p>
                                                    </td>
                                                    <td
                                                        class="px-4 py-3 text-sm font-semibold text-purple-300"
                                                        >{transaction.cost} hours</td
                                                    >
                                                    <td class="px-4 py-3">
                                                        {#if transaction.isFulfilled}
                                                            <div
                                                                class="flex flex-col gap-1"
                                                            >
                                                                <span
                                                                    class="px-2 py-1 text-xs rounded bg-green-500/20 border border-green-400 text-green-300 w-fit"
                                                                    >Fulfilled</span
                                                                >
                                                                {#if transaction.fulfilledAt}
                                                                    <span
                                                                        class="text-xs text-gray-500"
                                                                        >{formatDate(
                                                                            transaction.fulfilledAt,
                                                                        )}</span
                                                                    >
                                                                {/if}
                                                            </div>
                                                        {:else}
                                                            <span
                                                                class="px-2 py-1 text-xs rounded bg-yellow-500/20 border border-yellow-400 text-yellow-300"
                                                                >Pending</span
                                                            >
                                                        {/if}
                                                    </td>
                                                    <td class="px-4 py-3">
                                                        <div class="flex gap-2">
                                                            {#if transaction.isFulfilled}
                                                                <button
                                                                    class="px-3 py-1.5 rounded-lg bg-yellow-600/20 border border-yellow-500 text-yellow-300 hover:bg-yellow-600/30 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    onclick={() =>
                                                                        handleUnfulfillTransaction(
                                                                            transaction.transactionId,
                                                                        )}
                                                                    disabled={unfulfillingTransaction ===
                                                                        transaction.transactionId}
                                                                >
                                                                    {unfulfillingTransaction ===
                                                                    transaction.transactionId
                                                                        ? "Removing..."
                                                                        : "Unfulfill"}
                                                                </button>
                                                            {:else}
                                                                <button
                                                                    class="px-3 py-1.5 rounded-lg bg-green-600/20 border border-green-500 text-green-300 hover:bg-green-600/30 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    onclick={() =>
                                                                        handleMarkFulfilled(
                                                                            transaction.transactionId,
                                                                        )}
                                                                    disabled={fulfillingTransaction ===
                                                                        transaction.transactionId}
                                                                >
                                                                    {fulfillingTransaction ===
                                                                    transaction.transactionId
                                                                        ? "Marking..."
                                                                        : "Mark Fulfilled"}
                                                                </button>
                                                            {/if}
                                                            <button
                                                                class="px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-500 text-red-300 hover:bg-red-600/30 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                                onclick={() =>
                                                                    handleRefundTransaction(
                                                                        transaction.transactionId,
                                                                    )}
                                                                disabled={refundingTransaction ===
                                                                    transaction.transactionId}
                                                            >
                                                                {refundingTransaction ===
                                                                transaction.transactionId
                                                                    ? "Refunding..."
                                                                    : "Refund"}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            {/each}
                                        </tbody>
                                    </table>
                                    <div
                                        class="bg-gray-800/30 px-6 py-4 border-t border-gray-700"
                                    >
                                        <div
                                            class="flex items-center justify-between"
                                        >
                                            <span
                                                class="text-sm font-semibold text-gray-300"
                                                >Total</span
                                            >
                                            <div class="flex gap-6 text-sm">
                                                <div class="text-right">
                                                    <p class="text-gray-400">
                                                        Hours
                                                    </p>
                                                    <p
                                                        class="text-lg font-bold text-purple-300"
                                                    >
                                                        {userGroup.totalCost}
                                                    </p>
                                                </div>
                                                <div class="text-right">
                                                    <p class="text-gray-400">
                                                        Money Cost (only leo should use this - guesstimate)
                                                    </p>
                                                    <p
                                                        class="text-lg font-bold text-green-300"
                                                    >
                                                        ${(
                                                            userGroup.totalCost *
                                                            10
                                                        ).toFixed(2)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                {/if}
                {/if}
            </section>
        {:else if activeTab === "giftcodes"}
            <section class="space-y-4">
                <div
                    class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
                >
                    <h2 class="text-2xl font-semibold">Gift Codes</h2>
                    <button
                        class="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 transition-colors"
                        onclick={loadGiftCodes}
                    >
                        Refresh
                    </button>
                </div>

                <div
                    class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-6"
                >
                    <h3 class="text-lg font-semibold">Send Gift Code Emails</h3>

                    <div class="grid gap-4 md:grid-cols-2">
                        <div class="space-y-2 md:col-span-2">
                            <label
                                class="text-sm font-medium text-gray-300"
                                for="gift-emails">Email Addresses *</label
                            >
                            <textarea
                                id="gift-emails"
                                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                rows="4"
                                placeholder="Enter email addresses (one per line, or comma/semicolon separated)&#10;example@email.com&#10;another@email.com"
                                bind:value={giftCodeForm.emails}
                            ></textarea>
                        </div>
                        <div class="space-y-2">
                            <label
                                class="text-sm font-medium text-gray-300"
                                for="gift-description">Item Description *</label
                            >
                            <input
                                id="gift-description"
                                type="text"
                                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                placeholder="e.g., Midnight Sticker Sheet"
                                bind:value={giftCodeForm.itemDescription}
                            />
                        </div>
                        <div class="space-y-2">
                            <label
                                class="text-sm font-medium text-gray-300"
                                for="gift-image">Image URL *</label
                            >
                            <input
                                id="gift-image"
                                type="text"
                                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                placeholder="https://example.com/image.png"
                                bind:value={giftCodeForm.imageUrl}
                            />
                        </div>
                        <div class="space-y-2 md:col-span-2">
                            <label
                                class="text-sm font-medium text-gray-300"
                                for="gift-fillout">Fillout Form URL *</label
                            >
                            <input
                                id="gift-fillout"
                                type="text"
                                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                placeholder="https://forms.fillout.com/your-form"
                                bind:value={giftCodeForm.filloutUrl}
                            />
                            <p class="text-xs text-gray-500">
                                Parameters first_name, last_name, email, and
                                lfd_rec will be automatically appended
                            </p>
                        </div>
                    </div>

                    {#if giftCodeForm.imageUrl}
                        <div class="flex items-center gap-4">
                            <div
                                class="w-24 h-24 rounded-lg border border-gray-700 overflow-hidden bg-gray-800"
                            >
                                <img
                                    src={giftCodeForm.imageUrl}
                                    alt="Preview"
                                    class="w-full h-full object-cover"
                                    onerror={(e) => {
                                        (
                                            e.target as HTMLImageElement
                                        ).style.display = "none";
                                    }}
                                />
                            </div>
                            <p class="text-sm text-gray-400">Image Preview</p>
                        </div>
                    {/if}

                    <div class="flex flex-wrap gap-3 items-center">
                        <button
                            class="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 transition-colors disabled:bg-gray-700 disabled:cursor-not-allowed"
                            onclick={sendGiftCodes}
                            disabled={giftCodeSending ||
                                !giftCodeForm.emails ||
                                !giftCodeForm.itemDescription ||
                                !giftCodeForm.imageUrl ||
                                !giftCodeForm.filloutUrl}
                        >
                            {giftCodeSending
                                ? "Sending..."
                                : "Send Gift Code Emails"}
                        </button>
                        <button
                            class="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
                            onclick={resetGiftCodeForm}
                        >
                            Clear Form
                        </button>
                        {#if giftCodeError}
                            <span class="text-red-400 text-sm"
                                >{giftCodeError}</span
                            >
                        {/if}
                        {#if giftCodeSuccess}
                            <span class="text-green-400 text-sm"
                                >{giftCodeSuccess}</span
                            >
                        {/if}
                    </div>

                    {#if giftCodeResults.length > 0}
                        <div class="border-t border-gray-700 pt-4 space-y-2">
                            <h4 class="text-sm font-semibold text-gray-300">
                                Send Results
                            </h4>
                            <div class="max-h-48 overflow-y-auto space-y-1">
                                {#each giftCodeResults as result}
                                    <div
                                        class="flex items-center gap-2 text-sm"
                                    >
                                        {#if result.success}
                                            <span class="text-green-400">✓</span
                                            >
                                        {:else}
                                            <span class="text-red-400">✗</span>
                                        {/if}
                                        <span class="text-gray-300"
                                            >{result.email}</span
                                        >
                                        {#if result.success}
                                            <span
                                                class="text-gray-500 font-mono text-xs"
                                                >{result.code}</span
                                            >
                                        {:else}
                                            <span class="text-red-400 text-xs"
                                                >{result.error}</span
                                            >
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}
                </div>

                {#if giftCodesLoading}
                    <div class="py-12 text-center text-gray-300">
                        Loading gift codes...
                    </div>
                {:else if giftCodes.length === 0}
                    <div class="py-12 text-center text-gray-300">
                        No gift codes sent yet.
                    </div>
                {:else}
                    <div
                        class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur overflow-hidden"
                    >
                        <table class="w-full">
                            <thead class="bg-gray-800/50">
                                <tr>
                                    <th
                                        class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                        >Date</th
                                    >
                                    <th
                                        class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                        >Email</th
                                    >
                                    <th
                                        class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                        >Code</th
                                    >
                                    <th
                                        class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                        >Item</th
                                    >
                                    <th
                                        class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                        >Status</th
                                    >
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-700">
                                {#each giftCodes as giftCode (giftCode.id)}
                                    <tr class="hover:bg-gray-800/30">
                                        <td
                                            class="px-4 py-3 text-sm text-gray-300"
                                            >{formatDate(
                                                giftCode.createdAt,
                                            )}</td
                                        >
                                        <td class="px-4 py-3">
                                            <p
                                                class="text-sm font-medium text-white"
                                            >
                                                {giftCode.email}
                                            </p>
                                            {#if giftCode.firstName || giftCode.lastName}
                                                <p
                                                    class="text-xs text-gray-400"
                                                >
                                                    {giftCode.firstName}
                                                    {giftCode.lastName}
                                                </p>
                                            {/if}
                                        </td>
                                        <td class="px-4 py-3">
                                            <span
                                                class="font-mono text-sm text-purple-300"
                                                >{giftCode.code}</span
                                            >
                                        </td>
                                        <td class="px-4 py-3">
                                            <div
                                                class="flex items-center gap-2"
                                            >
                                                {#if giftCode.imageUrl}
                                                    <img
                                                        src={giftCode.imageUrl}
                                                        alt=""
                                                        class="w-8 h-8 rounded object-cover"
                                                    />
                                                {/if}
                                                <span
                                                    class="text-sm text-gray-300"
                                                    >{giftCode.itemDescription}</span
                                                >
                                            </div>
                                        </td>
                                        <td class="px-4 py-3">
                                            {#if giftCode.isClaimed}
                                                <span
                                                    class="px-2 py-1 text-xs rounded bg-green-500/20 border border-green-400 text-green-300"
                                                    >Claimed</span
                                                >
                                            {:else if giftCode.emailSentAt}
                                                <span
                                                    class="px-2 py-1 text-xs rounded bg-blue-500/20 border border-blue-400 text-blue-300"
                                                    >Sent</span
                                                >
                                            {:else}
                                                <span
                                                    class="px-2 py-1 text-xs rounded bg-yellow-500/20 border border-yellow-400 text-yellow-300"
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
        {:else if activeTab === "events"}
            <section class="space-y-4">
                <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <h2 class="text-2xl font-semibold">Events Management</h2>
                    <button
                        class="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 transition-colors"
                        onclick={loadEvents}
                    >
                        Refresh
                    </button>
                </div>

                <div class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-6">
                    <h3 class="text-lg font-semibold">
                        {editingEventSlug ? "Edit Event" : "Create New Event"}
                    </h3>
                    <div class="grid gap-4 md:grid-cols-2">
                        <div class="space-y-2">
                            <label class="text-sm font-medium text-gray-300" for="event-slug">Slug *</label>
                            <input
                                id="event-slug"
                                type="text"
                                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                placeholder="my-event"
                                bind:value={eventForm.slug}
                            />
                        </div>
                        <div class="space-y-2">
                            <label class="text-sm font-medium text-gray-300" for="event-title">Title *</label>
                            <input
                                id="event-title"
                                type="text"
                                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                placeholder="Event title"
                                bind:value={eventForm.title}
                            />
                        </div>
                        <div class="space-y-2">
                            <label class="text-sm font-medium text-gray-300" for="event-description">Description</label>
                            <input
                                id="event-description"
                                type="text"
                                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                placeholder="Event description..."
                                bind:value={eventForm.description}
                            />
                        </div>
                        <div class="space-y-2">
                            <label class="text-sm font-medium text-gray-300" for="event-image">Image URL</label>
                            <input
                                id="event-image"
                                type="text"
                                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                placeholder="https://..."
                                bind:value={eventForm.imageUrl}
                            />
                        </div>
                        <div class="space-y-2">
                            <label class="text-sm font-medium text-gray-300" for="event-location">Location</label>
                            <input
                                id="event-location"
                                type="text"
                                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                placeholder="San Francisco, CA"
                                bind:value={eventForm.location}
                            />
                        </div>
                        <div class="space-y-2">
                            <label class="text-sm font-medium text-gray-300" for="event-start-date">Start Date *</label>
                            <input
                                id="event-start-date"
                                type="date"
                                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                bind:value={eventForm.startDate}
                            />
                        </div>
                        <div class="space-y-2">
                            <label class="text-sm font-medium text-gray-300" for="event-end-date">End Date *</label>
                            <input
                                id="event-end-date"
                                type="date"
                                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                bind:value={eventForm.endDate}
                            />
                        </div>
                        <div class="space-y-2">
                            <label class="text-sm font-medium text-gray-300" for="event-cost">Hour Cost *</label>
                            <input
                                id="event-cost"
                                type="number"
                                step="0.1"
                                min="0"
                                class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                placeholder="0"
                                bind:value={eventForm.hourCost}
                            />
                        </div>
                        <div class="flex items-center gap-4">
                            <label class="flex items-center gap-2 text-sm text-gray-300">
                                <input type="checkbox" bind:checked={eventForm.isActive} class="rounded" />
                                Active
                            </label>
                        </div>
                    </div>

                    <div class="flex flex-wrap gap-3 items-center">
                        <button
                            class="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 transition-colors disabled:bg-gray-700 disabled:cursor-not-allowed"
                            onclick={saveEvent}
                            disabled={eventFormSaving || !eventForm.slug || !eventForm.title || !eventForm.startDate || !eventForm.endDate || !eventForm.hourCost}
                        >
                            {eventFormSaving ? "Saving..." : editingEventSlug ? "Update Event" : "Create Event"}
                        </button>
                        {#if editingEventSlug}
                            <button
                                class="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
                                onclick={resetEventForm}
                            >
                                Cancel Edit
                            </button>
                        {/if}
                        {#if eventFormError}
                            <span class="text-red-400 text-sm">{eventFormError}</span>
                        {/if}
                        {#if eventFormSuccess}
                            <span class="text-green-400 text-sm">{eventFormSuccess}</span>
                        {/if}
                    </div>
                </div>

                {#if eventsLoading}
                    <div class="py-12 text-center text-gray-300">
                        Loading events...
                    </div>
                {:else if events.length === 0}
                    <div class="py-12 text-center text-gray-300">
                        No events yet. Create one above.
                    </div>
                {:else}
                    <div class="space-y-2">
                        {#each events as event (event.eventId)}
                            <div class="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800 px-4 py-3">
                                <div class="flex items-center gap-3 flex-wrap">
                                    <span class="font-medium">{event.title}</span>
                                    <span class="text-sm text-gray-400">{event.slug}</span>
                                    <span class="text-sm text-gray-400">
                                        {new Date(event.startDate).toLocaleDateString()} – {new Date(event.endDate).toLocaleDateString()}
                                    </span>
                                    {#if event.location}
                                        <span class="text-sm text-gray-400">{event.location}</span>
                                    {/if}
                                    <span class="text-sm text-gray-400">{event.hourCost}h</span>
                                    {#if event._count}
                                        <span class="px-2 py-0.5 text-xs bg-purple-900/50 text-purple-400 rounded">
                                            {event._count.pinnedBy} pinned
                                        </span>
                                    {/if}
                                    {#if !event.isActive}
                                        <span class="px-2 py-0.5 text-xs bg-red-900/50 text-red-400 rounded">Inactive</span>
                                    {/if}
                                </div>
                                <div class="flex gap-2">
                                    <button
                                        class="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded transition-colors"
                                        onclick={() => startEditEvent(event)}
                                    >
                                        Edit
                                    </button>
                                    <button
                                        class="px-3 py-1 text-xs bg-red-600 hover:bg-red-500 rounded transition-colors"
                                        onclick={() => deleteEvent(event.slug)}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </section>
        {/if}
    </div>
</div>

<style>
    :global(body) {
        margin: 0;
        padding: 0;
        overflow-x: hidden;
    }

    :global(html) {
        overflow-x: hidden;
    }
</style>
