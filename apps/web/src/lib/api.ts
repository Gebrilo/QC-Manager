const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Generic API fetch wrapper
 */
export async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    // Get auth token if available
    let authToken: string | null = null;
    if (typeof window !== 'undefined') {
        authToken = localStorage.getItem('auth_token');
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

        // Handle Zod validation errors with details
        if (errorData.details && Array.isArray(errorData.details)) {
            const validationMessages = errorData.details.map((d: any) =>
                `${d.path?.join('.') || 'Field'}: ${d.message}`
            ).join(', ');
            throw new Error(`${errorData.error || 'Validation Error'}: ${validationMessages}`);
        }

        throw new Error(errorData.error || errorData.message || `API Error: ${response.statusText}`);
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
    quests: JourneyQuest[];
    progress?: ChapterProgress;
}

export interface Journey {
    id: string;
    slug: string;
    title: string;
    description?: string;
    is_active: boolean;
    auto_assign_on_activation: boolean;
    sort_order: number;
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
    assigned_at: string;
    started_at?: string;
    completed_at?: string;
    status: 'assigned' | 'in_progress' | 'completed';
    progress: JourneyProgressSummary;
}

export interface JourneyWithProgress extends AssignedJourney {
    chapters: JourneyChapter[];
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
};
