'use client';

import { useState, useEffect, useMemo } from 'react';
import { bugsApi, type Bug } from '@/lib/api';
import { projectsApi, type Project } from '@/lib/api';

const SEVERITY_COLORS: Record<string, string> = {
    critical: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400',
    high:     'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-400',
    medium:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-400',
    low:      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400',
};

const STATUS_COLORS: Record<string, string> = {
    Open:        'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400',
    'In Progress':'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-400',
    Resolved:    'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400',
    Closed:      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    Reopened:    'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400',
};

export default function BugsPage() {
    const [bugs, setBugs] = useState<Bug[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [filter, setFilter] = useState('');
    const [projectFilter, setProjectFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [severityFilter, setSeverityFilter] = useState('');
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 50;

    const loadBugs = async () => {
        try {
            setIsLoading(true);
            const res = await bugsApi.list({
                project_id: projectFilter || undefined,
                status:     statusFilter   || undefined,
                severity:   severityFilter || undefined,
                limit:  PAGE_SIZE,
                offset: page * PAGE_SIZE,
            });
            setBugs(res.data);
            setTotal(res.total);
        } catch (err) {
            console.error('Failed to load bugs:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        projectsApi.list().then(setProjects).catch(() => {});
    }, []);

    useEffect(() => {
        setPage(0);
    }, [projectFilter, statusFilter, severityFilter]);

    useEffect(() => {
        loadBugs();
    }, [projectFilter, statusFilter, severityFilter, page]);

    const filtered = useMemo(() => {
        if (!filter) return bugs;
        const q = filter.toLowerCase();
        return bugs.filter(b =>
            b.title.toLowerCase().includes(q) ||
            b.bug_id.toLowerCase().includes(q) ||
            b.assigned_to?.toLowerCase().includes(q) ||
            b.component?.toLowerCase().includes(q)
        );
    }, [bugs, filter]);

    return (
        <div className="space-y-6 py-6 px-4 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Bugs</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        Defects synced from Tuleap. Total: <span className="font-semibold">{total}</span>
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[200px]">
                    <input
                        type="text"
                        placeholder="Search title, ID, component…"
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    />
                    <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>

                <select
                    value={projectFilter}
                    onChange={e => setProjectFilter(e.target.value)}
                    className="py-2 px-3 bg-slate-50 dark:bg-slate-800 border-none rounded-lg text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                    <option value="">All Projects</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                </select>

                <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="py-2 px-3 bg-slate-50 dark:bg-slate-800 border-none rounded-lg text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                    <option value="">All Statuses</option>
                    {['Open','In Progress','Resolved','Closed','Reopened'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>

                <select
                    value={severityFilter}
                    onChange={e => setSeverityFilter(e.target.value)}
                    className="py-2 px-3 bg-slate-50 dark:bg-slate-800 border-none rounded-lg text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                    <option value="">All Severities</option>
                    {['critical','high','medium','low'].map(s => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                </select>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 w-24">ID</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Title</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 w-28">Severity</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 w-32">Status</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 w-36">Project</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 w-36">Assigned To</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 w-28">Reported</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {isLoading ? (
                                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">Loading…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">No bugs found.</td></tr>
                            ) : filtered.map(bug => (
                                <tr key={bug.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                                        {bug.tuleap_url ? (
                                            <a href={bug.tuleap_url} target="_blank" rel="noopener noreferrer"
                                               className="text-indigo-600 dark:text-indigo-400 hover:underline">
                                                {bug.bug_id}
                                            </a>
                                        ) : bug.bug_id}
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-slate-900 dark:text-white line-clamp-1">{bug.title}</p>
                                        {bug.component && <p className="text-xs text-slate-400 mt-0.5">{bug.component}</p>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${SEVERITY_COLORS[bug.severity] || SEVERITY_COLORS.low}`}>
                                            {bug.severity}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[bug.status] || STATUS_COLORS.Open}`}>
                                            {bug.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs truncate max-w-[140px]">
                                        {bug.project_name || '—'}
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                                        {bug.assigned_to || '—'}
                                    </td>
                                    <td className="px-4 py-3 text-slate-400 text-xs">
                                        {bug.reported_date ? new Date(bug.reported_date).toLocaleDateString() : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {total > PAGE_SIZE && (
                    <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-sm text-slate-500">
                        <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
                        <div className="flex gap-2">
                            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                                className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800">
                                Previous
                            </button>
                            <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE_SIZE >= total}
                                className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800">
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
