'use client';

import { useState, useEffect } from 'react';
import {
    getReleaseReadiness,
    getExecutionTrend,
    getBugSummary,
    getProjectHealth,
    getTestCoverage,
} from '@/services/governanceApi';
import { fetchApi } from '@/lib/api';
import type { ReportDefinition, ReportKpi, ChartBar, ReportRow, ReportStatus } from './reportTypes';

type ReportOverride = Pick<ReportDefinition, 'kpis' | 'chart' | 'rows' | 'summary' | 'summaryTone'> & {
    gauge?: { value: number; label: string; caption: string };
};

function toStatus(pct: number): ReportStatus {
    if (pct >= 85) return 'complete';
    if (pct >= 70) return 'ontrack';
    if (pct >= 50) return 'inprogress';
    return 'atrisk';
}

function readinessToStatus(s: string): ReportStatus {
    if (s === 'GREEN') return 'complete';
    if (s === 'AMBER') return 'inprogress';
    if (s === 'RED') return 'atrisk';
    return 'ontrack';
}

function p(v: string | number | null | undefined): number {
    const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
    return isNaN(n) ? 0 : Math.round(n);
}

// ─── Release Readiness ────────────────────────────────────────────────────────

async function fetchReadiness(): Promise<ReportOverride> {
    const data = await getReleaseReadiness();
    if (!data.length) throw new Error('no data');

    const avgPass = Math.round(data.reduce((s, d) => s + p(d.latest_pass_rate_pct), 0) / data.length);
    const totalBlockers = data.reduce((s, d) => s + d.blocking_issue_count, 0);
    const blocked = data.filter(d => d.readiness_status === 'RED').length;

    const bars: ChartBar[] = data.slice(0, 8).map(d => ({
        label: d.project_name.substring(0, 6).toUpperCase(),
        value: p(d.latest_pass_rate_pct),
        status: readinessToStatus(d.readiness_status),
    }));

    const rows: ReportRow[] = data.map(d => ({
        c: [d.project_name],
        status: readinessToStatus(d.readiness_status),
        rate: p(d.latest_pass_rate_pct),
        defects: d.blocking_issue_count,
        rec: d.recommendation || (d.readiness_status === 'GREEN' ? 'Approve release' : d.readiness_status === 'AMBER' ? 'Conditional' : 'Block release'),
    }));

    const tone: ReportStatus = blocked > 0 ? 'atrisk' : avgPass >= 85 ? 'complete' : 'inprogress';

    return {
        kpis: [
            { label: 'Projects assessed', value: String(data.length), sub: `${blocked} blocked` },
            { label: 'Avg pass rate', value: `${avgPass}%`, sub: 'vs 85% gate' },
            { label: 'Open blockers', value: String(totalBlockers), sub: `across ${blocked} project${blocked !== 1 ? 's' : ''}` },
        ],
        chart: { title: 'Pass rate by project', unit: '%', bars },
        rows,
        summary: `${data.length} project${data.length !== 1 ? 's' : ''} assessed. Aggregate pass rate is ${avgPass}% across all projects. ${totalBlockers > 0 ? `${totalBlockers} blocking issue${totalBlockers !== 1 ? 's' : ''} across ${blocked} project${blocked !== 1 ? 's' : ''}.` : 'No blocking issues detected.'}`,
        summaryTone: tone,
        gauge: { value: avgPass, label: 'Avg pass rate', caption: `${avgPass >= 85 ? 'Above' : 'Below'} 85% gate` },
    };
}

// ─── Weekly Quality Health ────────────────────────────────────────────────────

