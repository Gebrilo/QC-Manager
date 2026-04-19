// NEXT_PUBLIC_API_URL is baked at build time. If the build arg was missing,
// it collapses to "https://" (truthy but invalid). Guard against that here.
const _rawApiUrl = process.env.NEXT_PUBLIC_API_URL || '';
const API_URL = _rawApiUrl.length > 8 ? _rawApiUrl : 'https://api.gebrils.cloud';

/**
 * Generic API fetch wrapper
 */
export async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    // Get auth token from Supabase session
    let authToken: string | null = null;
    if (typeof window !== 'undefined') {
        const { supabase } = await import('./supabase');
        const { data: { session } } = await supabase.auth.getSession();
        authToken = session?.access_token || null;
    }

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
    };

    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(url, {
        ...options,
        headers,
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Handle 401 Unauthorized - session expired, sign out so RouteGuard redirects to login
        if (response.status === 401) {
            if (typeof window !== 'undefined') {
                const { supabase } = await import('./supabase');
                supabase.auth.signOut();
            }
            throw new Error(errorData.error || 'Session expired. Please log in again.');
        }

        // Handle 403 Forbidden - insufficient permissions
        if (response.status === 403) {
            const err = new Error(errorData.error || 'You do not have permission to perform this action');
            (err as any).status = 403;
            throw err;
        }

        // Handle Zod validation errors with details
        if (errorData.details && Array.isArray(errorData.details)) {
            const validationMessages = errorData.details.map((d: any) =>
                `${d.path?.join('.') || 'Field'}: ${d.message}`
            ).join(', ');
            throw new Error(`${errorData.error || 'Validation Error'}: ${validationMessages}`);
        }

        const err = new Error(errorData.error || errorData.message || `API Error: ${response.statusText}`);
        (err as any).status = response.status;
        throw err;
    }

    // Handle 204 No Content
    if (response.status === 204) {
        return {} as T;
    }

    // Handle 202 Accepted (for async operations like reports)
    if (response.status === 202) {
        return response.json();
    }

    return response.json();
}

// ============================================================================
// Type Definitions
// ============================================================================

export interface Project {
    id: string;
    project_id: string;
    project_name: string;
    priority?: 'High' | 'Medium' | 'Low';
    total_weight?: number;
    start_date?: string;
    target_date?: string;
    status?: string;
    completion_pct?: number;
    tasks_done_count?: number;
    tasks_total_count?: number;
    task_hrs_est?: number;
    task_hrs_actual?: number;
    created_at?: string;
    updated_at?: string;
}

export interface Task {
    id: string;
    task_id: string;
    task_name: string;
    status: 'Backlog' | 'In Progress' | 'Done' | 'Cancelled';
    priority?: 'High' | 'Medium' | 'Low';
    project_id: string;
    project_name?: string;
    project_display_id?: string;
    resource1_uuid?: string;
    resource2_uuid?: string;
    resource1_id?: string;
    resource2_id?: string;
    resource1_name?: string;
    resource2_name?: string;
    estimate_days?: number;
    estimate_hrs?: number;
    r1_estimate_hrs?: number;
    r1_actual_hrs?: number;
    r2_estimate_hrs?: number;
    r2_actual_hrs?: number;
    total_est_hrs?: number;
    total_actual_hrs?: number;
    overall_completion_pct?: number;
    deadline?: string;
    expected_start_date?: string;
    actual_start_date?: string;
    completed_date?: string;
    tags?: string[];
    notes?: string;
    created_at?: string;
    updated_at?: string;
}

export interface Resource {
    id: string;
    resource_name: string;
    user_id?: string;
    weekly_capacity_hrs: number;
    is_active: boolean;
    email?: string;
    department?: string;
    role?: string;
    current_allocation_hrs?: number;
    utilization_pct?: number;
    available_hrs?: number;
    active_tasks_count?: number;
    backlog_tasks_count?: number;
    created_at?: string;
    updated_at?: string;
}

export interface TaskComment {
    id: string;
    task_id: string;
    comment: string;
    created_by: string;
    created_at: string;
    updated_at: string;
}

export interface DashboardMetrics {
    total_tasks: number;
    tasks_done: number;
    tasks_in_progress: number;
    tasks_backlog: number;
    tasks_cancelled: number;
    overall_completion_rate_pct: number;
    total_estimated_hrs: number;
    total_actual_hrs: number;
    total_hours_variance: number;
    total_projects: number;
    projects_with_tasks: number;
    active_resources: number;
    overallocated_resources: number;
    calculated_at: string;
}

