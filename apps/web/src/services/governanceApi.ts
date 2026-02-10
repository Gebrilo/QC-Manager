/**
 * Governance API Service
 * Phase 2: API calls for governance dashboard
 */

import axios from 'axios';
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
    TaskHistory
} from '../types/governance';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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
        const response = await axios.get<GovernanceApiResponse<DashboardSummary>>(
            `${API_BASE}/governance/dashboard-summary`
        );
        return response.data.data;
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

        const url = `${API_BASE}/governance/release-readiness${params.toString() ? '?' + params.toString() : ''}`;
        const response = await axios.get<GovernanceApiResponse<ReleaseReadiness[]>>(url);
        return response.data.data;
    } catch (error) {
        console.warn('Readiness API failed', error);
        return [];
    }
}

export async function getProjectReleaseReadiness(projectId: string): Promise<ReleaseReadiness | null> {
    try {
        const response = await axios.get<GovernanceApiResponse<ReleaseReadiness>>(
            `${API_BASE}/governance/release-readiness/${projectId}`
        );
        return response.data.data;
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

        const url = `${API_BASE}/governance/quality-risks${params.toString() ? '?' + params.toString() : ''}`;
        const response = await axios.get<GovernanceApiResponse<QualityRisk[]>>(url);
        return response.data.data;
    } catch (error) {
        console.warn('Risks API failed', error);
        return [];
    }
}

export async function getProjectQualityRisk(projectId: string): Promise<QualityRisk | null> {
    try {
        const response = await axios.get<GovernanceApiResponse<QualityRisk>>(
            `${API_BASE}/governance/quality-risks/${projectId}`
        );
        return response.data.data;
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
        const response = await axios.get<GovernanceApiResponse<WorkloadBalance[]>>(
            `${API_BASE}/governance/workload-balance`
        );
        return response.data.data;
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

        const url = `${API_BASE}/governance/project-health${params.toString() ? '?' + params.toString() : ''}`;
        const response = await axios.get<GovernanceApiResponse<ProjectHealth[]>>(url);
        return response.data.data;
    } catch (error) {
        console.warn('Project Health API failed', error);
        return [];
    }
}

export async function getProjectHealthSummary(projectId: string): Promise<ProjectHealth | null> {
    try {
        const response = await axios.get<GovernanceApiResponse<ProjectHealth>>(
            `${API_BASE}/governance/project-health/${projectId}`
        );
        return response.data.data;
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

        const url = `${API_BASE}/governance/execution-trend${params.toString() ? '?' + params.toString() : ''}`;
        const response = await axios.get<GovernanceApiResponse<TrendData[]>>(url);
        return response.data.data;
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

        const url = `${API_BASE}/bugs/summary${params.toString() ? '?' + params.toString() : ''}`;
        const response = await axios.get<GovernanceApiResponse<BugSummaryData>>(url);
        return response.data.data;
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

        const url = `${API_BASE}/bugs?${params.toString()}`;
        const response = await axios.get(url);
        return {
            bugs: response.data.data,
            total: response.data.total
        };
    } catch (error) {
        console.warn('Bugs API failed', error);
        return { bugs: [], total: 0 };
    }
}

export async function getBugsByProject(projectId: string): Promise<Bug[]> {
    try {
        const response = await axios.get<GovernanceApiResponse<Bug[]>>(
            `${API_BASE}/bugs/by-project/${projectId}`
        );
        return response.data.data;
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
        const url = projectId
            ? `${API_BASE}/tuleap-webhook/task-history/${projectId}`
            : `${API_BASE}/tuleap-webhook/task-history`;
        const response = await axios.get<GovernanceApiResponse<TaskHistory[]>>(url);
        return response.data.data;
    } catch (error) {
        console.warn('Task History API failed', error);
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
            const res = await axios.get<GovernanceApiResponse<any>>(`${API_BASE}/governance/gates/${projectId}`);
            return res.data.data;
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
        const res = await axios.post<GovernanceApiResponse<any>>(`${API_BASE}/governance/gates`, data);
        return res.data.data;
    },

    // Approvals
    getApprovalHistory: async (projectId: string) => {
        try {
            const res = await axios.get<GovernanceApiResponse<any[]>>(`${API_BASE}/governance/approvals/${projectId}`);
            return res.data.data;
        } catch (e) {
            return [];
        }
    },
    submitApproval: async (data: any) => {
        const res = await axios.post<GovernanceApiResponse<any>>(`${API_BASE}/governance/approvals`, data);
        return res.data.data;
    },

    // Bug Summary (Tuleap Integration)
    getBugSummary,
    getBugs,
    getBugsByProject,

    // Task History (Tuleap Integration)
    getTaskHistory
};

export default governanceApi;