async function fetchQualityHealth(dateFrom?: string, dateTo?: string): Promise<ReportOverride> {
    const [trend, bugs] = await Promise.all([getExecutionTrend(undefined, dateFrom, dateTo), getBugSummary()]);

    const last7 = trend.slice(-7);
    const totalExecs = last7.reduce((s, d) => s + d.totalTests, 0);
    const passedExecs = last7.reduce((s, d) => s + d.passedCount, 0);
    const passRate = totalExecs > 0 ? Math.round((passedExecs / totalExecs) * 100) : 0;
    const criticalDefects = bugs.by_severity.critical;

    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const bars: ChartBar[] = last7.map(d => ({
        label: dayLabels[new Date(d.date).getDay()],
        value: d.totalTests,
        status: d.totalTests >= 20 ? 'complete' : d.totalTests > 0 ? 'ontrack' : 'inprogress',
    }));

    const tone: ReportStatus = criticalDefects > 5 ? 'atrisk' : passRate >= 85 ? 'ontrack' : 'inprogress';

    return {
        kpis: [
            { label: 'Test executions', value: String(totalExecs), sub: 'this week' },
            { label: 'Pass rate', value: `${passRate}%`, sub: 'rolling 7-day' },
            { label: 'Critical defects', value: String(criticalDefects), sub: 'open & unresolved' },
        ],
        chart: { title: 'Executions per day', unit: '', bars },
        rows: [],
        summary: `${totalExecs} test${totalExecs !== 1 ? 's' : ''} executed this week with a ${passRate}% pass rate. ${criticalDefects} critical defect${criticalDefects !== 1 ? 's' : ''} currently open.`,
        summaryTone: tone,
        gauge: { value: passRate, label: 'Pass rate', caption: 'rolling 7-day' },
    };
}

// ─── Test Coverage & Workload ─────────────────────────────────────────────────

async function fetchCoverage(): Promise<ReportOverride> {
    const coverage = await getTestCoverage();
    const tasks = coverage.task_coverage;
    if (!tasks.length) throw new Error('no data');

    const totalTasks = tasks.reduce((s, p) => s + p.total_tasks, 0);
    const coveredTasks = tasks.reduce((s, p) => s + p.tasks_with_active_test_cases, 0);
    const avgCov = totalTasks > 0 ? Math.round((coveredTasks / totalTasks) * 100) : 0;
    const gaps = totalTasks - coveredTasks;

    const bars: ChartBar[] = tasks.slice(0, 6).map(p => {
        const cov = Math.round(p.task_test_coverage_pct);
        return { label: p.project_name.substring(0, 8), value: cov, status: toStatus(cov) };
    });

    const rows: ReportRow[] = tasks.map(p => {
        const cov = Math.round(p.task_test_coverage_pct);
        const gap = p.total_tasks - p.tasks_with_active_test_cases;
        return {
            c: [p.project_name],
            status: toStatus(cov),
            rate: cov,
            defects: gap,
            rec: cov >= 80 ? 'Full coverage' : gap > 20 ? 'Expand tests' : 'Improve coverage',
        };
    });

    const tone: ReportStatus = avgCov >= 80 ? 'complete' : avgCov >= 60 ? 'ontrack' : 'inprogress';

    return {
        kpis: [
            { label: 'Total tasks', value: String(totalTasks), sub: `${tasks.length} project${tasks.length !== 1 ? 's' : ''}` },
            { label: 'Coverage', value: `${avgCov}%`, sub: `${gaps} gap${gaps !== 1 ? 's' : ''}` },
            { label: 'Active projects', value: String(tasks.length), sub: 'with tasks' },
        ],
        chart: { title: 'Coverage by project', unit: '%', bars },
        rows,
        summary: `Overall task test coverage is ${avgCov}% with ${gaps} untested task${gaps !== 1 ? 's' : ''} across ${tasks.length} project${tasks.length !== 1 ? 's' : ''}.`,
        summaryTone: tone,
        gauge: { value: avgCov, label: 'Coverage', caption: `${gaps} gap${gaps !== 1 ? 's' : ''} remaining` },
    };
}

// ─── Project Status ───────────────────────────────────────────────────────────

