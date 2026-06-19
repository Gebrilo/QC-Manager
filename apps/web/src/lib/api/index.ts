import type { TestCase, TestCaseListResponse, TestSuite, SuiteTestCase, TestSuiteListResponse, TestRun, TestRunExecution, TestRunProgress, TestRunListResponse } from '@/types';

const _rawApiUrl = process.env.NEXT_PUBLIC_API_URL || '';
const API_URL = _rawApiUrl.length > 8 ? _rawApiUrl : 'https://api.gebrils.cloud';

type ApiErrorEvent = { status: number; message: string; endpoint: string };
const apiErrorListeners = new Set<(e: ApiErrorEvent) => void>();
export function onApiError(fn: (e: ApiErrorEvent) => void) {
    apiErrorListeners.add(fn);
    return () => { apiErrorListeners.delete(fn); };
}
function emitApiError(e: ApiErrorEvent) {
    apiErrorListeners.forEach(fn => { try { fn(e); } catch {} });
}

/**
 * Generic API fetch wrapper
 */
export async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    // Get auth token from Supabase session
    let authToken: string | null = null;
    if (typeof window !== 'undefined') {
        const { supabase } = await import('../supabase');
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
                const { supabase } = await import('../supabase');
                supabase.auth.signOut();
            }
            throw new Error(errorData.error || 'Session expired. Please log in again.');
        }

        // Handle 403 Forbidden - insufficient permissions
        if (response.status === 403) {
            const err = new Error(errorData.error || 'You do not have permission to perform this action');
            (err as any).status = 403;
            emitApiError({ status: 403, message: err.message, endpoint });
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
        emitApiError({ status: response.status, message: err.message, endpoint });
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

function parseContentDispositionFileName(disposition: string | null): string | null {
    if (!disposition) return null;

    const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (encodedMatch?.[1]) {
        try {
            return decodeURIComponent(encodedMatch[1]);
        } catch {
            return encodedMatch[1];
        }
    }

    const quotedMatch = disposition.match(/filename="([^"]+)"/i);
    if (quotedMatch?.[1]) return quotedMatch[1];

    const bareMatch = disposition.match(/filename=([^;]+)/i);
    return bareMatch?.[1]?.trim() || null;
}

export async function fetchApiBlob(endpoint: string, options: RequestInit = {}) {
    const url = `${API_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    let authToken: string | null = null;
    if (typeof window !== 'undefined') {
        const { supabase } = await import('../supabase');
        const { data: { session } } = await supabase.auth.getSession();
        authToken = session?.access_token || null;
    }

    const headers: Record<string, string> = {
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
        const errorText = await response.text().catch(() => '');

        if (response.status === 401 && typeof window !== 'undefined') {
            const { supabase } = await import('../supabase');
            supabase.auth.signOut();
        }

        const err = new Error(errorText || `API Error: ${response.statusText}`);
        (err as any).status = response.status;
        emitApiError({ status: response.status, message: err.message, endpoint });
        throw err;
    }

    const blob = await response.blob();
    const contentType = response.headers.get('content-type') || blob.type || 'application/octet-stream';
    const fileName = parseContentDispositionFileName(response.headers.get('content-disposition'))
        || `report-${Date.now()}`;

    return { blob, fileName, contentType };
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
    status: 'Todo' | 'In Progress' | 'Blocked' | 'Done' | 'Canceled';
    priority?: 'High' | 'Medium' | 'Low';
    project_id: string;
    parent_user_story_id?: string;
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
    assignments?: TaskAssignment[];
    initial_estimate?: number | null;
    final_estimate?: number | null;
    actual_effort?: number | null;
    total_est_hrs?: number;
    total_actual_hrs?: number;
    overall_completion_pct?: number;
    deadline?: string;
    expected_start_date?: string;
    actual_start_date?: string;
    completed_date?: string;
    tags?: string[];
    notes?: string;
    sync_status?: 'synced' | 'pending' | 'failed' | 'standalone';
    last_sync_attempted_at?: string | null;
    last_sync_error?: string | null;
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
    tuleap_username?: string | null;
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

export interface LandingPageConfig {
    id?: string;
    hero_title: string;
    hero_subtitle: string;
    hero_cta_label: string;
    hero_cta_url: string;
    hero_secondary_cta_label?: string | null;
    hero_secondary_cta_url?: string | null;
    marketing_intro_title: string;
    marketing_intro_description: string;
    show_features: boolean;
    show_roadmap: boolean;
    show_changelog: boolean;
    show_footer_cta: boolean;
    footer_cta_title?: string | null;
    footer_cta_description?: string | null;
    footer_cta_label?: string | null;
    footer_cta_url?: string | null;
    is_public: boolean;
    created_at?: string;
    updated_at?: string;
    created_by?: string | null;
    updated_by?: string | null;
}

export interface LandingPageFeature {
    id: string;
    title: string;
    description: string;
    icon_key?: string | null;
    display_order: number;
    is_active?: boolean;
    created_at?: string;
    updated_at?: string;
}

export type RoadmapStatus = 'planned' | 'in_progress' | 'completed';
export type RoadmapPriority = 'low' | 'medium' | 'high' | 'critical';

export interface RoadmapItem {
    id: string;
    title: string;
    description: string;
    status: RoadmapStatus;
    priority: RoadmapPriority;
    target_date?: string | null;
    completion_date?: string | null;
    display_order: number;
    is_public?: boolean;
    source_reference?: string | null;
    created_at?: string;
    updated_at?: string;
}

export type ChangelogSource = 'manual' | 'ai_agent' | 'github' | 'n8n' | 'system';

export interface ChangelogEntry {
    id: string;
    version_number?: string | null;
    title: string;
    content_markdown: string;
    published_at?: string | null;
    is_published?: boolean;
    generated_by_ai: boolean;
    source: ChangelogSource;
    source_reference?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface PublicLandingPageResponse {
    config: LandingPageConfig;
    features: LandingPageFeature[];
    roadmap_items: RoadmapItem[];
    changelog_entries: ChangelogEntry[];
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
    list: (params?: { related_type?: string; related_id?: string; limit?: number }) => {
        const clean: Record<string, string> = {};
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                if (v !== undefined && v !== null && v !== '') clean[k] = String(v);
            }
        }
        const query = new URLSearchParams(clean).toString();
        return fetchApi<Task[]>(`/tasks${query ? `?${query}` : ''}`);
    },

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

    sync: (id: string) =>
        fetchApi<{ success: boolean; data: Task }>(`/tasks/${id}/sync`, { method: 'POST' }),
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
    tuleap_tracker_id?: number;
    title: string;
    description?: string;
    dev_fix_description?: string;
    qc_verification_notes?: string;
    initial_effort?: number | null;
    remaining_effort?: number | null;
    cc?: string[];
    status: string;
    severity: string;
    priority: string;
    bug_type?: string;
    component?: string;
    environment?: string;
    service_name?: string;
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
    last_sync_at?: string;
    created_at?: string;
    updated_at?: string;
    sync_status?: 'synced' | 'pending' | 'failed' | 'standalone';
    last_sync_attempted_at?: string | null;
    last_sync_error?: string | null;
    _can?: {
        edit?: boolean;
        delete?: boolean;
        assign?: boolean;
        comment?: boolean;
    };
}

export interface TaskAssignment {
    id?: string;
    task_id?: string;
    resource_id: string;
    resource_name?: string;
    assignment_type: 'PRIMARY' | 'SECONDARY';
    initial_estimate?: number | null;
    final_estimate?: number | null;
    estimate_hrs?: number;
    actual_hrs?: number;
    planned_working_days?: number | null;
    completion_status?: 'Pending' | 'Completed';
    completed_at?: string | null;
    estimate_accuracy?: EstimateAccuracy | null;
}

export type EstimateAccuracy = {
    ratio: number | null;
    verdict: 'padded' | 'accurate' | 'blew_past' | null;
    label: string | null;
    threshold: number;
    lower_bound: number;
    upper_bound: number;
};

export interface UserStory {
    id: string;
    tuleap_artifact_id?: number;
    title: string;
    description?: string;
    acceptance_criteria?: string;
    status?: string;
    project_id?: string;
    project_name?: string;
    priority?: string;
    story_points?: number;
    tuleap_url?: string;
    created_at?: string;
    updated_at?: string;
    sync_status?: 'synced' | 'pending' | 'failed' | 'standalone';
    last_sync_attempted_at?: string | null;
    last_sync_error?: string | null;
    _can?: {
        edit?: boolean;
        delete?: boolean;
        assign?: boolean;
        comment?: boolean;
    };
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
            by_severity: { critical: number; major: number; minor: number; cosmetic: number };
            by_source: { test_case: number; exploratory: number };
            by_project: any[];
            recent_bugs: Bug[];
        } }>(`/bugs/summary${project_id ? `?project_id=${project_id}` : ''}`),

    create: (data: Record<string, unknown>) =>
        fetchApi<{ success: boolean; data: Bug }>(`/bugs`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    update: (id: string, data: Record<string, unknown>) =>
        fetchApi<{ success: boolean; data: Bug }>(`/bugs/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),

    sync: (id: string) =>
        fetchApi<{ success: boolean; data: Bug }>(`/bugs/${id}/sync`, { method: 'POST' }),

    delete: (id: string) =>
        fetchApi<{ success: boolean; message: string; data: Bug }>(`/bugs/${id}`, { method: 'DELETE' }),
};

