/**
 * Governance API Service
 * Phase 2: API calls for governance dashboard
 */

import { fetchApi } from '../lib/api';
import type {
    ReleaseReadiness,
    QualityRisk,
    WorkloadBalance,
    ProjectHealth,
    DashboardSummary,
    GovernanceApiResponse,
    ReadinessStatus,
    RiskLevel,
    HealthStatus,
    TrendData,
    BugSummaryData,
    Bug,
    TaskHistory,
    ExecutionProgress,
    BlockedModuleAnalysis,
    QualityMetrics
} from '../types/governance';

// =====================================================
// Dashboard Summary
// =====================================================

const DEFAULT_SUMMARY: DashboardSummary = {
    total_projects: '0',
    green_count: '0',
    amber_count: '0',
    red_count: '0',
    ready_for_release: '0',
    not_ready_for_release: '0',
    critical_risk_count: '0',
    warning_risk_count: '0',
    normal_risk_count: '0',
};

export async function getDashboardSummary(): Promise<DashboardSummary> {
    try {
        const result = await fetchApi<GovernanceApiResponse<DashboardSummary>>(
            '/governance/dashboard-summary'
        );
        return result.data;
    } catch (error) {
        console.warn('Dashboard API failed', error);
        return DEFAULT_SUMMARY;
    }
}

// =====================================================
// Release Readiness
// =====================================================

export async function getReleaseReadiness(
    projectId?: string,
    status?: ReadinessStatus
): Promise<ReleaseReadiness[]> {
    try {
        const params = new URLSearchParams();
        if (projectId) params.append('project_id', projectId);
        if (status) params.append('status', status);
        const qs = params.toString();
        const result = await fetchApi<GovernanceApiResponse<ReleaseReadiness[]>>(
            `/governance/release-readiness${qs ? '?' + qs : ''}`
        );
        return result.data;
    } catch (error) {
        console.warn('Readiness API failed', error);
        return [];
    }
}

export async function getProjectReleaseReadiness(projectId: string): Promise<ReleaseReadiness | null> {
    try {
        const result = await fetchApi<GovernanceApiResponse<ReleaseReadiness>>(
            `/governance/release-readiness/${projectId}`
        );
        return result.data;
    } catch (error) {
        console.warn('Project Readiness API failed', error);
        return null;
    }
}

// =====================================================
// Quality Risks
// =====================================================

export async function getQualityRisks(riskLevel?: RiskLevel): Promise<QualityRisk[]> {
    try {
        const params = new URLSearchParams();
        if (riskLevel) params.append('risk_level', riskLevel);
        const qs = params.toString();
        const result = await fetchApi<GovernanceApiResponse<QualityRisk[]>>(
            `/governance/quality-risks${qs ? '?' + qs : ''}`
        );
        return result.data;
    } catch (error) {
        console.warn('Risks API failed', error);
        return [];
    }
}

export async function getProjectQualityRisk(projectId: string): Promise<QualityRisk | null> {
    try {
        const result = await fetchApi<GovernanceApiResponse<QualityRisk>>(
            `/governance/quality-risks/${projectId}`
        );
        return result.data;
    } catch (error) {
        console.warn('Project Risk API failed', error);
        return null;
    }
}

// =====================================================
// Workload Balance
// =====================================================

export async function getWorkloadBalance(): Promise<WorkloadBalance[]> {
    try {
        const result = await fetchApi<GovernanceApiResponse<WorkloadBalance[]>>(
            '/governance/workload-balance'
        );
        return result.data;
    } catch (error) {
        console.warn('Workload API failed', error);
        return [];
    }
}

// =====================================================
// Project Health
// =====================================================

export async function getProjectHealth(healthStatus?: HealthStatus): Promise<ProjectHealth[]> {
    try {
        const params = new URLSearchParams();
        if (healthStatus) params.append('health_status', healthStatus);
        const qs = params.toString();
        const result = await fetchApi<GovernanceApiResponse<ProjectHealth[]>>(
            `/governance/project-health${qs ? '?' + qs : ''}`
        );
        return result.data;
    } catch (error) {
        console.warn('Project Health API failed', error);
        return [];
    }
}

export async function getProjectHealthSummary(projectId: string): Promise<ProjectHealth | null> {
    try {
        const result = await fetchApi<GovernanceApiResponse<ProjectHealth>>(
            `/governance/project-health/${projectId}`
        );
        return result.data;
    } catch (error) {
        console.warn('Project Health Summary API failed', error);
        return null;
    }
}

// =====================================================
// Trend Analysis
// =====================================================

export async function getExecutionTrend(projectId?: string): Promise<TrendData[]> {
    try {
        const params = new URLSearchParams();
        if (projectId) params.append('project_id', projectId);
        const qs = params.toString();
        const result = await fetchApi<GovernanceApiResponse<TrendData[]>>(
            `/governance/execution-trend${qs ? '?' + qs : ''}`
        );
        return result.data;
    } catch (error) {
        console.warn('Trend API failed', error);
        return [];
    }
}

// =====================================================
// Bug Summary (Tuleap Integration)
// =====================================================

export async function getBugSummary(projectId?: string): Promise<BugSummaryData> {
    try {
        const params = new URLSearchParams();
        if (projectId) params.append('project_id', projectId);
        const qs = params.toString();
        const result = await fetchApi<GovernanceApiResponse<BugSummaryData>>(
            `/bugs/summary${qs ? '?' + qs : ''}`
        );
        return result.data;
    } catch (error) {
        console.warn('Bug Summary API failed', error);
        return {
            totals: {
                total_bugs: 0,
                open_bugs: 0,
                closed_bugs: 0,
                bugs_from_testing: 0,
                standalone_bugs: 0
            },
            by_severity: {
                critical: 0,
                high: 0,
                medium: 0,
                low: 0
            },
            by_source: {
                test_case: 0,
                exploratory: 0
            },
            by_project: [],
            recent_bugs: []
        };
    }
}

