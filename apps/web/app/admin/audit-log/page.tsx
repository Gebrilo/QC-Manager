'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Filter, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import { UnauthorizedPage } from '@/components/PermissionGuard';
import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { fetchApi } from '@/lib/api';

interface AuditRow {
    id: string;
    entity_type: string;
    entity_uuid?: string | null;
    entity_id?: string | null;
    action: string;
    user_id?: string | null;
    user_email?: string | null;
    before_state?: unknown;
    after_state?: unknown;
    changed_fields?: string[] | null;
    change_summary?: string | null;
    details?: Record<string, any> | null;
    created_at: string;
}

interface AuditResponse {
    rows: AuditRow[];
    total: number;
    limit: number;
    offset: number;
}

interface SearchResult {
    id: string;
    name?: string;
    email?: string;
    role?: string;
}

const ENTITY_OPTIONS = [
    { value: '', label: 'All events' },
    { value: 'access_denied', label: 'Denials' },
    { value: 'role_permission', label: 'Role permissions' },
    { value: 'default_artifact_visibility', label: 'Default visibility' },
    { value: 'artifact_access', label: 'Artifact ACL' },
];

function formatDate(value?: string | null) {
    if (!value) return '-';
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));
}

function JsonPanel({ title, value, highlightReason = false }: { title: string; value: unknown; highlightReason?: boolean }) {
    const reason = typeof value === 'object' && value && 'reason' in value ? String((value as any).reason || '') : '';
    return (
        <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                {title}
                {highlightReason && reason && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] normal-case text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800">
                        <ShieldAlert className="h-3 w-3" />
                        {reason}
                    </span>
                )}
            </div>
            <pre className="max-h-72 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                {JSON.stringify(value ?? null, null, 2)}
            </pre>
        </div>
    );
}