export const userStoriesApi = {
    list: (params?: { page?: number; limit?: number; search?: string; project_id?: string; status?: string; related_type?: string; related_id?: string }) => {
        const clean: Record<string, string> = {};
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                if (v !== undefined && v !== null && v !== '') clean[k] = String(v);
            }
        }
        const query = new URLSearchParams(clean).toString();
        return fetchApi<{ data: UserStory[]; pagination: { page: number; limit: number; total: number; total_pages: number } }>(`/user-stories${query ? `?${query}` : ''}`);
    },

    get: (id: string) =>
        fetchApi<UserStory>(`/user-stories/${id}`),

    create: (data: Record<string, unknown>) =>
        fetchApi<{ success: boolean; data: UserStory }>(`/user-stories`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    update: (id: string, data: Record<string, unknown>) =>
        fetchApi<{ success: boolean; data: UserStory }>(`/user-stories/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),

    sync: (id: string) =>
        fetchApi<{ success: boolean; data: UserStory }>(`/user-stories/${id}/sync`, { method: 'POST' }),

    delete: (id: string) =>
        fetchApi<{ success: boolean; message: string; data: UserStory }>(`/user-stories/${id}`, { method: 'DELETE' }),
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
// Types - PM Dashboard
// ============================================================================

export type PmProjectResource = {
    resource_id: string;
    name: string;
    capacity_hrs: number;
    allocated_hrs: number;
    utilization_pct: number;
};

export type PmCrossTeamDependency = {
    from_team: string;
    to_team: string;
    artifact_count: number;
};

export type PmProjectDashboard = {
    project_id: string;
    project_name: string;
    total_workload: number;
    tasks_by_status: Record<string, number>;
    tasks_by_team: Record<string, number>;
    bugs_by_status: Record<string, number>;
    bugs_by_severity: Record<string, number>;
    user_stories: { total: number; in_progress: number; done: number };
    blocked_count: number;
    overdue_count: number;
    resources: PmProjectResource[];
    cross_team_dependencies: PmCrossTeamDependency[];
    test_execution_summary: { passed: number; failed: number; blocked: number; total: number };
};

export type PmDashboardResponse = { projects: PmProjectDashboard[] };

// ============================================================================
// Types - Team Manager / Member Dashboards
// ============================================================================

export type DashboardTask = {
    id: string;
    task_id?: string | null;
    task_name: string;
    status: string;
    priority?: string | null;
    project_id?: string | null;
    project_name?: string | null;
    owner_team_id?: string | null;
    resource1_id?: string | null;
    resource1_name?: string | null;
    resource2_id?: string | null;
    resource2_name?: string | null;
    parent_user_story_id?: string | null;
    deadline?: string | null;
    total_est_hrs: number;
    total_estimated_effort?: number;
    total_actual_hrs: number;
    assignments?: TaskAssignment[];
    assignment_role?: 'owning' | 'supporting' | null;
    my_estimate_hrs?: number;
    my_actual_hrs?: number;
    my_estimate_accuracy?: EstimateAccuracy;
    _can?: {
        view?: boolean;
        edit?: boolean;
        take_over?: boolean;
    };
};

export type DashboardBug = {
    id: string;
    bug_id?: string | null;
    tuleap_artifact_id?: number | null;
    title: string;
    status: string;
    severity?: string | null;
    priority?: string | null;
    project_id?: string | null;
    project_name?: string | null;
    owner_team_id?: string | null;
};

export type DashboardUserStory = {
    id: string;
    tuleap_artifact_id?: number | null;
    title: string;
    status: string;
    priority?: string | null;
    project_id?: string | null;
    project_name?: string | null;
};

export type TeamManagerDashboard = {
    team_id: string;
    team_name: string | null;
    team_type: string | null;
    team_tasks: {
        total: number;
        by_status: Record<string, number>;
        items: DashboardTask[];
    };
    tasks_by_member: Array<{ user_id: string; resource_id?: string | null; name: string; total: number }>;
    members: Array<{
        user_id: string;
        resource_id?: string | null;
        name: string;
        workload_hrs: number;
        capacity_hrs: number;
        logged_hrs: number;
    }>;
    blocked_items: DashboardTask[];
    overdue_items: DashboardTask[];
    team_bugs: { total: number; by_status: Record<string, number> } | null;
    reports_link: string;
};

export type MemberDashboard = {
    my_tasks: DashboardTask[];
    my_bugs: DashboardBug[];
    related_user_stories: DashboardUserStory[];
    due_this_week: DashboardTask[];
    logged_time_this_week: number;
    shared_with_me: Array<{
        artifact_type: string;
        artifact_id: string;
        display_id?: string | null;
        title: string;
        status?: string | null;
        action: string;
    }>;
};

// ============================================================================
// API Client - Dashboards
// ============================================================================

export const pmDashboardApi = {
    get: () => fetchApi<PmDashboardResponse>('/api/dashboards/pm'),
};

export const teamManagerDashboardApi = {
    get: () => fetchApi<TeamManagerDashboard>('/api/dashboards/team-manager'),
};

export const memberDashboardApi = {
    get: () => fetchApi<MemberDashboard>('/api/dashboards/member'),
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
        fetchApi<{ success: boolean; data: ReportJob }>(`/reports/${jobId}?_ts=${Date.now()}`, {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                Pragma: 'no-cache',
            },
        }),

    list: (params?: { user_email?: string; status?: string; limit?: number; offset?: number }) => {
        const query = new URLSearchParams(params as any).toString();
        return fetchApi<{ success: boolean; data: ReportJob[] }>(`/reports${query ? `?${query}` : ''}`);
    },

    download: (jobId: string) =>
        fetchApiBlob(`/reports/${jobId}/download`, {
            method: 'GET',
            cache: 'no-store',
        }),

    share: (data: {
        report_id: string;
        report_name: string;
        report_type: 'project_status' | 'resource_utilization' | 'task_export' | 'test_results' | 'dashboard';
        format?: 'xlsx' | 'csv' | 'json' | 'pdf';
        recipients: string[];
        share_url: string;
        attach_export?: boolean;
        filters?: {
            project_ids?: string[];
            status?: string[];
            date_from?: string;
            date_to?: string;
        };
        attachment?: {
            filename: string;
            mime_type: string;
            content_base64: string;
        };
        message?: string;
    }) =>
        fetchApi<{
            success: boolean;
            message: string;
            data: {
                recipients: string[];
                share_url: string;
                job_id: string | null;
                attachment_download_url: string | null;
                attachment_filename: string | null;
                attachment_note: string | null;
                email_subject: string;
                email_body: string;
                email_href: string;
            };
        }>('/reports/share', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
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
    list: (params?: {
        page?: number;
        limit?: number;
        search?: string;
        project_id?: string;
        status?: string;
        priority?: string;
        test_type?: string;
        automation_status?: string;
        assigned_to?: string;
        sync_status?: string;
        category?: string;
        suite_title?: string;
        created_by?: string;
        tags?: string;
        match_suite_title?: boolean;
        suite_name?: string;
        sort_by?: string;
        sort_order?: string;
    }) => {
        const cleanParams: Record<string, string> = {};
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value === undefined || value === null || value === '') return;
                cleanParams[key] = typeof value === 'boolean' ? String(value) : String(value);
            });
        }
        const query = new URLSearchParams(cleanParams).toString();
        return fetchApi<TestCaseListResponse>(`/test-cases${query ? `?${query}` : ''}`);
    },

    get: (id: string) => fetchApi<TestCase>(`/test-cases/${id}`),

    create: (data: Partial<TestCase> & { title: string; project_id: string }) =>
        fetchApi<TestCase>('/test-cases', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    update: (id: string, data: Partial<TestCase>) =>
        fetchApi<TestCase>(`/test-cases/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),

    delete: (id: string) =>
        fetchApi<void>(`/test-cases/${id}`, { method: 'DELETE' }),

    sync: (id: string) =>
        fetchApi<{ success: boolean; data: TestCase }>(`/test-cases/${id}/sync`, { method: 'POST' }),

    bulkImport: (data: { test_cases: any[]; project_id: string }) =>
        fetchApi('/test-cases/bulk-import', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
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
    entity_type?: string | null;
    entity_id?: string | null;
    action?: string | null;
    actor_id?: string | null;
}

export interface NotificationsListResponse {
    notifications: AppNotification[];
    unread_count: number;
    total: number;
    page: number;
    limit: number;
    total_pages: number;
}

export const notificationsApi = {
    list: (params?: {
        page?: number;
        limit?: number;
        unread_only?: boolean;
        entity_type?: string;
        type?: string;
    }) => {
        const clean: Record<string, string> = {};
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                if (v === undefined || v === null || v === '') continue;
                if (k === 'unread_only' && v === false) continue;
                clean[k] = String(v);
            }
        }
        const query = new URLSearchParams(clean).toString();
        return fetchApi<NotificationsListResponse>(`/notifications${query ? `?${query}` : ''}`);
    },

    markRead: (id: string) =>
        fetchApi<AppNotification>(`/notifications/${id}/read`, { method: 'PATCH' }),

    markAllRead: () =>
        fetchApi<{ success: boolean }>('/notifications/read-all', { method: 'PATCH' }),

    delete: (id: string) =>
        fetchApi<void>(`/notifications/${id}`, { method: 'DELETE' }),
};