async function fetchProjectStatus(): Promise<ReportOverride> {
    const data = await getProjectHealth();
    if (!data.length) throw new Error('no data');

    const atRisk = data.filter(d => d.overall_health_status === 'RED').length;
    const avgPass = Math.round(data.reduce((s, d) => s + p(d.latest_pass_rate_pct), 0) / data.length);
    const totalTasks = data.reduce((s, d) => s + d.total_tasks, 0);

    function healthToStatus(s: string): ReportStatus {
        if (s === 'GREEN') return 'complete';
        if (s === 'AMBER') return 'inprogress';
        return 'atrisk';
    }

    const bars: ChartBar[] = data.slice(0, 8).map(d => ({
        label: d.project_name.substring(0, 6).toUpperCase(),
        value: p(d.latest_pass_rate_pct),
        status: healthToStatus(d.overall_health_status),
    }));

    const rows: ReportRow[] = data.map(d => ({
        c: [d.project_name],
        status: healthToStatus(d.overall_health_status),
        rate: p(d.latest_pass_rate_pct),
        defects: d.latest_failed_count,
        rec: d.total_tasks > 0 ? `${d.total_tasks} tasks` : 'No tasks',
    }));

    const tone: ReportStatus = atRisk > 0 ? 'inprogress' : avgPass >= 85 ? 'complete' : 'ontrack';

    return {
        kpis: [
            { label: 'Active projects', value: String(data.length), sub: `${atRisk} at risk` },
            { label: 'Avg pass rate', value: `${avgPass}%`, sub: 'all projects' },
            { label: 'Total tasks', value: String(totalTasks), sub: 'across projects' },
        ],
        chart: { title: 'Pass rate by project', unit: '%', bars },
        rows,
        summary: `${data.length} active project${data.length !== 1 ? 's' : ''}. Average pass rate is ${avgPass}%. ${atRisk > 0 ? `${atRisk} project${atRisk !== 1 ? 's are' : ' is'} at risk.` : 'All projects on track.'}`,
        summaryTone: tone,
        gauge: { value: avgPass, label: 'Avg pass rate', caption: `across ${data.length} projects` },
    };
}

// ─── Bug Distribution ─────────────────────────────────────────────────────────

async function fetchBugDistribution(): Promise<ReportOverride> {
    const bugs = await getBugSummary();
    const { totals, by_severity, by_project } = bugs;

    const criticalHigh = by_severity.critical + by_severity.major;
    const pctCritHigh = totals.open_bugs > 0 ? Math.round((criticalHigh / totals.open_bugs) * 100) : 0;
    const resolutionRate = totals.total_bugs > 0 ? Math.round((totals.closed_bugs / totals.total_bugs) * 100) : 0;

    const bars: ChartBar[] = [
        { label: 'Critical', value: by_severity.critical, status: 'atrisk' },
        { label: 'Major', value: by_severity.major, status: 'inprogress' },
        { label: 'Minor', value: by_severity.minor, status: 'ontrack' },
        { label: 'Cosmetic', value: by_severity.cosmetic, status: 'complete' },
    ];

    const rows: ReportRow[] = by_project.slice(0, 8).map(p => ({
        c: [p.project_name],
        status: (p.critical_bugs > 0 ? 'atrisk' : p.open_bugs > 5 ? 'inprogress' : 'ontrack') as ReportStatus,
        rate: p.open_bugs,
        defects: p.total_bugs,
        rec: p.project_name,
    }));

    const tone: ReportStatus = totals.open_bugs > 20 || by_severity.critical > 5 ? 'atrisk' : totals.open_bugs > 5 ? 'inprogress' : 'ontrack';

    return {
        kpis: [
            { label: 'Open defects', value: String(totals.open_bugs), sub: 'all projects' },
            { label: 'Critical / Major', value: String(criticalHigh), sub: `${pctCritHigh}% of open` },
            { label: 'Total bugs', value: String(totals.total_bugs), sub: 'ever reported' },
        ],
        chart: { title: 'Defects by severity', unit: '', bars },
        rows,
        summary: `${totals.open_bugs} defect${totals.open_bugs !== 1 ? 's' : ''} currently open. Critical and Major severity account for ${criticalHigh} (${pctCritHigh}%). ${totals.closed_bugs} resolved total.`,
        summaryTone: tone,
        gauge: { value: resolutionRate, label: 'Resolution rate', caption: `${totals.closed_bugs} of ${totals.total_bugs} resolved` },
    };
}

// ─── Test Execution Summary ───────────────────────────────────────────────────

interface RawTestExecSummary {
    summary: {
        total_test_runs: number;
        total_executions: number;
        total_passed: number;
        total_failed: number;
        overall_pass_rate: string | number;
    };
    recent_runs: Array<{
        name: string;
        status: string;
        pass_rate: string | number;
        total_cases: number;
        failed: number;
    }>;
}