export default function AuditLogPage() {
    const { hasPermission } = useAuth();
    const [rows, setRows] = useState<AuditRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [filters, setFilters] = useState({
        event_type: 'access_denied',
        actor_user_id: '',
        target_entity_type: '',
        target_entity_id: '',
        since: '',
        until: '',
        limit: 25,
        offset: 0,
    });
    const [actorQuery, setActorQuery] = useState('');
    const [actorResults, setActorResults] = useState<SearchResult[]>([]);
    const [showActorResults, setShowActorResults] = useState(false);
    const actorTimerRef = useRef<NodeJS.Timeout | null>(null);

    const canView = hasPermission('qc.admin.view_audit_log');

    const loadRows = useCallback(async () => {
        if (!canView) return;
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            Object.entries(filters).forEach(([key, value]) => {
                if (value !== '' && value != null) params.set(key, String(value));
            });
            const data = await fetchApi<AuditResponse>(`/admin/access/audit?${params.toString()}`);
            setRows(data.rows);
            setTotal(data.total);
        } catch (err: any) {
            setError(err.message || 'Failed to load audit log');
        } finally {
            setLoading(false);
        }
    }, [canView, filters]);

    const searchActors = useCallback(async (q: string) => {
        if (!canView || q.trim().length < 2) {
            setActorResults([]);
            return;
        }
        try {
            const data = await fetchApi<any>(`/users?q=${encodeURIComponent(q)}&limit=8`);
            setActorResults(Array.isArray(data) ? data : data.users || []);
            setShowActorResults(true);
        } catch {
            setActorResults([]);
        }
    }, [canView]);

    useEffect(() => {
        loadRows();
    }, [loadRows]);

    useEffect(() => {
        if (actorTimerRef.current) clearTimeout(actorTimerRef.current);
        actorTimerRef.current = setTimeout(() => searchActors(actorQuery), 250);
        return () => {
            if (actorTimerRef.current) clearTimeout(actorTimerRef.current);
        };
    }, [actorQuery, searchActors]);

    if (!canView) return <UnauthorizedPage />;

    const page = Math.floor(filters.offset / filters.limit) + 1;
    const pages = Math.max(1, Math.ceil(total / filters.limit));

    const updateFilter = (key: keyof typeof filters, value: string | number) => {
        setFilters(prev => ({ ...prev, [key]: value, offset: key === 'offset' ? Number(value) : 0 }));
    };

    return (
        <div className="min-h-full space-y-5">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Access Audit Log</h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Inspect access changes, denials, and access-engine events.</p>
                </div>
                <Button variant="outline" onClick={loadRows} disabled={loading}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    <Filter className="h-4 w-4" />
                    Filters
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="space-y-1 text-xs font-medium text-slate-500">
                        Event type
                        <select
                            value={filters.event_type}
                            onChange={e => updateFilter('event_type', e.target.value)}
                            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                        >
                            {ENTITY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                    </label>

                    <div className="relative space-y-1 text-xs font-medium text-slate-500">
                        Actor
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                value={actorQuery}
                                onChange={e => {
                                    setActorQuery(e.target.value);
                                    updateFilter('actor_user_id', '');
                                }}
                                onFocus={() => setShowActorResults(actorResults.length > 0)}
                                placeholder="Search user"
                                className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                            />
                        </div>
                        {showActorResults && actorResults.length > 0 && (
                            <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
                                {actorResults.map(actor => (
                                    <button
                                        key={actor.id}
                                        type="button"
                                        onClick={() => {
                                            setFilters(prev => ({ ...prev, actor_user_id: actor.id, offset: 0 }));
                                            setActorQuery(actor.name || actor.email || actor.id);
                                            setShowActorResults(false);
                                        }}
                                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                                    >
                                        <div className="font-medium text-slate-900 dark:text-white">{actor.name || actor.email || actor.id}</div>
                                        <div className="text-xs text-slate-500">{actor.email || actor.role || actor.id}</div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <label className="space-y-1 text-xs font-medium text-slate-500">
                        Target type
                        <input
                            value={filters.target_entity_type}
                            onChange={e => updateFilter('target_entity_type', e.target.value)}
                            placeholder="bug, task, test_case"
                            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                        />
                    </label>

                    <label className="space-y-1 text-xs font-medium text-slate-500">
                        Target ID
                        <input
                            value={filters.target_entity_id}
                            onChange={e => updateFilter('target_entity_id', e.target.value)}
                            placeholder="UUID or artifact id"
                            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                        />
                    </label>

                    <label className="space-y-1 text-xs font-medium text-slate-500">
                        Since
                        <input
                            type="datetime-local"
                            value={filters.since}
                            onChange={e => updateFilter('since', e.target.value)}
                            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                        />
                    </label>

                    <label className="space-y-1 text-xs font-medium text-slate-500">
                        Until
                        <input
                            type="datetime-local"
                            value={filters.until}
                            onChange={e => updateFilter('until', e.target.value)}
                            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                        />
                    </label>

                    <label className="space-y-1 text-xs font-medium text-slate-500">
                        Page size
                        <select
                            value={filters.limit}
                            onChange={e => updateFilter('limit', Number(e.target.value))}
                            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                        >
                            {[25, 50, 100, 200].map(size => <option key={size} value={size}>{size}</option>)}
                        </select>
                    </label>
                </div>
            </section>

            {error && <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-900/60">
                            <tr>
                                <th className="w-10 px-3 py-3" />
                                <th className="px-3 py-3">Time</th>
                                <th className="px-3 py-3">Action</th>
                                <th className="px-3 py-3">Entity</th>
                                <th className="px-3 py-3">Actor</th>
                                <th className="px-3 py-3">Summary</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {rows.map(row => {
                                const isOpen = expanded[row.id];
                                const isDenial = row.action?.toLowerCase() === 'access_denied';
                                return (
                                    <tr key={row.id} className="align-top">
                                        <td className="px-3 py-3">
                                            <button
                                                type="button"
                                                onClick={() => setExpanded(prev => ({ ...prev, [row.id]: !prev[row.id] }))}
                                                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                aria-label={isOpen ? 'Collapse row' : 'Expand row'}
                                            >
                                                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                            </button>
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-3 text-slate-600 dark:text-slate-300">{formatDate(row.created_at)}</td>
                                        <td className="px-3 py-3">
                                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${isDenial ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
                                                {row.action}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 text-slate-700 dark:text-slate-200">
                                            <div className="font-medium">{row.entity_type}</div>
                                            <div className="max-w-[240px] truncate text-xs text-slate-500">{row.entity_id || row.entity_uuid || '-'}</div>
                                        </td>
                                        <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                                            <div>{row.user_email || '-'}</div>
                                            <div className="max-w-[220px] truncate text-xs text-slate-500">{row.user_id || ''}</div>
                                        </td>
                                        <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                                            {row.change_summary || row.details?.reason || '-'}
                                            {isOpen && (
                                                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                                                    <JsonPanel title="Before" value={row.before_state} />
                                                    <JsonPanel title="After" value={row.after_state} />
                                                    <JsonPanel title="Details" value={row.details} highlightReason={isDenial} />
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {!loading && rows.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-3 py-12 text-center text-sm text-slate-500">No audit entries match these filters.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
                    <span className="text-slate-500">Page {page} of {pages} - {total} entries</span>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={filters.offset === 0 || loading} onClick={() => updateFilter('offset', Math.max(0, filters.offset - filters.limit))}>Previous</Button>
                        <Button variant="outline" size="sm" disabled={filters.offset + filters.limit >= total || loading} onClick={() => updateFilter('offset', filters.offset + filters.limit)}>Next</Button>
                    </div>
                </div>
            </section>
        </div>
    );
}
