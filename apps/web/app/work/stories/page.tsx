'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { projectsApi, userStoriesApi, type Project, type UserStory } from '@/lib/api';
import { useAuth } from '@/components/providers/AuthProvider';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { ViewToggle } from '@/components/tasks/ViewToggle';
import { SyncBadge } from '@/components/shared/SyncBadge';

const STATUS_OPTIONS = ['Draft', 'Changes', 'Review', 'Approved'];
const PRIORITY_OPTIONS = ['P1-Critical', 'P2-High', 'P3-Medium', 'P4-Low', 'None'];

const STATUS_PILL: Record<string, string> = {
    Draft:    'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    Changes:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    Review:   'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    Approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
};

const PRIORITY_PILL: Record<string, string> = {
    'P1-Critical': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    'P2-High':     'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    'P3-Medium':   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    'P4-Low':      'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    None:          'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
};

const STORY_BOARD_COLUMNS = [
    { status: 'Draft',    label: 'Draft',    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',       border: 'border-sky-300 dark:border-sky-700' },
    { status: 'Changes',  label: 'Changes',  badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', border: 'border-amber-300 dark:border-amber-600' },
    { status: 'Review',   label: 'Review',   badge: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',   border: 'border-slate-300 dark:border-slate-600' },
    { status: 'Approved', label: 'Approved', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', border: 'border-emerald-300 dark:border-emerald-600' },
];

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
    return (
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
            {children}
        </span>
    );
}

function GlassSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
    return (
        <div className="relative">
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                className="appearance-none h-10 pl-3.5 pr-8 rounded-lg bg-white/70 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/50 dark:border-slate-700/50 text-sm text-slate-600 dark:text-slate-300 hover:border-violet-400/60 transition-colors focus:outline-none focus:border-violet-500 cursor-pointer"
            >
                {children}
            </select>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <path d="M6 9l6 6 6-6" />
            </svg>
        </div>
    );
}

export default function UserStoriesPage() {
    const router = useRouter();
    const { hasPermission } = useAuth();
    const [stories, setStories] = useState<UserStory[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProject, setSelectedProject] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [selectedPriority, setSelectedPriority] = useState('');

    const [viewMode, setViewMode] = useState<'table' | 'board'>(() => {
        if (typeof window !== 'undefined') {
            return (localStorage.getItem('stories_view_mode') as 'table' | 'board') || 'table';
        }
        return 'table';
    });

    const handleViewChange = (mode: 'table' | 'board') => {
        setViewMode(mode);
        if (typeof window !== 'undefined') localStorage.setItem('stories_view_mode', mode);
    };

    useEffect(() => {
        async function load() {
            try {
                const [storiesData, projectsData] = await Promise.all([
                    userStoriesApi.list({ limit: 200 }),
                    projectsApi.list().catch(() => []),
                ]);
                setStories(storiesData.data ?? []);
                setProjects(Array.isArray(projectsData) ? projectsData : []);
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }
        load();
    }, []);

    const filtered = useMemo(() => {
        return stories.filter(story => {
            if (searchTerm) {
                const lower = searchTerm.toLowerCase();
                if (
                    !story.title.toLowerCase().includes(lower) &&
                    !story.project_name?.toLowerCase().includes(lower) &&
                    !String(story.tuleap_artifact_id ?? '').includes(lower)
                ) return false;
            }
            if (selectedProject && story.project_id !== selectedProject) return false;
            if (selectedStatus && story.status !== selectedStatus) return false;
            if (selectedPriority && story.priority !== selectedPriority) return false;
            return true;
        });
    }, [stories, searchTerm, selectedProject, selectedStatus, selectedPriority]);

    const stats = useMemo(() => ({
        total:       stories.length,
        approved:    stories.filter(s => s.status === 'Approved').length,
        review:      stories.filter(s => s.status === 'Review').length,
        highPriority: stories.filter(s => s.priority === 'P1-Critical' || s.priority === 'P2-High').length,
    }), [stories]);

    const hasAnyFilter = !!(searchTerm || selectedProject || selectedStatus || selectedPriority);

    return (
        <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-5">

            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight">User Stories</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                        Manage all user stories across projects · Total{' '}
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{stories.length}</span>
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <ViewToggle view={viewMode} onChange={handleViewChange} />
                    <PermissionGate permission="qc.user_stories.create" fallbackTooltip="Requires editor access to create stories">
                        <Link
                            href="/work/stories/create"
                            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 active:scale-95 transition-all"
                        >
                            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path d="M12 5v14M5 12h14" />
                            </svg>
                            New Story
                        </Link>
                    </PermissionGate>
                </div>
            </div>

            {/* ── Stat strip ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: 'Total',        value: isLoading ? '—' : stats.total,        dot: 'bg-slate-400' },
                    { label: 'Approved',     value: isLoading ? '—' : stats.approved,     dot: 'bg-emerald-500' },
                    { label: 'In Review',    value: isLoading ? '—' : stats.review,       dot: 'bg-indigo-500' },
                    { label: 'High Priority', value: isLoading ? '—' : stats.highPriority, dot: 'bg-rose-500' },
                ].map(s => (
                    <div key={s.label} className="glass-card rounded-xl px-4 py-3 flex items-center justify-between">
                        <div>
                            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{s.label}</div>
                            <div className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">{s.value}</div>
                        </div>
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.dot}`} />
                    </div>
                ))}
            </div>

            {/* ── Filter bar ─────────────────────────────────────────── */}
            <div className="glass-card rounded-2xl p-3 flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[240px]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                        <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                    </svg>
                    <input
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Search title, ID, project…"
                        className="w-full h-10 pl-10 pr-4 rounded-lg bg-white/70 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/50 dark:border-slate-700/50 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 transition-colors"
                    />
                </div>
                <GlassSelect value={selectedProject} onChange={setSelectedProject}>
                    <option value="">All Projects</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                </GlassSelect>
                <GlassSelect value={selectedStatus} onChange={setSelectedStatus}>
                    <option value="">All Statuses</option>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </GlassSelect>
                <GlassSelect value={selectedPriority} onChange={setSelectedPriority}>
                    <option value="">All Priorities</option>
                    {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </GlassSelect>
                {hasAnyFilter && (
                    <button
                        onClick={() => { setSearchTerm(''); setSelectedProject(''); setSelectedStatus(''); setSelectedPriority(''); }}
                        className="h-10 px-3 rounded-lg text-sm text-slate-500 hover:text-rose-500 dark:text-slate-400 dark:hover:text-rose-400 flex items-center gap-1.5 transition-colors"
                    >
                        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                        Clear
                    </button>
                )}
            </div>

            {/* ── Table / Board ──────────────────────────────────────── */}
            {viewMode === 'board' ? (
                <StoriesBoardView
                    stories={filtered}
                    isLoading={isLoading}
                    onStoryClick={(id) => router.push(`/work/stories/${id}`)}
                />
            ) : (
                <StoriesTableView
                    stories={filtered}
                    isLoading={isLoading}
                    onDelete={(id) => setStories(prev => prev.filter(s => s.id !== id))}
                />
            )}
        </div>
    );
}

// ── Table view ────────────────────────────────────────────────────────────────

function StoriesTableView({ stories, isLoading, onDelete }: { stories: UserStory[]; isLoading: boolean; onDelete?: (id: string) => void }) {
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState<UserStory | null>(null);

    async function confirmDelete() {
        if (!pendingDelete) return;
        setDeletingId(pendingDelete.id);
        try {
            await userStoriesApi.delete(pendingDelete.id);
            onDelete?.(pendingDelete.id);
        } catch (err) {
            console.error(err);
        } finally {
            setDeletingId(null);
            setPendingDelete(null);
        }
    }

    return (
        <>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">All User Stories</h2>
                        <span className="text-xs text-slate-400 tabular-nums">{stories.length} rows</span>
                    </div>
                    <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-400">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 12h14M13 5l7 7-7 7" />
                        </svg>
                        Scroll to see all columns
                    </div>
                </div>
                <div
                    className="overflow-x-auto"
                    style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(124,58,237,0.25) transparent' }}
                >
                    <style>{`
                        .us-table-scroll::-webkit-scrollbar { height: 10px; }
                        .us-table-scroll::-webkit-scrollbar-track { background: transparent; }
                        .us-table-scroll::-webkit-scrollbar-thumb { background: rgba(124,58,237,0.25); border-radius: 5px; }
                        .us-table-scroll::-webkit-scrollbar-thumb:hover { background: rgba(124,58,237,0.5); }
                    `}</style>
                    <table className="w-full text-sm us-table-scroll" style={{ minWidth: 1000 }}>
                        <thead>
                            <tr className="bg-slate-50/60 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800">
                                <th className="text-left pl-5 pr-3 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400 sticky left-0 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-sm" style={{ minWidth: 80 }}>ID</th>
                                <th className="text-left px-3 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400">Title</th>
                                <th className="text-left px-3 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400">Project</th>
                                <th className="text-left px-3 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400">Status</th>
                                <th className="text-left px-3 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400">Priority</th>
                                <th className="text-left px-3 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400">Points</th>
                                <th className="text-left pl-3 pr-5 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={7} className="px-5 py-12 text-center text-slate-400">Loading…</td>
                                </tr>
                            ) : stories.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-5 py-12 text-center text-slate-400">No user stories found.</td>
                                </tr>
                            ) : stories.map(story => {
                                const canEdit = story._can?.edit !== false;
                                const canDelete = story._can?.delete !== false;
                                return (
                                <tr key={story.id} className="hover:bg-violet-50/40 dark:hover:bg-violet-900/10 transition-colors group">
                                    <td className="pl-5 pr-3 py-3.5 sticky left-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm group-hover:bg-violet-50/95 dark:group-hover:bg-violet-900/20">
                                        <span className="font-mono text-xs font-semibold text-violet-600 dark:text-violet-300">
                                            {story.tuleap_artifact_id ? `#${story.tuleap_artifact_id}` : '—'}
                                        </span>
                                    </td>
                                    <td className="px-3 py-3.5" style={{ minWidth: 280, maxWidth: 360 }}>
                                        <Link
                                            href={`/work/stories/${story.id}`}
                                            className="font-medium text-slate-800 dark:text-slate-100 hover:text-violet-700 dark:hover:text-violet-300 transition-colors truncate block"
                                        >
                                            {story.title || <span className="text-slate-400 italic">Untitled</span>}
                                        </Link>
                                        <SyncBadge status={story.sync_status} lastAttemptedAt={story.last_sync_attempted_at} error={story.last_sync_error} />
                                    </td>
                                    <td className="px-3 py-3.5 whitespace-nowrap">
                                        <span className="text-slate-600 dark:text-slate-300 font-medium text-sm">{story.project_name ?? '—'}</span>
                                    </td>
                                    <td className="px-3 py-3.5 whitespace-nowrap">
                                        {story.status ? (
                                            <Pill tone={STATUS_PILL[story.status] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}>
                                                {story.status}
                                            </Pill>
                                        ) : '—'}
                                    </td>
                                    <td className="px-3 py-3.5 whitespace-nowrap">
                                        {story.priority && story.priority !== 'None' ? (
                                            <Pill tone={PRIORITY_PILL[story.priority] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}>
                                                {story.priority}
                                            </Pill>
                                        ) : (
                                            <span className="text-slate-300 dark:text-slate-600">—</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-3.5 whitespace-nowrap">
                                        <span className="text-slate-500 dark:text-slate-400 text-sm tabular-nums">{story.story_points ?? '—'}</span>
                                    </td>
                                    <td className="pl-3 pr-5 py-3.5 whitespace-nowrap text-right">
                                        <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {canEdit ? (
                                                <Link
                                                    href={`/work/stories/${story.tuleap_artifact_id || story.id}/edit`}
                                                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium transition-colors"
                                                >
                                                    Edit
                                                </Link>
                                            ) : (
                                                <span
                                                    className="text-xs text-slate-300 dark:text-slate-600 font-medium cursor-not-allowed"
                                                    title="You do not have permission to edit this story"
                                                >
                                                    Edit
                                                </span>
                                            )}
                                            <button
                                                onClick={() => canDelete && setPendingDelete(story)}
                                                disabled={deletingId === story.id || !canDelete}
                                                className="p-1.5 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors disabled:opacity-40"
                                                title={canDelete ? 'Delete story' : 'You do not have permission to delete this story'}
                                            >
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2" />
                                                </svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="flex items-center px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                    <span>
                        Showing{' '}
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{isLoading ? 0 : stories.length}</span>{' '}
                        stories
                    </span>
                </div>
            </div>

            {/* ── Delete confirmation modal ─────────────────────────── */}
            {pendingDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 max-w-md w-full mx-4 p-6 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-900 dark:text-white">Delete User Story</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                    Delete &quot;{pendingDelete.title || 'Untitled'}&quot;?
                                </p>
                                {pendingDelete.tuleap_artifact_id && (
                                    <p className="text-xs text-rose-500 dark:text-rose-400 mt-2">This will also delete the artifact from Tuleap.</p>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                onClick={() => setPendingDelete(null)}
                                disabled={deletingId !== null}
                                className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={deletingId !== null}
                                className="px-4 py-2 text-sm rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition-colors"
                            >
                                {deletingId ? 'Deleting…' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// ── Board view ────────────────────────────────────────────────────────────────

function StoriesBoardView({ stories, isLoading, onStoryClick }: { stories: UserStory[]; isLoading: boolean; onStoryClick: (id: string) => void }) {
    const grouped = useMemo(() => {
        const groups: Record<string, UserStory[]> = { Draft: [], Changes: [], Review: [], Approved: [] };
        stories.forEach(story => {
            const key = story.status ?? 'Draft';
            if (groups[key]) groups[key].push(story);
            else groups.Draft.push(story);
        });
        return groups;
    }, [stories]);

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {STORY_BOARD_COLUMNS.map(col => (
                    <div key={col.status} className="space-y-3">
                        <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
                        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />)}
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {STORY_BOARD_COLUMNS.map(col => {
                const colStories = grouped[col.status] || [];
                return (
                    <div key={col.status} className="flex flex-col">
                        <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 border-t-2 ${col.border} px-4 py-2.5 rounded-xl mb-3 flex items-center justify-between`}>
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{col.label}</span>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${col.badge}`}>{colStories.length}</span>
                        </div>
                        <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-320px)]">
                            {colStories.length === 0 ? (
                                <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-5 text-center">
                                    <p className="text-sm text-slate-400">No stories</p>
                                </div>
                            ) : colStories.map(story => (
                                <div
                                    key={story.id}
                                    onClick={() => onStoryClick(story.id)}
                                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm transition-all"
                                >
                                    <p className="text-sm font-medium text-slate-900 dark:text-white line-clamp-2 leading-snug mb-2">
                                        {story.title}
                                        <SyncBadge status={story.sync_status} lastAttemptedAt={story.last_sync_attempted_at} error={story.last_sync_error} />
                                    </p>
                                    {story.project_name && (
                                        <p className="text-xs text-slate-400 mb-2 truncate">{story.project_name}</p>
                                    )}
                                    <div className="flex items-center justify-between gap-2">
                                        {story.priority && story.priority !== 'None' ? (
                                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${PRIORITY_PILL[story.priority] ?? ''}`}>
                                                {story.priority}
                                            </span>
                                        ) : <span />}
                                        {story.story_points != null && (
                                            <span className="text-[10px] text-slate-400">{story.story_points} pts</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
