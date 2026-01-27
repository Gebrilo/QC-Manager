export interface Project {
    id: string; // UUID
    project_id: string; // Display ID e.g. PRJ-001
    name: string;
    description?: string;
    priority: 'High' | 'Medium' | 'Low';
    total_weight: number;
    start_date?: string;
    target_date?: string;
    status: 'active' | 'archived' | 'deleted';
    // Aggregated fields from View
    tasks_total_count?: number;
    tasks_done_count?: number;
    tasks_todo_count?: number; // Added from view
    task_hrs_est?: number;
    task_hrs_actual?: number;
    dynamic_status?: string;
    overall_completion_pct?: number; // Added from view
}

export interface Resource {
    id: string;
    name: string;
    role?: string;
    weekly_capacity_hrs: number;
    email?: string;
    department?: string;
    status: 'active' | 'inactive';
}

export interface Task {
    id: string; // UUID
    task_id: string; // Display ID e.g. TSK-001
    project_id: string;
    task_name: string;
    description?: string;
    status: 'Backlog' | 'In Progress' | 'Done' | 'Cancelled';
    priority?: 'High' | 'Medium' | 'Low'; // Added for dashboard filtering

    resource1_uuid?: string;
    resource2_uuid?: string;

    estimate_days?: number;
    r1_estimate_hrs?: number;
    r1_actual_hrs?: number;
    r2_estimate_hrs?: number;
    r2_actual_hrs?: number;

    deadline?: string;
    completed_date?: string;
    tags?: string[];
    notes?: string;

    // Joined fields from API View
    project_name?: string;
    project_display_id?: string;
    resource1_name?: string;
    resource2_name?: string;
    estimate_hrs?: number;
    total_est_hrs?: number;
    total_actual_hrs?: number;
    overall_completion_pct?: number;
}

// Test Results Management Types (Phase 1 - Simplified)

export type ExecutionStatus = 'passed' | 'failed' | 'not_run' | 'blocked' | 'rejected';

export interface TestResult {
    id: string; // UUID
    test_case_id: string; // From Excel: TC-001, TEST-LOGIN, etc.
    test_case_title?: string;
    project_id: string;
    status: ExecutionStatus;
    executed_at: string; // Date
    notes?: string;
    tester_name?: string;
    upload_batch_id?: string;
    uploaded_by?: string;
    uploaded_at?: string;
    created_at: string;
    updated_at: string;
    // Joined fields
    project_name?: string;
    days_since_execution?: number;
}

export interface TestCaseHistory {
    test_case_id: string;
    project_id: string;
    project_name?: string;
    test_case_title?: string;
    last_executed_at: string;
    days_since_last_run: number;
    total_executions: number;
    total_passed: number;
    total_failed: number;
    total_not_run: number;
    total_blocked: number;
    total_rejected: number;
    overall_pass_rate_pct: number;
    latest_status: ExecutionStatus;
}

export interface ProjectQualityMetrics {
    project_id: string;
    project_name: string;
    project_status: string;
    latest_execution_date?: string;
    days_since_latest_execution?: number;
    total_test_cases: number;
    latest_tests_executed: number;
    latest_passed_count: number;
    latest_failed_count: number;
    latest_not_run_count: number;
    latest_blocked_count: number;
    latest_rejected_count: number;
    latest_pass_rate_pct: number;
    latest_not_run_pct: number;
    latest_fail_rate_pct: number;
    tasks_with_tests: number;
    total_tasks: number;
    test_coverage_pct: number;
}

export interface ExecutionTrend {
    project_id: string;
    project_name: string;
    execution_date: string;
    tests_executed: number;
    passed_count: number;
    failed_count: number;
    not_run_count: number;
    blocked_count: number;
    rejected_count: number;
    daily_pass_rate_pct: number;
}

export interface UploadBatch {
    upload_batch_id: string;
    project_id: string;
    project_name?: string;
    uploaded_at: string;
    uploaded_by?: string;
    uploaded_by_name?: string;
    results_count: number;
    passed_count: number;
    failed_count: number;
    earliest_execution_date: string;
    latest_execution_date: string;
}

export interface TestResultsUploadResponse {
    upload_batch_id: string;
    summary: {
        total: number;
        imported: number;
        updated: number;
        errors: number;
        success_rate: string;
    };
    details: {
        success: Array<{ row: number; test_case_id: string; status: string; executed_at: string }>;
        updated: Array<{ row: number; test_case_id: string; status: string; executed_at: string }>;
        errors: Array<{ row: number; test_case_id: string; error: string }>;
    };
}

// Test Case Management Types
export type TestCategory = 'functional' | 'integration' | 'regression' | 'smoke' | 'performance' | 'security' | 'usability' | 'e2e' | 'unit' | 'other';
export type TestCaseStatus = 'draft' | 'active' | 'deprecated' | 'archived';

export interface TestCase {
    id: string;
    test_case_id: string;
    title: string;
    description?: string;
    category: TestCategory;
    status: TestCaseStatus;
    priority: 'High' | 'Medium' | 'Low';
    project_id?: string;
    project_name?: string;
    steps?: string;
    expected_result?: string;
    preconditions?: string;
    tags?: string[];
    created_by?: string;
    created_at: string;
    updated_at: string;
    latest_status?: string;
    latest_execution_date?: string;
    days_since_last_run?: number;
}