export interface ReportJob {
    id?: string;
    job_id: string;
    report_type: 'project_status' | 'resource_utilization' | 'task_export' | 'test_results' | 'dashboard';
    format: 'xlsx' | 'csv' | 'json' | 'pdf';
    status: 'processing' | 'completed' | 'failed' | 'cancelled';
    filters?: Record<string, any>;
    download_url?: string;
    filename?: string;
    file_size?: string;
    error_message?: string;
    user_email?: string;
    created_at: string;
    completed_at?: string;
}

// ============================================================================
// API Client - Projects
// ============================================================================

export const projectsApi = {
    list: () => fetchApi<Project[]>('/projects'),

    get: (id: string) => fetchApi<Project>(`/projects/${id}`),

    create: (data: Partial<Project>) =>
        fetchApi<Project>('/projects', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    update: (id: string, data: Partial<Project>) =>
        fetchApi<Project>(`/projects/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),

    delete: (id: string) =>
        fetchApi<{ success: boolean; message: string }>(`/projects/${id}`, {
            method: 'DELETE',
        }),
};

// ============================================================================
// API Client - Tasks
// ============================================================================

export const tasksApi = {
    list: () => fetchApi<Task[]>('/tasks'),

    get: (id: string) => fetchApi<Task>(`/tasks/${id}`),

    create: (data: Partial<Task>) =>
        fetchApi<Task>('/tasks', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    update: (id: string, data: Partial<Task>) =>
        fetchApi<Task>(`/tasks/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),

    delete: (id: string) =>
        fetchApi<{ success: boolean; message: string }>(`/tasks/${id}`, {
            method: 'DELETE',
        }),
};

// ============================================================================
// API Client - Task Comments
// ============================================================================

export const taskCommentsApi = {
    list: (taskId: string) =>
        fetchApi<TaskComment[]>(`/tasks/${taskId}/comments`),

    create: (taskId: string, comment: string) =>
        fetchApi<TaskComment>(`/tasks/${taskId}/comments`, {
            method: 'POST',
            body: JSON.stringify({ comment }),
        }),

    delete: (taskId: string, commentId: string) =>
        fetchApi<{ success: boolean; message: string }>(`/tasks/${taskId}/comments/${commentId}`, {
            method: 'DELETE',
        }),
};

// ============================================================================
// API Client - Resources
// ============================================================================

export const resourcesApi = {
    list: () => fetchApi<Resource[]>('/resources'),

    get: (id: string) => fetchApi<Resource>(`/resources/${id}`),

    create: (data: Partial<Resource>) =>
        fetchApi<Resource>('/resources', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    update: (id: string, data: Partial<Resource>) =>
        fetchApi<Resource>(`/resources/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),

    delete: (id: string) =>
        fetchApi<{ success: boolean; message: string }>(`/resources/${id}`, {
            method: 'DELETE',
        }),

    autoMap: () =>
        fetchApi<{ success: boolean; mapped: number; total_candidates: number; message: string }>('/resources/auto-map', {
            method: 'POST',
        }),
};

// ============================================================================
// API Client - Bugs
// ============================================================================

export interface Bug {
    id: string;
    bug_id: string;
    tuleap_artifact_id?: number;
    title: string;
    description?: string;
    status: string;
    severity: string;
    priority: string;
    bug_type?: string;
    component?: string;
    project_id?: string;
    project_name?: string;
    reported_by?: string;
    updated_by?: string;
    assigned_to?: string;
    reported_date?: string;
    tuleap_url?: string;
    has_test_link?: boolean;
    source?: 'TEST_CASE' | 'EXPLORATORY';
    submitted_by_resource_name?: string;
    created_at?: string;
    updated_at?: string;
}

export const bugsApi = {
    list: (params?: { project_id?: string; status?: string; severity?: string; source?: string; limit?: number; offset?: number }) => {
        const clean: Record<string, string> = {};
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                if (v !== undefined && v !== null && v !== '') clean[k] = String(v);
            }
        }
        return fetchApi<{ success: boolean; count: number; total: number; data: Bug[] }>(`/bugs?${new URLSearchParams(clean).toString()}`);
    },

    get: (id: string) =>
        fetchApi<{ success: boolean; data: Bug }>(`/bugs/${id}`),

    summary: (project_id?: string) =>
        fetchApi<{ success: boolean; data: {
            totals: { total_bugs: number; open_bugs: number; closed_bugs: number; bugs_from_testing: number; standalone_bugs: number };
            by_severity: { critical: number; high: number; medium: number; low: number };
            by_source: { test_case: number; exploratory: number };
            by_project: any[];
            recent_bugs: Bug[];
        } }>(`/bugs/summary${project_id ? `?project_id=${project_id}` : ''}`),

    delete: (id: string) =>
        fetchApi<{ success: boolean; message: string; data: Bug }>(`/bugs/${id}`, { method: 'DELETE' }),
};

// ============================================================================
// API Client - My Dashboard
// ============================================================================

export interface MeDashboard {
    profile: {
        resource_id: string;
        resource_name: string;
        department: string | null;
    };
    summary: {
        total_tasks: number;
        total_projects: number;
        hours_variance: number;
    };
    task_distribution: Record<string, number>;
    tasks_by_project: Array<{
        project_id: string | null;
        project_name: string;
        total: number;
        done: number;
        in_progress: number;
        backlog: number;
    }>;
    submitted_bugs: Array<{
        id: string;
        bug_id: string;
        tuleap_url: string | null;
        title: string;
        status: string;
        severity: string;
        project_name: string | null;
        creation_date: string | null;
    }>;
}

export const meDashboardApi = {
    get: () => fetchApi<MeDashboard>('/me/dashboard'),
};

// ============================================================================
// API Client - Dashboard
// ============================================================================

export const dashboardApi = {
    getMetrics: () => fetchApi<DashboardMetrics>('/dashboard'),
};

// ============================================================================
// API Client - Reports
// ============================================================================

export const reportsApi = {
    generate: (data: {
        report_type: 'project_status' | 'resource_utilization' | 'task_export' | 'test_results' | 'dashboard';
        format?: 'xlsx' | 'csv' | 'json' | 'pdf';
        filters?: {
            project_ids?: string[];
            status?: string[];
            date_from?: string;
            date_to?: string;
        };
        user_email?: string;
    }) =>
        fetchApi<{
            success: boolean;
            message: string;
            data: {
                job_id: string;
                status: string;
                report_type: string;
                format: string;
                estimated_completion: string;
                status_url: string;
            };
        }>('/reports', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    getStatus: (jobId: string) =>
        fetchApi<{ success: boolean; data: ReportJob }>(`/reports/${jobId}`),

    list: (params?: { user_email?: string; status?: string; limit?: number; offset?: number }) => {
        const query = new URLSearchParams(params as any).toString();
        return fetchApi<{ success: boolean; data: ReportJob[] }>(`/reports${query ? `?${query}` : ''}`);
    },
};

// ============================================================================
// API Client - Governance
// ============================================================================

export const governanceApi = {
    getReleaseReadiness: () => fetchApi('/governance/release-readiness'),
    getQualityRisks: () => fetchApi('/governance/quality-risks'),
    getWorkloadBalance: () => fetchApi('/governance/workload-balance'),
    getProjectHealth: () => fetchApi('/governance/project-health'),
    getDashboardSummary: () => fetchApi('/governance/dashboard-summary'),
};

// ============================================================================
// API Client - Test Cases
// ============================================================================

export const testCasesApi = {
    list: (params?: { project_id?: string; status?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return fetchApi(`/test-cases${query ? `?${query}` : ''}`);
    },

    get: (id: string) => fetchApi(`/test-cases/${id}`),

    create: (data: any) =>
        fetchApi('/test-cases', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    update: (id: string, data: any) =>
        fetchApi(`/test-cases/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),

    delete: (id: string) =>
        fetchApi(`/test-cases/${id}`, { method: 'DELETE' }),
};

// ============================================================================
// API Client - Notifications
// ============================================================================

export interface AppNotification {
    id: string;
    type: string;
    title: string;
    message: string;
    read: boolean;
    metadata: Record<string, any>;
    created_at: string;
}

export const notificationsApi = {
    list: (unreadOnly = false, limit = 20) =>
        fetchApi<{ notifications: AppNotification[]; unread_count: number }>(
            `/notifications?unread_only=${unreadOnly}&limit=${limit}`
        ),

    markRead: (id: string) =>
        fetchApi<AppNotification>(`/notifications/${id}/read`, { method: 'PATCH' }),

    markAllRead: () =>
        fetchApi<{ success: boolean }>('/notifications/read-all', { method: 'PATCH' }),

    delete: (id: string) =>
        fetchApi<void>(`/notifications/${id}`, { method: 'DELETE' }),
};

// ============================================================================
// Health Check
// ============================================================================

export const healthApi = {
    check: () => fetchApi<{ status: string; timestamp: string }>('/health'),
};

// ============================================================================
// User Profile & Preferences
// ============================================================================

export interface UserPreferences {
    theme?: 'light' | 'dark';
    quick_nav_visible?: boolean;
    default_page?: string;
    display_density?: 'compact' | 'comfortable';
    timezone?: string;
    language?: string;
    show_profile_to_team?: boolean;
    menu_order?: string[];
}

export const profileApi = {
    update: (data: { display_name?: string; preferences?: Partial<UserPreferences> }) =>
        fetchApi<{ id: string; name: string; display_name: string | null; email: string; preferences: UserPreferences }>(
            '/auth/profile', { method: 'PATCH', body: JSON.stringify(data) }
        ),
};

export const avatarApi = {
    upload: async (file: File): Promise<{ avatar_url: string; avatar_type: string }> => {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.gebrils.cloud';
        const { supabase } = await import('./supabase');
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || '';

        const form = new FormData();
        form.append('avatar', file);

        const res = await fetch(`${API_URL}/auth/profile/avatar`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: form,
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Upload failed');
        }
        return res.json();
    },

    remove: (): Promise<{ avatar_url: null; avatar_type: string }> =>
        fetchApi('/auth/profile/avatar', { method: 'DELETE' }),
};

// ============================================================================
// Type Definitions - Journeys
// ============================================================================

export interface JourneyTask {
    id: string;
    quest_id: string;
    slug: string;
    title: string;
    description?: string;
    instructions?: string;
    validation_type: 'checkbox' | 'multi_checkbox' | 'text_acknowledge' | 'link_visit' | 'file_upload';
    validation_config: Record<string, any>;
    sort_order: number;
    is_mandatory: boolean;
    estimated_minutes?: number;
    created_at: string;
    updated_at: string;
    // Progress fields (employee view)
    is_completed?: boolean;
    completion?: { id: string; completed_at: string; validation_data: Record<string, any> } | null;
}

export interface QuestProgress {
    total: number;
    completed: number;
    mandatory_total: number;
    mandatory_completed: number;
    is_complete: boolean;
}

export interface JourneyQuest {
    id: string;
    chapter_id: string;
    slug: string;
    title: string;
    description?: string;
    sort_order: number;
    is_mandatory: boolean;
    tasks: JourneyTask[];
    progress?: QuestProgress;
}

export interface ChapterProgress {
    total_quests: number;
    completed_quests: number;
    mandatory_total: number;
    mandatory_completed: number;
    is_complete: boolean;
}

export interface JourneyChapter {
    id: string;
    journey_id: string;
    slug: string;
    title: string;
    description?: string;
    sort_order: number;
    is_mandatory: boolean;
    xp_reward: number;
    quests: JourneyQuest[];
    progress?: ChapterProgress;
    is_locked?: boolean;
}

export interface Journey {
    id: string;
    slug: string;
    title: string;
    description?: string;
    is_active: boolean;
    auto_assign_on_activation: boolean;
    sort_order: number;
    next_journey_id?: string | null;
    required_xp: number;
    created_at: string;
    updated_at: string;
    deleted_at?: string;
    chapter_count?: number;
    quest_count?: number;
    task_count?: number;
}

export interface JourneyFull extends Journey {
    chapters: JourneyChapter[];
}

export interface JourneyProgressSummary {
    total_tasks: number;
    mandatory_tasks: number;
    completed_tasks: number;
    mandatory_completed: number;
    completion_pct: number;
}

export interface AssignedJourney {
    id: string;
    user_id: string;
    journey_id: string;
    slug: string;
    title: string;
    description?: string;
    sort_order: number;
    next_journey_id?: string | null;
    required_xp: number;
    assigned_at: string;
    started_at?: string;
    completed_at?: string;
    status: 'assigned' | 'in_progress' | 'completed';
    total_xp: number;
    is_locked: boolean;
    lock_reason?: string | null;
    progress: JourneyProgressSummary;
}

export interface JourneyWithProgress extends AssignedJourney {
    chapters: JourneyChapter[];
}

export interface JourneyAssignment {
    id: string;
    user_id: string;
    journey_id: string;
    assigned_at: string;
    started_at?: string;
    completed_at?: string;
    status: string;
    total_xp: number;
    name: string;
    email: string;
    role: string;
    active: boolean;
}

export interface JourneyTaskAttachment {
    id: string;
    task_id: string;
    user_id: string;
    filename: string;
    original_name: string;
    mime_type: string;
    size_bytes: number;
    uploaded_at: string;
}

// ============================================================================
// API Client - Journeys (Admin)
// ============================================================================

export const journeysApi = {
    list: () => fetchApi<Journey[]>('/journeys'),

    get: (id: string) => fetchApi<JourneyFull>(`/journeys/${id}`),

    create: (data: Partial<Journey>) =>
        fetchApi<Journey>('/journeys', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    update: (id: string, data: Partial<Journey>) =>
        fetchApi<Journey>(`/journeys/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),

    delete: (id: string) =>
        fetchApi<{ success: boolean; message: string }>(`/journeys/${id}`, {
            method: 'DELETE',
        }),

    createChapter: (journeyId: string, data: Partial<JourneyChapter>) =>
        fetchApi<JourneyChapter>(`/journeys/${journeyId}/chapters`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    updateChapter: (id: string, data: Partial<JourneyChapter>) =>
        fetchApi<JourneyChapter>(`/journeys/chapters/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),

    deleteChapter: (id: string) =>
        fetchApi<{ success: boolean }>(`/journeys/chapters/${id}`, {
            method: 'DELETE',
        }),

    createQuest: (chapterId: string, data: Partial<JourneyQuest>) =>
        fetchApi<JourneyQuest>(`/journeys/chapters/${chapterId}/quests`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    updateQuest: (id: string, data: Partial<JourneyQuest>) =>
        fetchApi<JourneyQuest>(`/journeys/quests/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),

    deleteQuest: (id: string) =>
        fetchApi<{ success: boolean }>(`/journeys/quests/${id}`, {
            method: 'DELETE',
        }),

    createTask: (questId: string, data: Partial<JourneyTask>) =>
        fetchApi<JourneyTask>(`/journeys/quests/${questId}/tasks`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    updateTask: (id: string, data: Partial<JourneyTask>) =>
        fetchApi<JourneyTask>(`/journeys/tasks/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),

    deleteTask: (id: string) =>
        fetchApi<{ success: boolean }>(`/journeys/tasks/${id}`, {
            method: 'DELETE',
        }),

    assignToUser: (journeyId: string, userId: string) =>
        fetchApi(`/journeys/${journeyId}/assign/${userId}`, {
            method: 'POST',
        }),

    unassignUser: (journeyId: string, userId: string) =>
        fetchApi(`/journeys/${journeyId}/assign/${userId}`, {
            method: 'DELETE',
        }),

    getAssignments: (journeyId: string) =>
        fetchApi<JourneyAssignment[]>(`/journeys/${journeyId}/assignments`),
};

// ============================================================================
// API Client - My Journeys (Employee)
// ============================================================================

export const myJourneysApi = {
    list: () => fetchApi<AssignedJourney[]>('/my-journeys'),

    get: (journeyId: string) => fetchApi<JourneyWithProgress>(`/my-journeys/${journeyId}`),

    completeTask: (journeyId: string, taskId: string, validationData: Record<string, any> = {}) =>
        fetchApi(`/my-journeys/${journeyId}/tasks/${taskId}/complete`, {
            method: 'POST',
            body: JSON.stringify({ validation_data: validationData }),
        }),

    uncompleteTask: (journeyId: string, taskId: string) =>
        fetchApi(`/my-journeys/${journeyId}/tasks/${taskId}/complete`, {
            method: 'DELETE',
        }),

    uploadFile: async (journeyId: string, taskId: string, file: File): Promise<JourneyTaskAttachment> => {
        const url = `${API_URL}/my-journeys/${journeyId}/tasks/${taskId}/upload`;
        const formData = new FormData();
        formData.append('file', file);

        let authToken: string | null = null;
        if (typeof window !== 'undefined') {
            const { supabase } = await import('./supabase');
            const { data: { session } } = await supabase.auth.getSession();
            authToken = session?.access_token || null;
        }

        const headers: Record<string, string> = {};
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Upload failed: ${response.status}`);
        }

        return response.json();
    },
};

// ============================================================================
// Teams API
// ============================================================================

export interface TeamApiMember {
    id: string;
    name: string;
    email: string;
    role: string;
    active: boolean;
    status: 'PREPARATION' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
    team_id?: string;
}

export interface TeamApiProject {
    id: string;
    project_id: string;
    project_name: string;
    status: string;
    priority?: string;
    start_date?: string;
    target_date?: string;
}

export interface TeamApi {
    id: string;
    name: string;
    description?: string;
    manager_id?: string;
    manager_name?: string;
    manager_email?: string;
    member_count?: number;
    project_count?: number;
    created_at?: string;
    updated_at?: string;
    members?: TeamApiMember[];
    projects?: TeamApiProject[];
}

export interface TeamSummaryApi {
    team_id?: string;
    team_name: string;
    member_count: number;
    project_count: number;
    task_count: number;
    total_xp: number;
}

export const teamsApi = {
    // Admin: list all teams
    list: () => fetchApi<TeamApi[]>('/teams'),

    // Admin: create a team
    create: (data: { name: string; description?: string; manager_id?: string }) =>
        fetchApi<TeamApi>('/teams', { method: 'POST', body: JSON.stringify(data) }),

    // Admin: get one team with members and projects
    get: (id: string) => fetchApi<TeamApi>(`/teams/${id}`),

    // Admin: update team
    update: (id: string, data: { name?: string; description?: string; manager_id?: string | null }) =>
        fetchApi<TeamApi>(`/teams/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

    // Admin: delete team
    delete: (id: string) =>
        fetchApi<{ success: boolean; message: string }>(`/teams/${id}`, { method: 'DELETE' }),

    // Admin: add member to team
    addMember: (teamId: string, userId: string) =>
        fetchApi<{ success: boolean; message: string }>(
            `/teams/${teamId}/members`,
            { method: 'POST', body: JSON.stringify({ user_id: userId }) }
        ),

    // Admin: remove member from team
    removeMember: (teamId: string, userId: string) =>
        fetchApi<{ success: boolean; message: string }>(
            `/teams/${teamId}/members/${userId}`,
            { method: 'DELETE' }
        ),

    // Admin: assign project to team
    assignProject: (teamId: string, projectId: string) =>
        fetchApi<{ success: boolean; message: string }>(
            `/teams/${teamId}/projects`,
            { method: 'POST', body: JSON.stringify({ project_id: projectId }) }
        ),

    // Admin: unassign project from team
    unassignProject: (teamId: string, projectId: string) =>
        fetchApi<{ success: boolean; message: string }>(
            `/teams/${teamId}/projects/${projectId}`,
            { method: 'DELETE' }
        ),

    // Manager: get own team
    getMine: () => fetchApi<TeamApi>('/teams/mine'),

    // Manager: get team summary
    getSummary: () => fetchApi<TeamSummaryApi>('/manager/summary'),
};

// ============================================================================
// IDP — Individual Development Plan Types
// ============================================================================

export interface IDPTask {
    id: string;
    title: string;
    description?: string;
    start_date?: string;
    due_date?: string;
    priority?: 'low' | 'medium' | 'high';
    difficulty?: 'easy' | 'medium' | 'hard';
    is_mandatory: boolean;
    progress_status: 'TODO' | 'IN_PROGRESS' | 'ON_HOLD' | 'DONE';
    is_overdue?: boolean;
    completed_at?: string | null;
    completed_late?: boolean | null;
    hold_reason?: string | null;
    requires_attachment: boolean;
    links: IDPTaskLink[];
    attachments: IDPTaskAttachment[];
}

export interface IDPTaskLink {
    id: string;
    task_id: string;
    url: string;
    label: string;
    created_by: string;
    created_by_name?: string;
    created_at: string;
}

export interface IDPTaskAttachment {
    id: string;
    task_id: string;
    user_id: string;
    original_name: string;
    mime_type: string;
    size_bytes: number;
    uploaded_by_role: 'manager' | 'resource';
    uploaded_at: string;
}

export interface IDPTaskComment {
    id: string;
    user_id: string;
    task_id: string;
    author_id: string;
    author_name: string | null;
    author_role: string | null;
    body: string;
    created_at: string;
    updated_at: string;
}

export interface IDPHistoryEntry {
    id: string;
    title: string;
    description?: string | null;
    created_at: string;
    archived_at: string;
    progress: {
        total_tasks: number;
        done_tasks: number;
        completion_pct: number;
        mandatory_tasks: number;
        mandatory_done: number;
    };
}

export interface IDPObjective {
    id: string;
    title: string;
    description?: string;
    start_date?: string;
    due_date?: string;
    sort_order: number;
    progress: {
        total: number;
        done: number;
        completion_pct: number;
        overdue?: number;
    };
    tasks: IDPTask[];
}

export interface IDPPlan {
    id: string;
    title: string;
    description?: string;
    plan_type: 'idp';
    owner_user_id: string;
    is_active: boolean;
    created_at: string;
    updated_at?: string;
    objectives: IDPObjective[];
    progress: {
        total_tasks: number;
        done_tasks: number;
        completion_pct: number;
        mandatory_tasks: number;
        mandatory_done: number;
        overdue_tasks: number;
        on_hold_tasks: number;
    };
}

export interface IDPReport {
    user: { id: string; name: string; email: string };
    plan: { title: string; created_at: string; status: string };
    summary: {
        total_tasks: number;
        completed_tasks: number;
        completion_pct: number;
        overdue_tasks: number;
        on_time_completed: number;
        late_completed: number;
        on_hold_tasks: number;
    };
    objectives: Array<{
        title: string;
        due_date?: string;
        completion_pct: number;
        tasks: Array<{
            title: string;
            status: 'TODO' | 'IN_PROGRESS' | 'DONE';
            due_date?: string;
            completed_at?: string | null;
            on_time?: boolean | null;
        }>;
    }>;
}

// ============================================================================
// IDP — API Client
// ============================================================================

export const developmentPlansApi = {
    // Manager: get plan for a user
    getForUser: (userId: string, planId?: string) =>
        fetchApi<IDPPlan | IDPPlan[]>(`/api/development-plans/${userId}${planId ? `?planId=${planId}` : ''}`),

    // Manager: create plan
    create: (userId: string, data: { title: string; description?: string; required_xp?: number }) =>
        fetchApi<IDPPlan>(`/api/development-plans/${userId}`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    // Manager: add objective
    addObjective: (userId: string, data: { title: string; description?: string; due_date?: string; planId?: string }) =>
        fetchApi<IDPObjective>(`/api/development-plans/${userId}/objectives`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    // Manager: update objective
    updateObjective: (userId: string, chapterId: string, data: { title?: string; description?: string; due_date?: string }) =>
        fetchApi<IDPObjective>(`/api/development-plans/${userId}/objectives/${chapterId}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),

    // Manager: delete objective
    deleteObjective: (userId: string, chapterId: string) =>
        fetchApi<{ success: boolean }>(`/api/development-plans/${userId}/objectives/${chapterId}`, {
            method: 'DELETE',
        }),

    // Manager: add task to objective
    addTask: (userId: string, chapterId: string, data: { title: string; description?: string; due_date?: string; priority?: string; difficulty?: string; is_mandatory?: boolean; requires_attachment?: boolean }) =>
        fetchApi<IDPTask>(`/api/development-plans/${userId}/objectives/${chapterId}/tasks`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    // Manager: update task
    updateTask: (userId: string, taskId: string, data: Partial<Pick<IDPTask, 'title' | 'description' | 'due_date' | 'priority' | 'difficulty' | 'is_mandatory' | 'requires_attachment'>>) =>
        fetchApi<IDPTask>(`/api/development-plans/${userId}/tasks/${taskId}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),

    // Manager: delete task
    deleteTask: (userId: string, taskId: string) =>
        fetchApi<{ success: boolean }>(`/api/development-plans/${userId}/tasks/${taskId}`, {
            method: 'DELETE',
        }),

    // Manager: complete plan
    completePlan: (userId: string, planId?: string) =>
        fetchApi<{ success: boolean }>(`/api/development-plans/${userId}/complete`, {
            method: 'POST',
            body: JSON.stringify({ planId }),
        }),

    // Manager: get report
    getReport: (userId: string) =>
        fetchApi<IDPReport>(`/api/development-plans/${userId}/report`),

    // User: get own plan
    getMy: () =>
        fetchApi<IDPPlan[]>('/api/development-plans/my'),

    // User: list own archived plans
    listMyHistory: () =>
        fetchApi<IDPHistoryEntry[]>('/api/development-plans/my/history'),

    // User: read an archived plan by id
    getMyHistoryPlan: (planId: string) =>
        fetchApi<IDPPlan>(`/api/development-plans/my/history/${planId}`),

    // User: update task status
    updateMyTaskStatus: (
        taskId: string,
        status: 'TODO' | 'IN_PROGRESS' | 'ON_HOLD' | 'DONE',
        comment?: string
    ) =>
        fetchApi<{ task_id: string; progress_status: string }>(`/api/development-plans/my/tasks/${taskId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status, comment }),
        }),

    listMyTaskComments: (taskId: string) =>
        fetchApi<IDPTaskComment[]>(`/api/development-plans/my/tasks/${taskId}/comments`),

    addMyTaskComment: (taskId: string, body: string) =>
        fetchApi<IDPTaskComment>(`/api/development-plans/my/tasks/${taskId}/comments`, {
            method: 'POST',
            body: JSON.stringify({ body }),
        }),

    listTaskComments: (userId: string, taskId: string) =>
        fetchApi<IDPTaskComment[]>(`/api/development-plans/${userId}/tasks/${taskId}/comments`),

    addTaskComment: (userId: string, taskId: string, body: string) =>
        fetchApi<IDPTaskComment>(`/api/development-plans/${userId}/tasks/${taskId}/comments`, {
            method: 'POST',
            body: JSON.stringify({ body }),
        }),

    listMyPlans: () =>
        fetchApi<Array<{ id: string; title: string; description?: string; is_active: boolean; created_at: string; updated_at: string; progress: { total_tasks: number; done_tasks: number; completion_pct: number } }>>('/api/development-plans/my/plans'),

    getMyPlan: (planId: string) =>
        fetchApi<IDPPlan>(`/api/development-plans/my/plan/${planId}`),

    updatePlan: (userId: string, planId: string, data: { title?: string; description?: string }) =>
        fetchApi<{ id: string; title: string; description: string; updated_at: string }>(`/api/development-plans/${userId}/plan/${planId}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),

    deletePlan: (userId: string, planId: string) =>
        fetchApi<{ deleted: boolean }>(`/api/development-plans/${userId}/plan/${planId}`, {
            method: 'DELETE',
        }),

    addTaskLink: (userId: string, taskId: string, url: string, label: string) =>
        fetchApi<IDPTaskLink>(`/api/development-plans/${userId}/tasks/${taskId}/links`, {
            method: 'POST',
            body: JSON.stringify({ url, label }),
        }),

    deleteTaskLink: (userId: string, taskId: string, linkId: string) =>
        fetchApi<{ deleted: boolean }>(`/api/development-plans/${userId}/tasks/${taskId}/links/${linkId}`, {
            method: 'DELETE',
        }),

    listTaskLinks: (userId: string, taskId: string) =>
        fetchApi<IDPTaskLink[]>(`/api/development-plans/${userId}/tasks/${taskId}/links`),

    listMyTaskLinks: (taskId: string) =>
        fetchApi<IDPTaskLink[]>(`/api/development-plans/my/tasks/${taskId}/links`),

    uploadTaskAttachment: async (userId: string, taskId: string, file: File): Promise<IDPTaskAttachment> => {
        const formData = new FormData();
        formData.append('file', file);
        const { supabase } = await import('./supabase');
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const response = await fetch(`${API_URL}/development-plans/${userId}/tasks/${taskId}/attachments`, {
            method: 'POST', headers, body: formData,
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: 'Upload failed' }));
            throw new Error(err.error || 'Upload failed');
        }
        return response.json();
    },

    uploadMyTaskAttachment: async (taskId: string, file: File): Promise<IDPTaskAttachment> => {
        const formData = new FormData();
        formData.append('file', file);
        const { supabase } = await import('./supabase');
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const response = await fetch(`${API_URL}/development-plans/my/tasks/${taskId}/attachments`, {
            method: 'POST', headers, body: formData,
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: 'Upload failed' }));
            throw new Error(err.error || 'Upload failed');
        }
        return response.json();
    },

    getAttachmentUrl: (attachmentId: string) =>
        fetchApi<{ url: string; original_name: string; mime_type: string; size_bytes: number }>(`/api/development-plans/attachments/${attachmentId}`),

    deleteAttachment: (attachmentId: string) =>
        fetchApi<{ deleted: boolean }>(`/api/development-plans/attachments/${attachmentId}`, {
            method: 'DELETE',
        }),
};
