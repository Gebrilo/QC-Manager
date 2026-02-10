const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Generic API fetch wrapper
 */
export async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

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
// Health Check
// ============================================================================

export const healthApi = {
    check: () => fetchApi<{ status: string; timestamp: string }>('/health'),
};