// ============================================================================
// API Client - Test Suites
// ============================================================================

export const testSuitesApi = {
    list: (params?: {
        page?: number;
        limit?: number;
        search?: string;
        project_id?: string;
        status?: string;
        related_type?: string;
        related_id?: string;
        sort_by?: string;
        sort_order?: string;
    }) => {
        const cleanParams: Record<string, string> = {};
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                    cleanParams[key] = String(value);
                }
            });
        }
        const query = new URLSearchParams(cleanParams).toString();
        return fetchApi<TestSuiteListResponse>(`/test-suites${query ? `?${query}` : ''}`);
    },

    get: (id: string) => fetchApi<TestSuite>(`/test-suites/${id}`),

    availableTestCases: (id: string, params?: {
        page?: number;
        limit?: number;
        search?: string;
        status?: string;
        priority?: string;
        test_type?: string;
        automation_status?: string;
        category?: string;
        suite_title?: string;
        created_by?: string;
        tags?: string;
        match_suite_title?: boolean;
    }) => {
        const cleanParams: Record<string, string> = {};
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value === undefined || value === null || value === '') return;
                cleanParams[key] = typeof value === 'boolean' ? String(value) : String(value);
            });
        }
        const query = new URLSearchParams(cleanParams).toString();
        return fetchApi<{ data: SuiteTestCase[]; pagination: { page: number; limit: number; total: number; total_pages: number } }>(
            `/test-suites/${id}/available-test-cases${query ? `?${query}` : ''}`
        );
    },

    create: (data: { name: string; project_id: string; description?: string; status?: string; test_case_ids?: string[] }) =>
        fetchApi<TestSuite>('/test-suites', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    update: (id: string, data: Partial<Pick<TestSuite, 'name' | 'description' | 'status' | 'suite_type' | 'readiness_scope'>>) =>
        fetchApi<TestSuite>(`/test-suites/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),

    delete: (id: string) =>
        fetchApi<void>(`/test-suites/${id}`, { method: 'DELETE' }),

    addTestCases: (id: string, data: { test_case_ids: string[]; position?: 'end' | 'start' | number }) =>
        fetchApi(`/test-suites/${id}/test-cases`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    removeTestCases: (id: string, data: { test_case_ids: string[] }) =>
        fetchApi(`/test-suites/${id}/test-cases`, {
            method: 'DELETE',
            body: JSON.stringify(data),
        }),

    reorder: (id: string, data: { ordered_test_case_ids: string[] }) =>
        fetchApi(`/test-suites/${id}/reorder`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),

    clone: (id: string, data: { name?: string; project_id?: string; copy_test_cases?: boolean }) =>
        fetchApi<TestSuite>(`/test-suites/${id}/clone`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),
};

// ============================================================================
// API Client - Test Runs (Enhanced)
// ============================================================================

export const testRunsApi = {
    createFromSuite: (data: { suite_id: string; name: string; project_id: string; environment?: string; version_tag?: string }) =>
        fetchApi<TestRun>('/test-executions/test-runs/from-suite', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    update: (id: string, data: Partial<Pick<TestRun, 'name' | 'description' | 'status'>>) =>
        fetchApi<TestRun>(`/test-executions/test-runs/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),

    getProgress: (id: string) =>
        fetchApi<TestRunProgress>(`/test-executions/test-runs/${id}/progress`),

    getExecutions: (id: string) =>
        fetchApi<TestRunExecution[]>(`/test-executions/test-runs/${id}/executions`),

    bulkUpdateExecutions: (id: string, data: { execution_ids: string[]; status?: string; assigned_to?: string }) =>
        fetchApi(`/test-executions/test-runs/${id}/executions/bulk`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),
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
        const { supabase } = await import('../supabase');
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
            const { supabase } = await import('../supabase');
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
    comment_count?: number;
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
        const { supabase } = await import('../supabase');
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
        const { supabase } = await import('../supabase');
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

export interface TuleapArtifact {
    id: number;
    xref?: string;
    title?: string;
    summary?: string;
    description?: string;
    status?: string;
    [key: string]: unknown;
}

export interface UnifiedPayload {
    artifact_type: 'bug' | 'task' | 'user_story' | 'test_case';
    project_id?: string;
    common: {
        title: string;
        description?: string;
        status?: string;
        assigned_to?: string | null;
        priority?: string | null;
        attachments?: Array<{ id?: number | string; name?: string; description?: string }>;
        links?: Array<{ type: string; target_artifact_id: number | string }>;
    };
    fields: Record<string, unknown>;
    tuleap?: {
        project_id?: number;
        tracker_id?: number;
        artifact_id?: number;
        url?: string;
    };
    temp_id?: string;
}

export const tuleapApi = {
    list: async (type: string, params?: Record<string, string | number>) => {
        const query = params ? '?' + new URLSearchParams(
            Object.entries(params).map(([k, v]) => [k, String(v)])
        ).toString() : '';
        return fetchApi<{ data: TuleapArtifact[]; total: number }>(`/tuleap/artifacts/${type}${query}`);
    },
    get: async (type: string, id: string | number) =>
        fetchApi<TuleapArtifact>(`/tuleap/artifacts/${type}/${id}`),
    create: async (type: string, data: Record<string, unknown>) =>
        fetchApi<{ tuleap_artifact_id: number; tuleap_url: string; qc_id: string | null; artifact_type: string; xref: string; tuleap_warning?: string }>(`/tuleap/artifacts/${type}`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    update: async (id: string | number, type: string, fields: Record<string, unknown>) =>
        fetchApi<{ updated: boolean }>(`/tuleap/artifacts/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ type, fields }),
        }),
    remove: async (id: string | number) =>
        fetchApi<{ deleted: boolean }>(`/tuleap/artifacts/${id}`, {
            method: 'DELETE',
        }),
    createUnified: async (payload: UnifiedPayload) => {
        const type = payload.artifact_type.replace('_', '-');
        return fetchApi<{ tuleap_artifact_id: number; tuleap_url: string; qc_id: string | null; artifact_type: string; xref: string; tuleap_warning?: string }>(`/tuleap/artifacts/${type}`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    },
    updateUnified: async (artifactId: string | number, payload: UnifiedPayload) =>
        fetchApi<{ updated: boolean }>(`/tuleap/artifacts/${artifactId}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        }),
    listUsers: (query?: string) =>
        fetchApi<Array<{ id: number; username: string; display_name: string; email: string | null }>>(
            `/tuleap-webhook/users${query ? `?query=${encodeURIComponent(query)}` : ''}`
        ),
    getBindLabels: (projectId: string, trackerType?: string) =>
        fetchApi<{ success: boolean; data: { tracker_id: number | null; fields: Record<string, string[]> } }>(
            `/tuleap-webhook/projects/${projectId}/bind-labels${trackerType ? `?tracker_type=${trackerType}` : ''}`
        ),
};

export interface TuleapSyncConfig {
    id: string;
    tuleap_project_id: number;
    tuleap_tracker_id: number;
    tuleap_base_url: string | null;
    tracker_type: string;
    qc_project_id: string;
    field_mappings: Record<string, string>;
    status_mappings: Record<string, string>;
    artifact_fields: Record<string, string>;
    status_value_map: Record<string, string>;
    value_maps: Record<string, Record<string, string>>;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface TuleapStatus {
    last_ingested_at: string | null;
    last_success_at: string | null;
    avg_latency_ms: number | null;
    p95_latency_ms: number | null;
    ping_history: number[];
    sync_mode: string;
    sync_mode_label: string;
    recent_failures: number;
}

export interface TuleapSyncHistoryItem {
    id: string;
    tuleap_artifact_id: number;
    tuleap_tracker_id: number | null;
    artifact_type: string | null;
    action: string;
    processing_status: 'received' | 'processed' | 'failed' | 'duplicate' | 'rejected';
    processing_result: string | null;
    error_message: string | null;
    created_at: string;
    processed_at: string | null;
    configured_tracker_type: string | null;
    qc_project_name: string | null;
}

// ============================================================================
// API Client - Task/Test Case Links
// ============================================================================

export const taskTestCaseLinksApi = {
    listTestCases: (taskId: string) =>
        fetchApi<{ data: Array<{ id: string; task_id: string; test_case_id: string; relationship_type: string; source?: 'qc' | 'tuleap'; created_at: string; test_case_display_id: string; test_case_title: string; test_case_status: string; test_case_priority: string; test_case_project_id: string }> }>(`/tasks/${taskId}/test-cases`),

    addTestCase: (taskId: string, testCaseId: string, relationshipType = 'covers') =>
        fetchApi<{ data: { id: string; task_id: string; test_case_id: string; relationship_type: string } }>(`/tasks/${taskId}/test-cases`, {
            method: 'POST',
            body: JSON.stringify({ test_case_id: testCaseId, relationship_type: relationshipType }),
        }),

    removeTestCase: (taskId: string, testCaseId: string) =>
        fetchApi<{ success: boolean; message: string }>(`/tasks/${taskId}/test-cases/${testCaseId}`, { method: 'DELETE' }),

    listTasks: (testCaseId: string) =>
        fetchApi<{ data: Array<{ id: string; task_id: string; test_case_id: string; relationship_type: string; source?: 'qc' | 'tuleap'; created_at: string; task_display_id: string; task_title: string; task_name: string; task_status: string; task_project_id: string; project_id: string }> }>(`/test-cases/${testCaseId}/tasks`),

    addTask: (testCaseId: string, taskId: string, relationshipType = 'covers') =>
        fetchApi<{ data: { id: string; task_id: string; test_case_id: string; relationship_type: string } }>(`/test-cases/${testCaseId}/tasks`, {
            method: 'POST',
            body: JSON.stringify({ task_id: taskId, relationship_type: relationshipType }),
        }),

    removeTask: (testCaseId: string, taskId: string) =>
        fetchApi<{ success: boolean; message: string }>(`/test-cases/${testCaseId}/tasks/${taskId}`, { method: 'DELETE' }),

    listBugsForTask: (taskId: string) =>
        fetchApi<{ data: Array<{ id: string; bug_id: string; task_id: string; relationship_type: string; source?: 'qc' | 'tuleap'; created_at: string; bug_display_id: string; bug_title: string; bug_status: string; bug_project_id: string }> }>(`/tasks/${taskId}/bugs`),

    addBugToTask: (taskId: string, bugId: string, relationshipType = 'blocks') =>
        fetchApi<{ data: { id: string; bug_id: string; task_id: string; relationship_type: string } }>(`/tasks/${taskId}/bugs`, {
            method: 'POST',
            body: JSON.stringify({ bug_id: bugId, relationship_type: relationshipType }),
        }),

    removeBugFromTask: (taskId: string, bugId: string) =>
        fetchApi<{ success: boolean; message: string }>(`/tasks/${taskId}/bugs/${bugId}`, { method: 'DELETE' }),

    listBugsForTestCase: (testCaseId: string) =>
        fetchApi<{ data: Array<{ id: string; bug_id: string; test_case_id: string; relationship_type: string; source?: 'qc' | 'tuleap'; created_at: string; bug_display_id: string; bug_title: string; bug_status: string; bug_project_id: string }> }>(`/test-cases/${testCaseId}/bugs`),

    addBugToTestCase: (testCaseId: string, bugId: string, relationshipType = 'reveals') =>
        fetchApi<{ data: { id: string; bug_id: string; test_case_id: string; relationship_type: string } }>(`/test-cases/${testCaseId}/bugs`, {
            method: 'POST',
            body: JSON.stringify({ bug_id: bugId, relationship_type: relationshipType }),
        }),

    removeBugFromTestCase: (testCaseId: string, bugId: string) =>
        fetchApi<{ success: boolean; message: string }>(`/test-cases/${testCaseId}/bugs/${bugId}`, { method: 'DELETE' }),

    listUserStoriesForTestCase: (testCaseId: string) =>
        fetchApi<{ data: Array<{ id: string; test_case_id: string; user_story_id: string; relationship_type: string; source?: 'qc' | 'tuleap'; created_at: string; user_story_display_id: string; user_story_title: string; user_story_status: string; user_story_project_id: string }> }>(`/test-cases/${testCaseId}/user-stories`),

    addUserStoryToTestCase: (testCaseId: string, userStoryId: string, relationshipType = 'verifies') =>
        fetchApi<{ data: { id: string; test_case_id: string; user_story_id: string; relationship_type: string } }>(`/test-cases/${testCaseId}/user-stories`, {
            method: 'POST',
            body: JSON.stringify({ user_story_id: userStoryId, relationship_type: relationshipType }),
        }),

    removeUserStoryFromTestCase: (testCaseId: string, userStoryId: string) =>
        fetchApi<{ success: boolean; message: string }>(`/test-cases/${testCaseId}/user-stories/${userStoryId}`, { method: 'DELETE' }),

    listTestCasesForUserStory: (userStoryId: string) =>
        fetchApi<{ data: Array<{ id: string; test_case_id: string; user_story_id: string; relationship_type: string; source?: 'qc' | 'tuleap'; created_at: string; test_case_display_id: string; test_case_title: string; test_case_status: string; test_case_project_id: string }> }>(`/user-stories/${userStoryId}/test-cases`),

    addTestCaseToUserStory: (userStoryId: string, testCaseId: string, relationshipType = 'verifies') =>
        fetchApi<{ data: { id: string; test_case_id: string; user_story_id: string; relationship_type: string } }>(`/user-stories/${userStoryId}/test-cases`, {
            method: 'POST',
            body: JSON.stringify({ test_case_id: testCaseId, relationship_type: relationshipType }),
        }),

    removeTestCaseFromUserStory: (userStoryId: string, testCaseId: string) =>
        fetchApi<{ success: boolean; message: string }>(`/user-stories/${userStoryId}/test-cases/${testCaseId}`, { method: 'DELETE' }),

    listBugsForUserStory: (userStoryId: string) =>
        fetchApi<{ data: Array<{ id: string; bug_id: string; user_story_id: string; relationship_type: string; source?: 'qc' | 'tuleap'; created_at: string; bug_display_id: string; bug_title: string; bug_status: string; bug_project_id: string }> }>(`/user-stories/${userStoryId}/bugs`),

    addBugToUserStory: (userStoryId: string, bugId: string, relationshipType = 'affects') =>
        fetchApi<{ data: { id: string; bug_id: string; user_story_id: string; relationship_type: string } }>(`/user-stories/${userStoryId}/bugs`, {
            method: 'POST',
            body: JSON.stringify({ bug_id: bugId, relationship_type: relationshipType }),
        }),

    removeBugFromUserStory: (userStoryId: string, bugId: string) =>
        fetchApi<{ success: boolean; message: string }>(`/user-stories/${userStoryId}/bugs/${bugId}`, { method: 'DELETE' }),

    listSuitesForUserStory: (userStoryId: string) =>
        fetchApi<{ data: Array<{ id: string; user_story_id: string; test_suite_id: string; relationship_type: string; source?: 'qc' | 'tuleap'; created_at: string; test_suite_display_id: string; test_suite_title: string; test_suite_status: string; test_suite_project_id: string }> }>(`/user-stories/${userStoryId}/test-suites`),

    addSuiteToUserStory: (userStoryId: string, testSuiteId: string, relationshipType = 'validated by') =>
        fetchApi<{ data: { id: string; user_story_id: string; test_suite_id: string; relationship_type: string } }>(`/user-stories/${userStoryId}/test-suites`, {
            method: 'POST',
            body: JSON.stringify({ test_suite_id: testSuiteId, relationship_type: relationshipType }),
        }),

    removeSuiteFromUserStory: (userStoryId: string, testSuiteId: string) =>
        fetchApi<{ success: boolean; message: string }>(`/user-stories/${userStoryId}/test-suites/${testSuiteId}`, { method: 'DELETE' }),

    listRunsForUserStory: (userStoryId: string) =>
        fetchApi<{ data: Array<{ id: string; user_story_id: string; test_run_id: string; relationship_type: string; source?: 'qc' | 'tuleap'; created_at: string; test_run_display_id: string; test_run_title: string; test_run_status: string; test_run_project_id: string }> }>(`/user-stories/${userStoryId}/test-runs`),

    addRunToUserStory: (userStoryId: string, testRunId: string, relationshipType = 'validated by') =>
        fetchApi<{ data: { id: string; user_story_id: string; test_run_id: string; relationship_type: string } }>(`/user-stories/${userStoryId}/test-runs`, {
            method: 'POST',
            body: JSON.stringify({ test_run_id: testRunId, relationship_type: relationshipType }),
        }),

    removeRunFromUserStory: (userStoryId: string, testRunId: string) =>
        fetchApi<{ success: boolean; message: string }>(`/user-stories/${userStoryId}/test-runs/${testRunId}`, { method: 'DELETE' }),

    listRunsForTask: (taskId: string) =>
        fetchApi<{ data: Array<{ id: string; task_id: string; test_run_id: string; relationship_type: string; source?: 'qc' | 'tuleap'; created_at: string; test_run_display_id: string; test_run_title: string; test_run_status: string; test_run_project_id: string }> }>(`/tasks/${taskId}/test-runs`),

    addRunToTask: (taskId: string, testRunId: string, relationshipType = 'exercised by') =>
        fetchApi<{ data: { id: string; task_id: string; test_run_id: string; relationship_type: string } }>(`/tasks/${taskId}/test-runs`, {
            method: 'POST',
            body: JSON.stringify({ test_run_id: testRunId, relationship_type: relationshipType }),
        }),

    removeRunFromTask: (taskId: string, testRunId: string) =>
        fetchApi<{ success: boolean; message: string }>(`/tasks/${taskId}/test-runs/${testRunId}`, { method: 'DELETE' }),
};

// ============================================================================
// API Client - Bug Links
// ============================================================================

export const bugLinksApi = {
    listTestExecutions: (bugId: string) =>
        fetchApi<{ data: Array<{ id: string; bug_id: string; test_execution_id: string; created_at: string; execution_status: string; execution_notes: string; executed_at: string; test_run_id: string; test_run_name: string }> }>(`/bugs/${bugId}/test-executions`),

    addTestExecution: (bugId: string, testExecutionId: string) =>
        fetchApi<{ data: { id: string; bug_id: string; test_execution_id: string } }>(`/bugs/${bugId}/test-executions`, {
            method: 'POST',
            body: JSON.stringify({ test_execution_id: testExecutionId }),
        }),

    removeTestExecution: (bugId: string, testExecutionId: string) =>
        fetchApi<{ success: boolean; message: string }>(`/bugs/${bugId}/test-executions/${testExecutionId}`, { method: 'DELETE' }),

    listTasks: (bugId: string) =>
        fetchApi<{ data: Array<{ id: string; bug_id: string; task_id: string; relationship_type: string; source?: 'qc' | 'tuleap'; created_at: string; task_display_id: string; task_title: string; task_name: string; task_status: string; task_project_id: string; project_id: string }> }>(`/bugs/${bugId}/tasks`),

    addTask: (bugId: string, taskId: string, relationshipType = 'blocks') =>
        fetchApi<{ data: { id: string; bug_id: string; task_id: string; relationship_type: string } }>(`/bugs/${bugId}/tasks`, {
            method: 'POST',
            body: JSON.stringify({ task_id: taskId, relationship_type: relationshipType }),
        }),

    removeTask: (bugId: string, taskId: string) =>
        fetchApi<{ success: boolean; message: string }>(`/bugs/${bugId}/tasks/${taskId}`, { method: 'DELETE' }),

    listTestCases: (bugId: string) =>
        fetchApi<{ data: Array<{ id: string; bug_id: string; test_case_id: string; relationship_type: string; source?: 'qc' | 'tuleap'; created_at: string; test_case_display_id: string; test_case_title: string; test_case_status: string; test_case_project_id: string }> }>(`/bugs/${bugId}/test-cases`),

    addTestCase: (bugId: string, testCaseId: string, relationshipType = 'reveals') =>
        fetchApi<{ data: { id: string; bug_id: string; test_case_id: string; relationship_type: string } }>(`/bugs/${bugId}/test-cases`, {
            method: 'POST',
            body: JSON.stringify({ test_case_id: testCaseId, relationship_type: relationshipType }),
        }),

    removeTestCase: (bugId: string, testCaseId: string) =>
        fetchApi<{ success: boolean; message: string }>(`/bugs/${bugId}/test-cases/${testCaseId}`, { method: 'DELETE' }),

    listUserStories: (bugId: string) =>
        fetchApi<{ data: Array<{ id: string; bug_id: string; user_story_id: string; relationship_type: string; source?: 'qc' | 'tuleap'; created_at: string; user_story_display_id: string; user_story_title: string; user_story_status: string; user_story_project_id: string }> }>(`/bugs/${bugId}/user-stories`),

    addUserStory: (bugId: string, userStoryId: string, relationshipType = 'affects') =>
        fetchApi<{ data: { id: string; bug_id: string; user_story_id: string; relationship_type: string } }>(`/bugs/${bugId}/user-stories`, {
            method: 'POST',
            body: JSON.stringify({ user_story_id: userStoryId, relationship_type: relationshipType }),
        }),

    removeUserStory: (bugId: string, userStoryId: string) =>
        fetchApi<{ success: boolean; message: string }>(`/bugs/${bugId}/user-stories/${userStoryId}`, { method: 'DELETE' }),

    listRuns: (bugId: string) =>
        fetchApi<{ data: Array<{ id: string; bug_id: string; test_run_id: string; relationship_type: string; source?: 'qc' | 'tuleap'; created_at: string; test_run_display_id: string; test_run_title: string; test_run_status: string; test_run_project_id: string }> }>(`/bugs/${bugId}/test-runs`),

    addRun: (bugId: string, testRunId: string, relationshipType = 'found in') =>
        fetchApi<{ data: { id: string; bug_id: string; test_run_id: string; relationship_type: string } }>(`/bugs/${bugId}/test-runs`, {
            method: 'POST',
            body: JSON.stringify({ test_run_id: testRunId, relationship_type: relationshipType }),
        }),

    removeRun: (bugId: string, testRunId: string) =>
        fetchApi<{ success: boolean; message: string }>(`/bugs/${bugId}/test-runs/${testRunId}`, { method: 'DELETE' }),
};

// ============================================================================
// API Client - Landing Page
// ============================================================================

export const landingPageApi = {
    getPublic: () =>
        fetchApi<PublicLandingPageResponse>('/public/landing-page'),

    admin: {
        getConfig: () =>
            fetchApi<LandingPageConfig>('/admin/landing-page/config'),

        updateConfig: (data: LandingPageConfig) =>
            fetchApi<LandingPageConfig>('/admin/landing-page/config', {
                method: 'PUT',
                body: JSON.stringify(data),
            }),

        listFeatures: () =>
            fetchApi<LandingPageFeature[]>('/admin/landing-page/features'),

        createFeature: (data: Omit<LandingPageFeature, 'id'>) =>
            fetchApi<LandingPageFeature>('/admin/landing-page/features', {
                method: 'POST',
                body: JSON.stringify(data),
            }),

        updateFeature: (id: string, data: Partial<LandingPageFeature>) =>
            fetchApi<LandingPageFeature>(`/admin/landing-page/features/${id}`, {
                method: 'PUT',
                body: JSON.stringify(data),
            }),

        deleteFeature: (id: string) =>
            fetchApi<{ success: boolean; id: string }>(`/admin/landing-page/features/${id}`, { method: 'DELETE' }),

        listRoadmap: () =>
            fetchApi<RoadmapItem[]>('/admin/landing-page/roadmap'),

        createRoadmapItem: (data: Omit<RoadmapItem, 'id'>) =>
            fetchApi<RoadmapItem>('/admin/landing-page/roadmap', {
                method: 'POST',
                body: JSON.stringify(data),
            }),

        updateRoadmapItem: (id: string, data: Partial<RoadmapItem>) =>
            fetchApi<RoadmapItem>(`/admin/landing-page/roadmap/${id}`, {
                method: 'PUT',
                body: JSON.stringify(data),
            }),

        deleteRoadmapItem: (id: string) =>
            fetchApi<{ success: boolean; id: string }>(`/admin/landing-page/roadmap/${id}`, { method: 'DELETE' }),

        listChangelog: () =>
            fetchApi<ChangelogEntry[]>('/admin/landing-page/changelog'),

        createChangelogEntry: (data: Omit<ChangelogEntry, 'id'>) =>
            fetchApi<ChangelogEntry>('/admin/landing-page/changelog', {
                method: 'POST',
                body: JSON.stringify(data),
            }),

        updateChangelogEntry: (id: string, data: Partial<ChangelogEntry>) =>
            fetchApi<ChangelogEntry>(`/admin/landing-page/changelog/${id}`, {
                method: 'PUT',
                body: JSON.stringify(data),
            }),

        deleteChangelogEntry: (id: string) =>
            fetchApi<{ success: boolean; id: string }>(`/admin/landing-page/changelog/${id}`, { method: 'DELETE' }),
    },
};

// ============================================================================
// API Client - Search (global, used by relationship pickers)
// ============================================================================

export const searchApi = {
    search: (params: { q: string; type?: string; project_id?: string; limit?: number; include_archived?: boolean }) => {
        const clean: Record<string, string> = {};
        for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== null && v !== '') clean[k] = String(v);
        }
        return fetchApi<{ data: Array<{ type: string; id: string; display_id: string; title: string; project_id: string; project_name: string; status: string; url: string }>; meta: { q: string; limit: number; types: string[] } }>(`/search?${new URLSearchParams(clean).toString()}`);
    },
};

