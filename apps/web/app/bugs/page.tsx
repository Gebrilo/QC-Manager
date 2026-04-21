'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { bugsApi, type Bug } from '@/lib/api';
import { projectsApi, type Project } from '@/lib/api';
import { useAuth } from '@/components/providers/AuthProvider';

const SEVERITY_COLORS: Record<string, string> = {
    critical: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    high:     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    medium:   'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-500',
    low:      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400',
};

const STATUS_COLORS: Record<string, string> = {
    Open:        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'In Progress':'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    Resolved:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    Closed:      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    Reopened:    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

export default function BugsPage() {
    return (
        <Suspense fallback={<div className="py-12 text-center text-slate-400">Loading\u2026</div>}>
            <BugsContent />
        </Suspense>
    );
}

function BugsContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { hasPermission } = useAuth();
    const canDelete = hasPermission('action:bugs:delete');

    const [bugs, setBugs] = useState<Bug[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [filter, setFilter] = useState('');
    const [projectFilter, setProjectFilter] = useState(searchParams.get('project_id') || '');
    const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
    const [severityFilter, setSeverityFilter] = useState(searchParams.get('severity') || '');
    const [sourceFilter, setSourceFilter] = useState(searchParams.get('source') || '');
    const [page, setPage] = useState(() => {
        const p = searchParams.get('page');
        return p ? Math.max(0, parseInt(p) - 1) : 0;
    });
    const [deleteTarget, setDeleteTarget] = useState<Bug | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const PAGE_SIZE = 50;

    const updateUrlParams = useCallback(() => {
        const params = new URLSearchParams();
        if (projectFilter) params.set('project_id', projectFilter);
        if (statusFilter) params.set('status', statusFilter);
        if (severityFilter) params.set('severity', severityFilter);
        if (sourceFilter) params.set('source', sourceFilter);
        if (page > 0) params.set('page', String(page + 1));
        const qs = params.toString();
        router.replace(`/bugs${qs ? `?${qs}` : ''}`, { scroll: false });
    }, [projectFilter, statusFilter, severityFilter, sourceFilter, page, router]);

    useEffect(() => {
        updateUrlParams();
    }, [updateUrlParams]);

    const loadBugs = async () => {
        try {
            setIsLoading(true);
            const res = await bugsApi.list({
                project_id: projectFilter || undefined,
                status:     statusFilter   || undefined,
                severity:   severityFilter || undefined,
                source:     sourceFilter   || undefined,
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
    }, [projectFilter, statusFilter, severityFilter, sourceFilter]);

    useEffect(() => {
        loadBugs();
    }, [projectFilter, statusFilter, severityFilter, sourceFilter, page]);

    const filtered = useMemo(() => {
        if (!filter) return bugs;
        const q = filter.toLowerCase();
        return bugs.filter(b =>
            b.title.toLowerCase().includes(q) ||
            b.bug_id.toLowerCase().includes(q) ||
            b.assigned_to?.toLowerCase().includes(q) ||
            b.reported_by?.toLowerCase().includes(q) ||
            b.component?.toLowerCase().includes(q)
        );
    }, [bugs, filter]);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 4000);
        return () => clearTimeout(t);
    }, [toast]);

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            await bugsApi.delete(deleteTarget.id);
            setBugs(prev => prev.filter(b => b.id !== deleteTarget.id));
            setTotal(prev => prev - 1);
            setToast({ type: 'success', message: `Bug "${deleteTarget.bug_id}" deleted` });
            setDeleteTarget(null);
        } catch (err: any) {
            setToast({ type: 'error', message: err.message || 'Failed to delete bug' });
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-6 py-6 px-4 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Bugs</h1>
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
                    {filter && total > PAGE_SIZE && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                            Searching within current page only. Use filters above to narrow results first.
                        </p>
                    )}
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

                <select
                    value={sourceFilter}
                    onChange={e => setSourceFilter(e.target.value)}
                    className="py-2 px-3 bg-slate-50 dark:bg-slate-800 border-none rounded-lg text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                    <option value="">All Sources</option>
                    <option value="TEST_CASE">Test Case</option>
                    <option value="EXPLORATORY">Exploratory</option>
                </select>

                {(projectFilter || statusFilter || severityFilter || sourceFilter || filter) && (
                    <button
                        onClick={() => { setProjectFilter(''); setStatusFilter(''); setSeverityFilter(''); setSourceFilter(''); setFilter(''); }}
                        className="py-2 px-3 text-sm text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors flex items-center gap-1 whitespace-nowrap"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        Clear
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="glass-card rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 w-28">ID</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Title</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 w-28">Source</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 w-28">Severity</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 w-32">Status</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 w-36">Project</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 w-36">Submitted By</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 w-36">Updated By</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 w-36">Assigned To</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 w-28">Reported</th>
                                {canDelete && (
                                    <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 w-16"></th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {isLoading ? (
                                <tr><td colSpan={canDelete ? 11 : 10} className="px-4 py-12 text-center text-slate-400">Loading…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={canDelete ? 11 : 10} className="px-4 py-12 text-center text-slate-400">No bugs found.</td></tr>
                            ) : filtered.map(bug => (
                                <tr key={bug.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                                        {bug.tuleap_url ? (
                                            <a href={bug.tuleap_url} target="_blank" rel="noopener noreferrer"
                                               className="text-indigo-600 dark:text-indigo-400 hover:underline">
                                                {bug.tuleap_artifact_id ? `TLP-${bug.tuleap_artifact_id}` : bug.bug_id}
                                            </a>
                                        ) : (bug.tuleap_artifact_id ? `TLP-${bug.tuleap_artifact_id}` : bug.bug_id)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-slate-900 dark:text-white line-clamp-1">{bug.title}</p>
                                        {bug.component && <p className="text-xs text-slate-400 mt-0.5">{bug.component}</p>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                            bug.source === 'TEST_CASE'
                                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
                                                : 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400'
                                        }`}>
                                            {bug.source === 'TEST_CASE' ? 'Test Cases' : 'Standalone'}
                                        </span>
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
                                        {bug.project_name || '\u2014'}
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                                        {bug.submitted_by_resource_name || '\u2014'}
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs truncate max-w-[140px]">
                                        {bug.updated_by || bug.reported_by || '\u2014'}
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                                        {bug.assigned_to || '\u2014'}
                                    </td>
                                    <td className="px-4 py-3 text-slate-400 text-xs">
                                        {bug.reported_date ? new Date(bug.reported_date).toLocaleDateString() : '\u2014'}
                                    </td>
                                    {canDelete && (
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => setDeleteTarget(bug)}
                                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                                                title="Delete bug"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {total > PAGE_SIZE && (
                    <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-sm text-slate-500">
                        <span>Showing {page * PAGE_SIZE + 1}\u2013{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
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

            {/* Delete Confirmation Modal */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 max-w-md w-full mx-4 p-6 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-900 dark:text-white">Delete Bug</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                    Delete <span className="font-mono font-medium">{deleteTarget.bug_id}</span>: {deleteTarget.title}?
                                </p>
                                <p className="text-xs text-slate-400 mt-2">
                                    This removes the bug from QC-Manager only. It will not be deleted in Tuleap.
                                    The next Tuleap sync will skip this bug.
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                onClick={() => setDeleteTarget(null)}
                                disabled={isDeleting}
                                className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="px-4 py-2 text-sm rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition-colors"
                            >
                                {isDeleting ? 'Deleting\u2026' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
                    toast.type === 'success'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-rose-600 text-white'
                }`}>
                    {toast.message}
                </div>
            )}
        </div>
    );
}