export async function getBugs(
    projectId?: string,
    status?: string,
    severity?: string,
    limit = 50,
    offset = 0
): Promise<{ bugs: Bug[]; total: number }> {
    try {
        const params = new URLSearchParams();
        if (projectId) params.append('project_id', projectId);
        if (status) params.append('status', status);
        if (severity) params.append('severity', severity);
        params.append('limit', limit.toString());
        params.append('offset', offset.toString());
        const result = await fetchApi<{ success: boolean; data: Bug[]; total: number }>(
            `/bugs?${params.toString()}`
        );
        return {
            bugs: result.data,
            total: result.total
        };
    } catch (error) {
        console.warn('Bugs API failed', error);
        return { bugs: [], total: 0 };
    }
}

export async function getBugsByProject(projectId: string): Promise<Bug[]> {
    if (!projectId || projectId === 'undefined') return [];
    try {
        const result = await fetchApi<GovernanceApiResponse<Bug[]>>(
            `/bugs/by-project/${projectId}`
        );
        return result.data;
    } catch (error) {
        console.warn('Project Bugs API failed', error);
        return [];
    }
}

// =====================================================
// Task History (Tuleap Integration)
// =====================================================

export async function getTaskHistory(projectId?: string): Promise<TaskHistory[]> {
    try {
        const endpoint = projectId
            ? `/tuleap-webhook/task-history/${projectId}`
            : '/tuleap-webhook/task-history';
        const result = await fetchApi<GovernanceApiResponse<TaskHistory[]>>(endpoint);
        return result.data;
    } catch (error) {
        console.warn('Task History API failed', error);
        return [];
    }
}

// =====================================================
// Quality Metrics (new views from migration 017)
// =====================================================

export async function getQualityMetrics(projectId?: string): Promise<QualityMetrics[]> {
    try {
        const params = new URLSearchParams();
        if (projectId) params.append('project_id', projectId);
        const qs = params.toString();
        const result = await fetchApi<GovernanceApiResponse<QualityMetrics[]>>(
            `/governance/quality-metrics${qs ? '?' + qs : ''}`
        );
        return result.data;
    } catch (error) {
        console.warn('Quality Metrics API failed', error);
        return [];
    }
}

export async function getBlockedAnalysis(projectId?: string): Promise<BlockedModuleAnalysis[]> {
    try {
        const params = new URLSearchParams();
        if (projectId) params.append('project_id', projectId);
        const qs = params.toString();
        const result = await fetchApi<GovernanceApiResponse<BlockedModuleAnalysis[]>>(
            `/governance/blocked-analysis${qs ? '?' + qs : ''}`
        );
        return result.data;
    } catch (error) {
        console.warn('Blocked Analysis API failed', error);
        return [];
    }
}

export async function getExecutionProgress(projectId?: string): Promise<ExecutionProgress[]> {
    try {
        const params = new URLSearchParams();
        if (projectId) params.append('project_id', projectId);
        const qs = params.toString();
        const result = await fetchApi<GovernanceApiResponse<ExecutionProgress[]>>(
            `/governance/execution-progress${qs ? '?' + qs : ''}`
        );
        return result.data;
    } catch (error) {
        console.warn('Execution Progress API failed', error);
        return [];
    }
}

// =====================================================
// Combined API Service Object
// =====================================================

export const governanceApi = {
    // Dashboard
    getDashboardSummary,

    // Release Readiness
    getReleaseReadiness,
    getProjectReleaseReadiness,

    // Quality Risks
    getQualityRisks,
    getProjectQualityRisk,

    // Workload Balance
    getWorkloadBalance,

    // Project Health
    getProjectHealth,
    getProjectHealthSummary,
    getExecutionTrend,

    // Quality Gates
    getProjectGates: async (projectId: string) => {
        try {
            const res = await fetchApi<GovernanceApiResponse<any>>(`/governance/gates/${projectId}`);
            return res.data;
        } catch (e) {
            console.warn('Get Gates Failed', e);
            return {
                project_id: projectId,
                min_pass_rate: 95.0,
                max_critical_defects: 0,
                min_test_coverage: 80.0,
                is_default: true
            };
        }
    },
    saveProjectGates: async (data: any) => {
        const res = await fetchApi<GovernanceApiResponse<any>>('/governance/gates', {
            method: 'POST',
            body: JSON.stringify(data),
        });
        return res.data;
    },

    // Approvals
    getApprovalHistory: async (projectId: string) => {
        try {
            const res = await fetchApi<GovernanceApiResponse<any[]>>(`/governance/approvals/${projectId}`);
            return res.data;
        } catch (e) {
            return [];
        }
    },
    submitApproval: async (data: any) => {
        const res = await fetchApi<GovernanceApiResponse<any>>('/governance/approvals', {
            method: 'POST',
            body: JSON.stringify(data),
        });
        return res.data;
    },

    // Bug Summary (Tuleap Integration)
    getBugSummary,
    getBugs,
    getBugsByProject,

    // Task History (Tuleap Integration)
    getTaskHistory,

    // Quality Metrics (migration 017)
    getQualityMetrics,
    getBlockedAnalysis,
    getExecutionProgress,
};

export default governanceApi;