export const tuleapConfigApi = {
    list: async (params?: Record<string, string>) => {
        const query = params ? '?' + new URLSearchParams(params).toString() : '';
        return fetchApi<{ success: boolean; data: TuleapSyncConfig[] }>(`/tuleap-webhook/config${query}`);
    },

    status: async () =>
        fetchApi<{ success: boolean; data: TuleapStatus }>('/tuleap-webhook/status'),

    syncHistory: async (limit = 20) =>
        fetchApi<{ success: boolean; count: number; last_success_at: string | null; data: TuleapSyncHistoryItem[] }>(
            `/tuleap-webhook/sync-history?limit=${limit}`
        ),

    get: async (id: string) =>
        fetchApi<TuleapSyncConfig>(`/tuleap-webhook/config/${id}`),

    create: async (data: Partial<TuleapSyncConfig>) =>
        fetchApi<{ success: boolean; data: TuleapSyncConfig }>('/tuleap-webhook/config', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    update: async (id: string, data: Partial<TuleapSyncConfig>) =>
        fetchApi<{ success: boolean; data: TuleapSyncConfig }>(`/tuleap-webhook/config/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),

    delete: async (id: string) =>
        fetchApi<{ success: boolean; data: TuleapSyncConfig }>(`/tuleap-webhook/config/${id}`, {
            method: 'DELETE',
        }),

    testConnection: async (data: { tuleap_base_url?: string; tuleap_tracker_id: number; access_key?: string }) =>
        fetchApi<{ success: boolean; tracker: { id: number; name: string; item_name: string; fields: Array<{ field_id: number; name: string; label: string; type: string; values: Array<{ id: number; label: string }> }> } }>('/tuleap-webhook/config/test-connection', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    discover: async (trackerId: number) =>
        fetchApi<{ tracker_id: number; fields: Array<{ field_id: number; name: string; label: string; type: string; values: Array<{ id: number; label: string }> }>; suggested_mappings: Record<string, string> }>(`/tuleap-webhook/config/discover/${trackerId}`),
};

export interface Attachment {
    id: string;
    original_name: string;
    mime_type: string;
    size_bytes: number;
    created_at: string;
    uploaded_by_name?: string;
}

async function uploadFormData<T>(endpoint: string, form: FormData): Promise<T> {
    const url = `${API_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    let authToken: string | null = null;
    if (typeof window !== 'undefined') {
        const { supabase } = await import('../supabase');
        const { data: { session } } = await supabase.auth.getSession();
        authToken = session?.access_token || null;
    }
    const headers: Record<string, string> = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const response = await fetch(url, { method: 'POST', headers, body: form });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed (${response.status})`);
    }
    return response.json();
}

export const attachmentsApi = {
    list: (artifactType: string, artifactId: string) =>
        fetchApi<Attachment[]>(`/attachments/${artifactType}/${artifactId}`),

    upload: (artifactType: string, artifactId: string, file: File): Promise<Attachment> => {
        const form = new FormData();
        form.append('file', file);
        return uploadFormData<Attachment>(`/attachments/${artifactType}/${artifactId}`, form);
    },

    uploadStaged: (tempId: string, file: File): Promise<{ storagePath: string; originalName: string; mimeType: string; sizeBytes: number }> => {
        const form = new FormData();
        form.append('file', file);
        form.append('temp_id', tempId);
        return uploadFormData<{ storagePath: string; originalName: string; mimeType: string; sizeBytes: number }>('/attachments/staged', form);
    },

    deleteStaged: (storagePath: string) =>
        fetchApi<{ success: boolean }>('/attachments/staged', { method: 'DELETE', body: JSON.stringify({ storagePath }) }),

    getUrl: (attachmentId: string) =>
        fetchApi<{ url: string; originalName: string; mimeType: string; sizeBytes: number }>(`/attachments/file/${attachmentId}/url`),

    delete: (attachmentId: string) =>
        fetchApi<{ success: boolean }>(`/attachments/file/${attachmentId}`, { method: 'DELETE' }),
};