async function fetchTestExecution(): Promise<ReportOverride> {
    const data = await fetchApi<RawTestExecSummary>('/test-executions/summary');
    const { summary, recent_runs } = data;

    const passRate = p(summary.overall_pass_rate);

    const bars: ChartBar[] = recent_runs.slice(0, 6).map(r => {
        const rate = p(r.pass_rate);
        return { label: r.name.substring(0, 8), value: rate, status: toStatus(rate) };
    });

    const rows: ReportRow[] = recent_runs.slice(0, 8).map(r => {
        const rate = p(r.pass_rate);
        return {
            c: [r.name],
            status: toStatus(rate),
            rate,
            defects: r.failed,
            rec: r.status,
        };
    });

    const tone: ReportStatus = passRate >= 90 ? 'complete' : passRate >= 75 ? 'ontrack' : 'inprogress';

    return {
        kpis: [
            { label: 'Runs executed', value: String(summary.total_test_runs), sub: 'total' },
            { label: 'Cases run', value: String(summary.total_executions), sub: `${passRate}% passed` },
            { label: 'Failed', value: String(summary.total_failed), sub: 'test cases' },
        ],
        chart: { title: 'Pass rate by run', unit: '%', bars },
        rows,
        summary: `${summary.total_test_runs} test run${summary.total_test_runs !== 1 ? 's' : ''} with ${summary.total_executions} total cases executed at ${passRate}% pass rate. ${summary.total_failed} case${summary.total_failed !== 1 ? 's' : ''} failed.`,
        summaryTone: tone,
        gauge: { value: passRate, label: 'Pass rate', caption: `${summary.total_executions} cases run` },
    };
}

// ─── Resource Utilization ─────────────────────────────────────────────────────

interface RawResource {
    resource_name: string;
    is_active: boolean;
    utilization_pct?: number | string | null;
    current_allocation_hrs?: number | string | null;
    weekly_capacity_hrs?: number | string | null;
}

async function fetchResourceUtilization(): Promise<ReportOverride> {
    const resources = await fetchApi<RawResource[]>('/resources');
    const active = resources.filter(r => r.is_active);
    if (!active.length) throw new Error('no data');

    // PostgreSQL NUMERIC columns come back as strings from pg — use p() to coerce safely
    const avgUtil = Math.round(active.reduce((s, r) => s + p(r.utilization_pct), 0) / active.length);
    const overCapacity = active.filter(r => p(r.utilization_pct) > 100).length;
    const spareHrs = Math.round(active.reduce((s, r) => {
        const spare = p(r.weekly_capacity_hrs) - p(r.current_allocation_hrs);
        return s + (spare > 0 ? spare : 0);
    }, 0));

    const bars: ChartBar[] = active.slice(0, 8).map(r => {
        const u = Math.min(p(r.utilization_pct), 150);
        return {
            label: (r.resource_name || '').split(' ')[0],
            value: u,
            status: u > 100 ? 'atrisk' : u > 85 ? 'ontrack' : u > 50 ? 'inprogress' : 'complete',
        };
    });

    const rows: ReportRow[] = active.slice(0, 8).map(r => {
        const u = Math.min(p(r.utilization_pct), 100);
        return {
            c: [r.resource_name],
            status: (u > 100 ? 'atrisk' : u > 85 ? 'ontrack' : u > 50 ? 'inprogress' : 'complete') as ReportStatus,
            rate: u,
            defects: p(r.current_allocation_hrs),
            rec: `${p(r.weekly_capacity_hrs)}h capacity`,
        };
    });

    const tone: ReportStatus = overCapacity > 0 ? 'inprogress' : avgUtil > 90 ? 'inprogress' : 'complete';

    return {
        kpis: [
            { label: 'Team members', value: String(active.length), sub: `${overCapacity} over capacity` },
            { label: 'Avg utilization', value: `${avgUtil}%`, sub: 'this sprint' },
            { label: 'Spare capacity', value: `${spareHrs}h`, sub: 'available' },
        ],
        chart: { title: 'Utilization by member', unit: '%', bars },
        rows,
        summary: `Team of ${active.length} member${active.length !== 1 ? 's' : ''} running at ${avgUtil}% average utilization. ${overCapacity > 0 ? `${overCapacity} member${overCapacity !== 1 ? 's' : ''} over capacity.` : 'No one over capacity.'}`,
        summaryTone: tone,
        gauge: { value: avgUtil, label: 'Utilization', caption: `${overCapacity > 0 ? overCapacity + ' over capacity' : 'team balanced'}` },
    };
}

