/**
 * Phase 2: Governance Dashboard Types
 * TypeScript interfaces for governance API responses
 */

// =====================================================
// Enum Types
// =====================================================

export type ReadinessStatus = 'GREEN' | 'AMBER' | 'RED' | 'UNKNOWN';
export type RiskLevel = 'CRITICAL' | 'WARNING' | 'NORMAL';
export type BalanceStatus = 'OVER_TESTED' | 'BALANCED' | 'UNDER_TESTED' | 'NO_TASKS' | 'NO_TESTS';
export type HealthStatus = 'GREEN' | 'AMBER' | 'RED';

// =====================================================
// Release Readiness Types
// =====================================================

export interface ReleaseReadiness {
    project_id: string;
    project_name: string;
    project_status: string;
    latest_pass_rate_pct: string;
    latest_not_run_pct: string;
    latest_failed_count: number;
    latest_fail_rate_pct: string;
    days_since_latest_execution: number;
    total_test_cases: number;
    latest_tests_executed: number;
    latest_passed_count: number;
    latest_execution_date: string | null;
    readiness_status: ReadinessStatus;
    blocking_issues: string[];
    blocking_issue_count: number;
    recommendation: string;
    created_at: string;
    updated_at: string;
}

// =====================================================
// Quality Risk Types
// =====================================================

export interface QualityRisk {
    project_id: string;
    project_name: string;
    project_status: string;
    latest_pass_rate_pct: string;
    latest_not_run_pct: string;
    latest_failed_count: number;
    days_since_latest_execution: number | null;
    total_test_cases: number;
    recent_pass_rate: number;
    previous_pass_rate: number;
    pass_rate_change: number;
    recent_execution_days: number;
    risk_flags: string[];
    risk_flag_count: number;
    risk_level: RiskLevel;
}

export type RiskFlag =
    | 'LOW_PASS_RATE'
    | 'HIGH_NOT_RUN'
    | 'STALE_TESTS'
    | 'HIGH_FAILURE_COUNT'
    | 'DECLINING_TREND'
    | 'NO_TESTS';

export const RISK_FLAG_LABELS: Record<RiskFlag, string> = {
    LOW_PASS_RATE: 'Low Pass Rate',
    HIGH_NOT_RUN: 'High Not Run %',
    STALE_TESTS: 'Stale Tests',
    HIGH_FAILURE_COUNT: 'High Failures',
    DECLINING_TREND: 'Declining Trend',
    NO_TESTS: 'No Tests'
};

export const RISK_FLAG_DESCRIPTIONS: Record<RiskFlag, string> = {
    LOW_PASS_RATE: 'Pass rate below 80%',
    HIGH_NOT_RUN: 'More than 20% tests not executed',
    STALE_TESTS: 'Test results older than 14 days',
    HIGH_FAILURE_COUNT: 'More than 10 failing tests',
    DECLINING_TREND: 'Pass rate dropped >10% week-over-week',
    NO_TESTS: 'No tests defined for this project'
};

// =====================================================
// Workload Balance Types
// =====================================================

export interface WorkloadBalance {
    project_id: string;
    project_name: string;
    total_tasks: number;
    total_tests: number;
    tests_per_task_ratio: string | null;
    balance_status: BalanceStatus;
}

// =====================================================
// Project Health Types
// =====================================================

export interface ProjectHealth {
    project_id: string;
    project_name: string;
    project_status: string;
    readiness_status: ReadinessStatus;
    risk_level: RiskLevel;
    balance_status: BalanceStatus;
    overall_health_status: HealthStatus;
    action_items: string[];
    latest_pass_rate_pct: string;
    latest_failed_count: number;
    days_since_latest_execution: number | null;
    total_test_cases: number;
    total_tasks: number;
    total_tests: number;
    tests_per_task_ratio: string | null;
    latest_execution_date: string | null;
    blocking_issue_count: number;
    risk_flag_count: number;
    risk_flags: string[];
    pass_rate_change: number;
}

// =====================================================
// Dashboard Summary Types
// =====================================================

export interface DashboardSummary {
    total_projects: string;
    green_count: string;
    amber_count: string;
    red_count: string;
    ready_for_release: string;
    not_ready_for_release: string;
    critical_risk_count: string;
    warning_risk_count: string;
    normal_risk_count: string;
}

export interface TrendData {
    date: string;
    passRate: number;
    testsExecuted: number;
}

// =====================================================
// API Response Types
// =====================================================

export interface GovernanceApiResponse<T> {
    success: boolean;
    data: T;
    count?: number;
    error?: string;
    message?: string;
}

// =====================================================
// Color Mappings
// =====================================================

export const READINESS_COLORS: Record<ReadinessStatus, string> = {
    GREEN: 'bg-green-100 text-green-800 border-green-300',
    AMBER: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    RED: 'bg-red-100 text-red-800 border-red-300',
    UNKNOWN: 'bg-gray-100 text-gray-800 border-gray-300'
};

export const RISK_LEVEL_COLORS: Record<RiskLevel, string> = {
    CRITICAL: 'bg-red-100 text-red-800 border-red-300',
    WARNING: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    NORMAL: 'bg-green-100 text-green-800 border-green-300'
};

export const HEALTH_STATUS_COLORS: Record<HealthStatus, string> = {
    GREEN: 'bg-green-100 text-green-800 border-green-300',
    AMBER: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    RED: 'bg-red-100 text-red-800 border-red-300'
};

// =====================================================
// Badge Variants (for dark backgrounds)
// =====================================================

export const READINESS_BADGE_COLORS: Record<ReadinessStatus, string> = {
    GREEN: 'bg-green-500 text-white',
    AMBER: 'bg-yellow-500 text-white',
    RED: 'bg-red-500 text-white',
    UNKNOWN: 'bg-gray-500 text-white'
};

export const RISK_LEVEL_BADGE_COLORS: Record<RiskLevel, string> = {
    CRITICAL: 'bg-red-600 text-white',
    WARNING: 'bg-yellow-500 text-white',
    NORMAL: 'bg-green-500 text-white'
};

// =====================================================
// Helper Functions
// =====================================================

export function getReadinessStatusIcon(status: ReadinessStatus): string {
    switch (status) {
        case 'GREEN': return '✓';
        case 'AMBER': return '⚠';
        case 'RED': return '✗';
        case 'UNKNOWN': return '?';
    }
}

export function getRiskLevelIcon(level: RiskLevel): string {
    switch (level) {
        case 'CRITICAL': return '⚠';
        case 'WARNING': return '⚡';
        case 'NORMAL': return '✓';
    }
}

export function formatPassRate(passRate: string | number): string {
    const rate = typeof passRate === 'string' ? parseFloat(passRate) : passRate;
    return isNaN(rate) ? '0.0%' : `${rate.toFixed(1)}%`;
}

export function formatDaysAgo(days: number | null): string {
    if (days === null || days === undefined) return 'Never';
    if (days === 0) return 'Today';
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
}

export function formatDate(dateString: string | null): string {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}
