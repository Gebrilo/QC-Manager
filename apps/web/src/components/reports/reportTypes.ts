import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export type ReportStatus = 'complete' | 'ontrack' | 'inprogress' | 'atrisk' | 'ready' | 'generating' | 'failed';
export type ReportCategory = 'Governance' | 'Operational';

export interface ReportKpi {
    label: string;
    value: string;
    sub: string;
    delta?: string;
    trend?: 'up' | 'down';
}

export interface ReportRow {
    c: string[];
    status: ReportStatus;
    rate: number;
    defects: number;
    rec: string;
}

export interface ChartBar {
    label: string;
    value: number;
    status: ReportStatus;
}

export interface ReportDefinition {
    id: string;
    category: ReportCategory;
    iconKey: string;
    name: string;
    desc: string;
    lastGenerated: string;
    est: string;
    summary: string;
    summaryTone: ReportStatus;
    kpis: ReportKpi[];
    chart: { title: string; unit: string; bars: ChartBar[] };
    columns: string[];
    rows: ReportRow[];
}

export interface HistoryItem {
    id: number;
    name: string;
    category: ReportCategory;
    format: string;
    when: string;
    by: string;
    status: ReportStatus;
}

export interface ScheduledItem {
    id: number;
    name: string;
    cadence: string;
    format: string;
    recipients: number;
    next: string;
    active: boolean;
}

export const GAUGE_DATA: Record<string, { value: number; label: string; caption: string }> = {
    'readiness':     { value: 71, label: 'Avg pass rate',   caption: '14 pts below 85% gate' },
    'quality':       { value: 89, label: 'Pass rate',       caption: '+3 pts week-over-week' },
    'coverage':      { value: 67, label: 'Coverage',        caption: '110 gaps remaining' },
    'proj-status':   { value: 73, label: 'Avg completion',  caption: 'across 5 projects' },
    'bug-dist':      { value: 56, label: 'Resolution rate', caption: '7-day rolling' },
    'test-exec':     { value: 86, label: 'Pass rate',       caption: '1,204 cases run' },
    'resource':      { value: 89, label: 'Utilization',     caption: '1 member over capacity' },
    'quality-trend': { value: 88, label: 'Quality index',   caption: '4 consecutive weeks up' },
};

