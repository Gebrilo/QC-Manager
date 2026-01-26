/**
 * Governance API Service
 * Phase 2: API calls for governance dashboard
 * Includes mock data fallbacks for development/demonstration
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
    BalanceStatus,
    TrendData
} from '../types/governance';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// =====================================================
// Mock Data Generators
// =====================================================

import { MOCK_PROJECTS as RAW_PROJECTS, MOCK_TASKS as RAW_TASKS } from '../data/mockData';

const MOCK_PROJECTS = RAW_PROJECTS.map(p => ({
    id: p.id,
    name: p.name,
    status: p.dynamic_status || 'Active'
}));

const generateMockSummary = (): DashboardSummary => ({
    total_projects: MOCK_PROJECTS.length.toString(),
    green_count: MOCK_PROJECTS.filter(p => !['At Risk', 'Delayed'].includes(p.status)).length.toString(),
    amber_count: MOCK_PROJECTS.filter(p => p.status === 'Delayed').length.toString(),
    red_count: MOCK_PROJECTS.filter(p => p.status === 'At Risk').length.toString(),
    ready_for_release: '2',
    not_ready_for_release: (MOCK_PROJECTS.length - 2).toString(),
    critical_risk_count: '1',
    warning_risk_count: '2',
    normal_risk_count: (MOCK_PROJECTS.length - 3).toString(),
});

const generateMockReadiness = (projectId?: string): ReleaseReadiness[] => {
    return MOCK_PROJECTS.filter(p => !projectId || p.id === projectId).map(p => {
        // Derive some realistic-looking data based on the project name/status
        const isRisk = p.status === 'At Risk';
        const isDelayed = p.status === 'Delayed';

        return {
            project_id: p.id,
            project_name: p.name,
            project_status: p.status,
            latest_pass_rate_pct: isRisk ? '65.5' : (isDelayed ? '82.0' : '98.5'),
            latest_not_run_pct: isDelayed ? '15.0' : '2.0',
            latest_failed_count: isRisk ? 12 : 1,
            latest_fail_rate_pct: isRisk ? '30.0' : '0.5',
            days_since_latest_execution: isDelayed ? 10 : 1,
            total_test_cases: 150,
            latest_tests_executed: isDelayed ? 100 : 148,
            latest_passed_count: isRisk ? 80 : 145,
            latest_execution_date: new Date().toISOString(),
            readiness_status: isRisk ? 'RED' : (isDelayed ? 'AMBER' : 'GREEN'),
            blocking_issues: isRisk ? ['Critical Auth Failure'] : [],
            blocking_issue_count: isRisk ? 1 : 0,
            recommendation: isRisk ? 'Do not release' : 'Ready for release',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }
    });
};

const generateMockRisks = (level?: RiskLevel): QualityRisk[] => {
    const risks = MOCK_PROJECTS.map(p => {
        const isRisk = p.status === 'At Risk';
        const isDelayed = p.status === 'Delayed';
        const riskLevel: RiskLevel = isRisk ? 'CRITICAL' : (isDelayed ? 'WARNING' : 'NORMAL');

        return {
            project_id: p.id,
            project_name: p.name,
            project_status: p.status,
            latest_pass_rate_pct: isRisk ? '65.5' : '95.0',
            latest_not_run_pct: isDelayed ? '15.0' : '0.0',
            latest_failed_count: isRisk ? 12 : 0,
            days_since_latest_execution: isDelayed ? 10 : 1,
            total_test_cases: 120,
            recent_pass_rate: isRisk ? 60 : 94,
            previous_pass_rate: 95,
            pass_rate_change: isRisk ? -35 : 1,
            recent_execution_days: 5,
            risk_flags: isRisk ? ['HIGH_FAILURE_COUNT', 'DECLINING_TREND'] : [],
            risk_flag_count: isRisk ? 2 : 0,
            risk_level: riskLevel,
        };
    });

    if (level) {
        return risks.filter(r => r.risk_level === level);
    }
    return risks.sort((a, b) => (a.risk_level === 'CRITICAL' ? -1 : 1));
};

const generateMockWorkload = (): WorkloadBalance[] => {
    return MOCK_PROJECTS.map(p => {
        // Calculate tasks from raw tasks
        const projectTasks = RAW_TASKS.filter(t => t.project_id === p.id);
        const taskCount = projectTasks.length;

        return {
            project_id: p.id,
            project_name: p.name,
            total_tasks: taskCount,
            total_tests: taskCount * 3, // Mock ratio
            tests_per_task_ratio: '3.0',
            balance_status: 'BALANCED' as BalanceStatus,
        };
    });
};

const generateMockProjectHealth = (status?: HealthStatus): ProjectHealth[] => {
    const health = MOCK_PROJECTS.map(p => {
        const isRisk = p.status === 'At Risk';
        const isDelayed = p.status === 'Delayed';

        const healthStatus: HealthStatus = isRisk ? 'RED' : (isDelayed ? 'AMBER' : 'GREEN');
        const readiness: ReadinessStatus = isRisk ? 'RED' : (isDelayed ? 'AMBER' : 'GREEN');
        const risk: RiskLevel = isRisk ? 'CRITICAL' : (isDelayed ? 'WARNING' : 'NORMAL');
        const balance: BalanceStatus = 'BALANCED';

        // Calculate tasks
        const projectTasks = RAW_TASKS.filter(t => t.project_id === p.id);

        return {
            project_id: p.id,
            project_name: p.name,
            project_status: p.status,
            readiness_status: readiness,
            risk_level: risk,
            balance_status: balance,
            overall_health_status: healthStatus,
            action_items: isRisk ? ['Fix critical bugs'] : [],
            latest_pass_rate_pct: isRisk ? '65.0' : '98.0',
            latest_failed_count: isRisk ? 5 : 0,
            days_since_latest_execution: isDelayed ? 5 : 0,
            total_test_cases: 50,
            total_tasks: projectTasks.length,
            total_tests: 150,
            tests_per_task_ratio: '3.0',
            latest_execution_date: new Date().toISOString(),
            blocking_issue_count: isRisk ? 2 : 0,
            risk_flag_count: isRisk ? 1 : 0,
            risk_flags: isRisk ? ['HIGH_FAILURE_COUNT'] : [],
            pass_rate_change: 0,
        };
    });

    if (status) {
        return health.filter(h => h.overall_health_status === status);
    }
    return health;
};

// =====================================================
// Dashboard Summary
// =====================================================

export async function getDashboardSummary(): Promise<DashboardSummary> {
    try {
        const response = await axios.get<GovernanceApiResponse<DashboardSummary>>(
            `${API_BASE}/governance/dashboard-summary`
        );
        return response.data.data;
    } catch (error) {
        console.warn('Dashboard API failed, using mock data', error);
        return generateMockSummary();
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
        console.warn('Readiness API failed, using mock data', error);
        let data = generateMockReadiness(projectId);
        if (status) {
            data = data.filter(r => r.readiness_status === status);
        }
        return data;
    }
}

export async function getProjectReleaseReadiness(projectId: string): Promise<ReleaseReadiness> {
    try {
        const response = await axios.get<GovernanceApiResponse<ReleaseReadiness>>(
            `${API_BASE}/governance/release-readiness/${projectId}`
        );
        return response.data.data;
    } catch (error) {
        console.warn('Project Readiness API failed, using mock data', error);
        return generateMockReadiness(projectId)[0];
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
        console.warn('Risks API failed, using mock data', error);
        return generateMockRisks(riskLevel);
    }
}

export async function getProjectQualityRisk(projectId: string): Promise<QualityRisk> {
    try {
        const response = await axios.get<GovernanceApiResponse<QualityRisk>>(
            `${API_BASE}/governance/quality-risks/${projectId}`
        );
        return response.data.data;
    } catch (error) {
        console.warn('Project Risk API failed, using mock data', error);
        const risks = generateMockRisks();
        return risks.find(r => r.project_id === projectId) || risks[0];
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
        console.warn('Workload API failed, using mock data', error);
        return generateMockWorkload();
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
        console.warn('Project Health API failed, using mock data', error);
        return generateMockProjectHealth(healthStatus);
    }
}

export async function getProjectHealthSummary(projectId: string): Promise<ProjectHealth> {
    try {
        const response = await axios.get<GovernanceApiResponse<ProjectHealth>>(
            `${API_BASE}/governance/project-health/${projectId}`
        );
        return response.data.data;
    } catch (error) {
        console.warn('Project Health Summary API failed, using mock data', error);
        const health = generateMockProjectHealth();
        return health.find(h => h.project_id === projectId) || health[0];
    }
}

// =====================================================
// Trend Analysis
// =====================================================

const generateMockTrend = (): TrendData[] => {
    const data: TrendData[] = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);

        // Random pass rate between 70 and 100 with some trend
        const baseRate = 85 + Math.sin(i / 5) * 10;
        const randomVar = (Math.random() - 0.5) * 5;

        data.push({
            date: d.toISOString().split('T')[0],
            passRate: Math.min(100, Math.max(0, parseFloat((baseRate + randomVar).toFixed(1)))),
            testsExecuted: Math.floor(50 + Math.random() * 100)
        });
    }
    return data;
};

export async function getExecutionTrend(projectId?: string): Promise<TrendData[]> {
    try {
        const params = new URLSearchParams();
        if (projectId) params.append('project_id', projectId);

        const url = `${API_BASE}/governance/execution-trend${params.toString() ? '?' + params.toString() : ''}`;
        const response = await axios.get<GovernanceApiResponse<TrendData[]>>(url);
        return response.data.data;
    } catch (error) {
        console.warn('Trend API failed, using mock data', error);
        return generateMockTrend();
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
            console.warn('Get Gates Failed (using default mock)', e);
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
    }
};

export default governanceApi;