// ─── Quality Trend Analysis ───────────────────────────────────────────────────

async function fetchQualityTrend(dateFrom?: string, dateTo?: string): Promise<ReportOverride> {
    const trend = await getExecutionTrend(undefined, dateFrom, dateTo);

    const now = new Date();
    const weeks: { label: string; tests: number; passed: number }[] = [
        { label: 'W-4', tests: 0, passed: 0 },
        { label: 'W-3', tests: 0, passed: 0 },
        { label: 'W-2', tests: 0, passed: 0 },
        { label: 'W-1', tests: 0, passed: 0 },
        { label: 'Now', tests: 0, passed: 0 },
    ];

    trend.forEach(d => {
        const dDate = new Date(d.date);
        const msPerWeek = 7 * 24 * 60 * 60 * 1000;
        const weeksAgo = Math.floor((now.getTime() - dDate.getTime()) / msPerWeek);
        const idx = 4 - Math.min(4, weeksAgo);
        if (idx >= 0) {
            weeks[idx].tests += d.totalTests;
            weeks[idx].passed += d.passedCount;
        }
    });

    const bars: ChartBar[] = weeks.map(w => {
        const rate = w.tests > 0 ? Math.round((w.passed / w.tests) * 100) : 0;
        return { label: w.label, value: rate, status: toStatus(rate) };
    });

    const currentRate = bars[4].value;
    const prevRate = bars[3].value;
    const delta = currentRate - prevRate;

    const tone: ReportStatus = currentRate >= 85 ? 'complete' : currentRate >= 70 ? 'ontrack' : 'inprogress';

    return {
        kpis: [
            { label: 'Current pass rate', value: `${currentRate}%`, sub: 'this week', delta: `${delta >= 0 ? '+' : ''}${delta}%`, trend: delta >= 0 ? 'up' : 'down' },
            { label: 'Total executions', value: String(weeks[4].tests), sub: 'this week' },
            { label: 'Trend', value: delta >= 0 ? 'Up' : 'Down', sub: `${Math.abs(delta)}% vs last week` },
        ],
        chart: { title: 'Pass rate by week', unit: '%', bars },
        rows: [],
        summary: `Pass rate ${delta >= 0 ? 'improved' : 'dropped'} ${Math.abs(delta)} point${Math.abs(delta) !== 1 ? 's' : ''} this week to ${currentRate}%. ${currentRate >= 85 ? 'Above the 85% target.' : 'Below the 85% target threshold.'}`,
        summaryTone: tone,
        gauge: { value: currentRate, label: 'Quality index', caption: `${delta >= 0 ? '+' : ''}${delta}% this week` },
    };
}

interface DateParams {
    dateFrom?: string;
    dateTo?: string;
}

// ─── Fetcher registry ─────────────────────────────────────────────────────────

const FETCHERS: Record<string, (dates: DateParams) => Promise<ReportOverride>> = {
    readiness: () => fetchReadiness(),
    quality: ({ dateFrom, dateTo }) => fetchQualityHealth(dateFrom, dateTo),
    coverage: () => fetchCoverage(),
    'proj-status': () => fetchProjectStatus(),
    'bug-dist': () => fetchBugDistribution(),
    'test-exec': () => fetchTestExecution(),
    resource: () => fetchResourceUtilization(),
    'quality-trend': ({ dateFrom, dateTo }) => fetchQualityTrend(dateFrom, dateTo),
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useReportData(reportId: string, dateFrom?: string, dateTo?: string) {
    const [override, setOverride] = useState<ReportOverride | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetcher = FETCHERS[reportId];
        if (!fetcher) return;

        let cancelled = false;
        setOverride(null);
        setLoading(true);

        fetcher({ dateFrom, dateTo })
            .then(data => { if (!cancelled) setOverride(data); })
            .catch(() => { if (!cancelled) setOverride(null); })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [reportId, dateFrom, dateTo]);

    return { override, loading };
}