export const STATUS_CONFIG: Record<string, { label: string; cls: string; bar: string }> = {
    complete:   { label: 'On Track',   cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', bar: '#10b981' },
    ontrack:    { label: 'Stable',     cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',             bar: '#3b82f6' },
    inprogress: { label: 'Watch',      cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',         bar: '#f59e0b' },
    atrisk:     { label: 'At Risk',    cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',             bar: '#f43f5e' },
    ready:      { label: 'Ready',      cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', bar: '#10b981' },
    generating: { label: 'Generating', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',         bar: '#f59e0b' },
    failed:     { label: 'Failed',     cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',             bar: '#f43f5e' },
};

export const PAPER_STATUS_CLS: Record<string, string> = {
    complete:   'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    ontrack:    'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    inprogress: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    atrisk:     'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
    ready:      'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    generating: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    failed:     'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
};

export const SUMMARY_TONE: Record<string, string> = {
    atrisk:     'border-rose-200 bg-rose-50',
    ontrack:    'border-blue-200 bg-blue-50',
    inprogress: 'border-amber-200 bg-amber-50',
    complete:   'border-emerald-200 bg-emerald-50',
};

export const SUMMARY_TEXT: Record<string, string> = {
    atrisk:     'text-rose-900',
    ontrack:    'text-blue-900',
    inprogress: 'text-amber-900',
    complete:   'text-emerald-900',
};

export const REPORTS: ReportDefinition[] = [
    {
        id: 'readiness', category: 'Governance', iconKey: 'rocket',
        name: 'Release Readiness',
        desc: 'Go / no-go status for every project targeting the release window.',
        lastGenerated: '2 hours ago', est: '~30s',
        summary: 'Three projects carry critical blocking defects and are recommended for release hold. Aggregate pass rate sits 14 points below the 85% gate.',
        summaryTone: 'atrisk',
        kpis: [
            { label: 'Projects assessed', value: '8',   sub: '3 blocked' },
            { label: 'Avg pass rate',     value: '71%', sub: 'vs 85% gate', delta: '+4%',  trend: 'up' },
            { label: 'Open blockers',     value: '12',  sub: 'across 3 projects', delta: '+5', trend: 'down' },
        ],
        chart: { title: 'Pass rate by project', unit: '%', bars: [
            { label: 'AUTH', value: 94, status: 'complete' },
            { label: 'CORE', value: 82, status: 'ontrack' },
            { label: 'PPO',  value: 58, status: 'inprogress' },
            { label: 'CST',  value: 41, status: 'atrisk' },
            { label: 'FRA',  value: 33, status: 'atrisk' },
        ]},
        columns: ['Project', 'Status', 'Pass rate', 'Blockers', 'Recommendation'],
        rows: [
            { c: ['CST'],  status: 'atrisk',     rate: 41, defects: 5, rec: 'Block release'   },
            { c: ['FRA'],  status: 'atrisk',     rate: 33, defects: 4, rec: 'Block release'   },
            { c: ['PPO'],  status: 'inprogress', rate: 58, defects: 3, rec: 'Conditional'     },
            { c: ['AUTH'], status: 'complete',   rate: 94, defects: 0, rec: 'Approve release' },
            { c: ['CORE'], status: 'ontrack',    rate: 82, defects: 0, rec: 'Approve release' },
        ],
    },
    {
        id: 'quality', category: 'Governance', iconKey: 'pulse',
        name: 'Weekly Quality Health',
        desc: 'Pass-rate, execution trend and critical defects over the last 7 days.',
        lastGenerated: '1 day ago', est: '~20s',
        summary: 'Execution volume is up 11% week-over-week and the pass rate improved 3 points. Three critical defects remain open in the CST suite.',
        summaryTone: 'ontrack',
        kpis: [
            { label: 'Test executions',  value: '142', sub: 'this week',          delta: '+11%', trend: 'up' },
            { label: 'Pass rate',        value: '89%', sub: 'rolling 7-day',      delta: '+3%',  trend: 'up' },
            { label: 'Critical defects', value: '3',   sub: 'open & unresolved',  delta: '-2',   trend: 'up' },
        ],
        chart: { title: 'Executions per day', unit: '', bars: [
            { label: 'Mon', value: 18, status: 'ontrack' },
            { label: 'Tue', value: 24, status: 'ontrack' },
            { label: 'Wed', value: 31, status: 'complete' },
            { label: 'Thu', value: 22, status: 'ontrack' },
            { label: 'Fri', value: 28, status: 'complete' },
            { label: 'Sat', value: 9,  status: 'inprogress' },
            { label: 'Sun', value: 10, status: 'inprogress' },
        ]},
        columns: ['Project', 'Status', 'Pass rate', 'Defects', 'Note'],
        rows: [
            { c: ['Core Platform'], status: 'complete', rate: 94, defects: 1, rec: 'On track' },
            { c: ['Auth Module'],   status: 'ontrack',  rate: 89, defects: 2, rec: 'Monitor'  },
            { c: ['CST Suite'],     status: 'atrisk',   rate: 67, defects: 8, rec: 'Escalate' },
        ],
    },
    {
        id: 'coverage', category: 'Governance', iconKey: 'scale',
        name: 'Test Coverage & Workload',
        desc: 'Coverage gaps versus total tasks and tester workload distribution.',
        lastGenerated: '3 days ago', est: '~45s',
        summary: 'Overall coverage is 67% with 110 untested tasks. One tester is overallocated at 142% of capacity; rebalancing is recommended.',
        summaryTone: 'inprogress',
        kpis: [
            { label: 'Test cases',    value: '342', sub: '4 active suites' },
            { label: 'Coverage',      value: '67%', sub: '110 gaps',         delta: '+6%',  trend: 'up' },
            { label: 'Active testers',value: '5',   sub: '1 overallocated',  delta: '142%', trend: 'down' },
        ],
        chart: { title: 'Coverage by suite', unit: '%', bars: [
            { label: 'Suite A', value: 88, status: 'complete' },
            { label: 'Suite B', value: 72, status: 'ontrack' },
            { label: 'Suite C', value: 41, status: 'atrisk' },
            { label: 'Suite D', value: 64, status: 'inprogress' },
        ]},
        columns: ['Suite', 'Status', 'Coverage', 'Gaps', 'Action'],
        rows: [
            { c: ['Suite A'], status: 'complete',   rate: 88, defects: 4,  rec: 'Full coverage' },
            { c: ['Suite B'], status: 'ontrack',    rate: 72, defects: 11, rec: 'Expand tests'  },
            { c: ['Suite C'], status: 'atrisk',     rate: 41, defects: 28, rec: 'Blocked'       },
            { c: ['Suite D'], status: 'inprogress', rate: 64, defects: 17, rec: 'Expand tests'  },
        ],
    },
    {
        id: 'proj-status', category: 'Operational', iconKey: 'barChart',
        name: 'Project Status',
        desc: 'Task progress, completion rates and hour tracking per project.',
        lastGenerated: '5 hours ago', est: '~15s',
        summary: 'Five active projects logged 312 hours this period. Core Platform leads completion at 91%; PPO trails at 44% with scope still expanding.',
        summaryTone: 'ontrack',
        kpis: [
            { label: 'Active projects', value: '5',   sub: '2 at risk' },
            { label: 'Avg completion',  value: '73%', sub: 'all projects', delta: '+8%', trend: 'up' },
            { label: 'Hours logged',    value: '312', sub: 'this period' },
        ],
        chart: { title: 'Completion by project', unit: '%', bars: [
            { label: 'CORE', value: 91, status: 'complete' },
            { label: 'AUTH', value: 84, status: 'ontrack' },
            { label: 'CST',  value: 67, status: 'inprogress' },
            { label: 'FRA',  value: 58, status: 'inprogress' },
            { label: 'PPO',  value: 44, status: 'atrisk' },
        ]},
        columns: ['Project', 'Status', 'Completion', 'Open tasks', 'Hours'],
        rows: [
            { c: ['Core Platform'], status: 'complete',   rate: 91, defects: 4,  rec: '88h' },
            { c: ['Auth Module'],   status: 'ontrack',    rate: 84, defects: 9,  rec: '64h' },
            { c: ['CST Suite'],     status: 'inprogress', rate: 67, defects: 18, rec: '72h' },
            { c: ['FRA Portal'],    status: 'inprogress', rate: 58, defects: 22, rec: '51h' },
            { c: ['PPO Engine'],    status: 'atrisk',     rate: 44, defects: 31, rec: '37h' },
        ],
    },
    {
        id: 'bug-dist', category: 'Operational', iconKey: 'bug',
        name: 'Bug Distribution',
        desc: 'Open defects broken down by severity, project and assignee.',
        lastGenerated: 'Yesterday', est: '~15s',
        summary: '64 defects are currently open. Critical and high severity together account for 28 (44%), concentrated in the CST and FRA projects.',
        summaryTone: 'atrisk',
        kpis: [
            { label: 'Open defects',   value: '64',   sub: 'all projects',   delta: '-7',   trend: 'up' },
            { label: 'Critical / High',value: '28',   sub: '44% of open' },
            { label: 'Avg age',        value: '6.2d', sub: 'time to resolve', delta: '-1.1d', trend: 'up' },
        ],
        chart: { title: 'Defects by severity', unit: '', bars: [
            { label: 'Critical', value: 9,  status: 'atrisk' },
            { label: 'High',     value: 19, status: 'inprogress' },
            { label: 'Medium',   value: 23, status: 'ontrack' },
            { label: 'Low',      value: 13, status: 'complete' },
        ]},
        columns: ['Project', 'Severity peak', 'Open', 'Resolved 7d', 'Owner'],
        rows: [
            { c: ['CST Suite'],     status: 'atrisk',     rate: 71, defects: 21, rec: 'A. Okafor' },
            { c: ['FRA Portal'],    status: 'inprogress', rate: 55, defects: 16, rec: 'M. Singh'  },
            { c: ['Core Platform'], status: 'ontrack',    rate: 30, defects: 14, rec: 'L. Chen'   },
            { c: ['Auth Module'],   status: 'complete',   rate: 18, defects: 13, rec: 'R. Diaz'   },
        ],
    },
    {
        id: 'test-exec', category: 'Operational', iconKey: 'grid',
        name: 'Test Execution Summary',
        desc: 'Pass / fail breakdown for all test runs in a time range.',
        lastGenerated: '2 days ago', est: '~25s',
        summary: 'Across 18 runs, 1,204 cases executed with an 86% pass rate. Flaky-test rate dropped to 2.1% after the CI stabilisation work.',
        summaryTone: 'ontrack',
        kpis: [
            { label: 'Runs executed', value: '18',    sub: 'this range' },
            { label: 'Cases run',     value: '1,204', sub: '86% passed',     delta: '+2%',   trend: 'up' },
            { label: 'Flaky rate',    value: '2.1%',  sub: 'down from 4.8%', delta: '-2.7%', trend: 'up' },
        ],
        chart: { title: 'Outcomes by run group', unit: '%', bars: [
            { label: 'Smoke',    value: 98, status: 'complete' },
            { label: 'Regress.', value: 88, status: 'ontrack' },
            { label: 'Integr.',  value: 79, status: 'inprogress' },
            { label: 'E2E',      value: 71, status: 'atrisk' },
        ]},
        columns: ['Run group', 'Status', 'Pass rate', 'Failed', 'Duration'],
        rows: [
            { c: ['Smoke'],       status: 'complete',   rate: 98, defects: 3,  rec: '4m'      },
            { c: ['Regression'],  status: 'ontrack',    rate: 88, defects: 41, rec: '38m'     },
            { c: ['Integration'], status: 'inprogress', rate: 79, defects: 52, rec: '1h 02m'  },
            { c: ['End-to-end'],  status: 'atrisk',     rate: 71, defects: 67, rec: '2h 14m'  },
        ],
    },
    {
        id: 'resource', category: 'Operational', iconKey: 'users',
        name: 'Resource Utilization',
        desc: 'Capacity versus allocation for every active team member.',
        lastGenerated: '4 days ago', est: '~20s',
        summary: 'Team is running at 89% average utilization. One member is over capacity at 142%; two have headroom for additional assignment.',
        summaryTone: 'inprogress',
        kpis: [
            { label: 'Team members',   value: '8',   sub: '1 over capacity' },
            { label: 'Avg utilization',value: '89%', sub: 'this sprint', delta: '+5%',  trend: 'down' },
            { label: 'Spare capacity', value: '46h', sub: 'available',   delta: '-12h', trend: 'down' },
        ],
        chart: { title: 'Utilization by member', unit: '%', bars: [
            { label: 'Okafor', value: 100, status: 'atrisk' },
            { label: 'Singh',  value: 96,  status: 'ontrack' },
            { label: 'Chen',   value: 88,  status: 'ontrack' },
            { label: 'Diaz',   value: 71,  status: 'inprogress' },
            { label: 'Park',   value: 54,  status: 'complete' },
        ]},
        columns: ['Member', 'Status', 'Utilization', 'Assigned', 'Capacity'],
        rows: [
            { c: ['A. Okafor'], status: 'atrisk',     rate: 100, defects: 57, rec: '40h' },
            { c: ['M. Singh'],  status: 'ontrack',    rate: 96,  defects: 38, rec: '40h' },
            { c: ['L. Chen'],   status: 'ontrack',    rate: 88,  defects: 35, rec: '40h' },
            { c: ['R. Diaz'],   status: 'inprogress', rate: 71,  defects: 28, rec: '40h' },
            { c: ['J. Park'],   status: 'complete',   rate: 54,  defects: 22, rec: '40h' },
        ],
    },
    {
        id: 'quality-trend', category: 'Operational', iconKey: 'trendUp',
        name: 'Quality Trend Analysis',
        desc: 'Week-over-week quality metrics and defect velocity.',
        lastGenerated: '1 week ago', est: '~30s',
        summary: 'Quality index climbed for the fourth consecutive week to 88. Defect inflow is now below outflow, signalling a healthy burn-down.',
        summaryTone: 'complete',
        kpis: [
            { label: 'Quality index', value: '88',   sub: '4 weeks rising', delta: '+6',   trend: 'up' },
            { label: 'Defect inflow', value: '31',   sub: 'vs 38 outflow',  delta: '-7',   trend: 'up' },
            { label: 'Escape rate',   value: '1.4%', sub: 'to production',  delta: '-0.6%',trend: 'up' },
        ],
        chart: { title: 'Quality index by week', unit: '', bars: [
            { label: 'W-4', value: 74, status: 'inprogress' },
            { label: 'W-3', value: 79, status: 'ontrack' },
            { label: 'W-2', value: 83, status: 'ontrack' },
            { label: 'W-1', value: 86, status: 'complete' },
            { label: 'Now', value: 88, status: 'complete' },
        ]},
        columns: ['Metric', 'Status', 'This week', 'Δ', 'Trend'],
        rows: [
            { c: ['Pass rate'],      status: 'complete', rate: 89, defects: 3, rec: 'Improving' },
            { c: ['Defect density'], status: 'ontrack',  rate: 62, defects: 2, rec: 'Improving' },
            { c: ['Reopen rate'],    status: 'ontrack',  rate: 41, defects: 1, rec: 'Stable'    },
            { c: ['Escape rate'],    status: 'complete', rate: 14, defects: 0, rec: 'Improving' },
        ],
    },
];

export const HISTORY: HistoryItem[] = [
    { id: 1, name: 'Release Readiness',        category: 'Governance',  format: 'PDF',   when: 'Today, 4:31 PM',     by: 'admin user', status: 'ready'      },
    { id: 2, name: 'Weekly Quality Health',    category: 'Governance',  format: 'Excel', when: 'Yesterday, 9:15 AM', by: 'admin user', status: 'ready'      },
    { id: 3, name: 'Project Status',           category: 'Operational', format: 'CSV',   when: 'May 30, 2:44 PM',    by: 'm.singh',    status: 'ready'      },
    { id: 4, name: 'Test Coverage & Workload', category: 'Governance',  format: 'PDF',   when: 'May 29, 11:00 AM',   by: 'admin user', status: 'ready'      },
    { id: 5, name: 'Bug Distribution',         category: 'Operational', format: 'Excel', when: 'May 29, 8:30 AM',    by: 'l.chen',     status: 'generating' },
    { id: 6, name: 'Resource Utilization',     category: 'Operational', format: 'Excel', when: 'May 28, 6:02 PM',    by: 'admin user', status: 'failed'     },
];

export const INITIAL_SCHEDULED: ScheduledItem[] = [
    { id: 1, name: 'Weekly Quality Health', cadence: 'Every Mon · 8:00 AM', format: 'PDF',   recipients: 4, next: 'Mon, Jun 2',  active: true  },
    { id: 2, name: 'Release Readiness',     cadence: 'Daily · 6:00 PM',    format: 'PDF',   recipients: 7, next: 'Today, 6PM',  active: true  },
    { id: 3, name: 'Resource Utilization',  cadence: 'Every Fri · 5:00 PM',format: 'Excel', recipients: 2, next: 'Fri, Jun 6',  active: false },
];
