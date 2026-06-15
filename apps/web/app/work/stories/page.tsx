'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { projectsApi, userStoriesApi, type Project, type UserStory } from '@/lib/api';
import { useAuth } from '@/components/providers/AuthProvider';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { ViewToggle } from '@/components/tasks/ViewToggle';
import { SyncBadge } from '@/components/shared/SyncBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusControl } from '@/components/shared/StatusControl';
import { BulkStatusActionBar } from '@/components/shared/BulkStatusActionBar';
import { useToast } from '@/components/ui/Toast';
import { canEditStatus, storyStatusRegistry } from '@/lib/statusRegistry';

const PRIORITY_OPTIONS = ['P1-Critical', 'P2-High', 'P3-Medium', 'P4-Low', 'None'];

const BULK_SELECTION_LIMIT = 50;
const BULK_STATUS_CONCURRENCY = 5;

const PRIORITY_PILL: Record<string, string> = {
    'P1-Critical': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    'P2-High':     'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    'P3-Medium':   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    'P4-Low':      'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    None:          'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
};

const STORY_BOARD_COLUMNS = storyStatusRegistry.statuses.map(status => {
    const option = storyStatusRegistry.getOption(status);
    return {
        status,
        label: option.label,
        badge: option.pillClass,
        border: option.borderClass || 'border-slate-300 dark:border-slate-600',
    };
});

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

function getBulkErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'unknown error';
}

async function runWithConcurrency<T, R>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<R>
) {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            results[currentIndex] = await worker(items[currentIndex]);
        }
    });
    await Promise.all(workers);
    return results;
}

function SelectAllCheckbox({
    checked,
    indeterminate,
    disabled,
    onChange,
}: {
    checked: boolean;
    indeterminate: boolean;
    disabled: boolean;
    onChange: (checked: boolean) => void;
}) {
    const ref = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (ref.current) ref.current.indeterminate = indeterminate;
    }, [indeterminate]);

    return (
        <input
            ref={ref}
            type="checkbox"
            aria-label="Select all filtered stories"
            checked={checked}
            disabled={disabled}
            onChange={event => onChange(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        />
    );
}

export default function UserStoriesPage() {
    const router = useRouter();
    const { hasPermission } = useAuth();
    const toast = useToast();
    const [stories, setStories] = useState<UserStory[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProject, setSelectedProject] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [selectedPriority, setSelectedPriority] = useState('');
    const [selectedStoryIds, setSelectedStoryIds] = useState<Set<string>>(new Set());
    const [isApplyingBulkStatus, setIsApplyingBulkStatus] = useState(false);

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

    const patchStory = (storyId: string, patch: Partial<UserStory>) => {
        setStories(prev => prev.map(story => story.id === storyId ? { ...story, ...patch } : story));
    };

    const handleStatusCommitted = (storyId: string, _nextStatus: string, updated: unknown) => {
        if (!updated || typeof updated !== 'object') return;
        const next = updated as Partial<UserStory>;
        setStories(prev => prev.map(story => (
            story.id === storyId ? { ...story, ...next, _can: next._can ?? story._can } : story
        )));
    };

    const hasStoryStatusEditPermission = hasPermission(storyStatusRegistry.editPermission);

    const loadStories = async () => {
        setIsLoading(true);
        try {
            const [storiesData, projectsData] = await Promise.all([
                userStoriesApi.list({ limit: 200 }),
                projectsApi.list().catch(() => []),
            ]);
            setStories(storiesData.data ?? []);
            setProjects(Array.isArray(projectsData) ? projectsData : []);
            setLoadError(null);
        } catch (err: any) {
            console.error(err);
            setLoadError(err.message || 'Failed to load user stories');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadStories();
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
            if (selectedStatus && storyStatusRegistry.normalize(story.status || '') !== selectedStatus) return false;
            if (selectedPriority && story.priority !== selectedPriority) return false;
            return true;
        });
    }, [stories, searchTerm, selectedProject, selectedStatus, selectedPriority]);

    useEffect(() => {
        const visibleStoryIds = new Set(filtered.map(story => story.id));
        setSelectedStoryIds(prev => {
            let changed = false;
            const next = new Set<string>();
            prev.forEach(id => {
                if (visibleStoryIds.has(id)) {
                    next.add(id);
                } else {
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [filtered]);

    const stats = useMemo(() => ({
        total:       stories.length,
        approved:    stories.filter(s => storyStatusRegistry.normalize(s.status || '') === 'Approved').length,
        review:      stories.filter(s => storyStatusRegistry.normalize(s.status || '') === 'Review').length,
        highPriority: stories.filter(s => s.priority === 'P1-Critical' || s.priority === 'P2-High').length,
    }), [stories]);

    const hasAnyFilter = !!(searchTerm || selectedProject || selectedStatus || selectedPriority);
    const storyById = useMemo(() => new Map(stories.map(story => [story.id, story])), [stories]);
    const selectedStories = useMemo(
        () => Array.from(selectedStoryIds)
            .map(id => storyById.get(id))
            .filter((story): story is UserStory => Boolean(story)),
        [selectedStoryIds, storyById]
    );

    const isStorySelectable = (story: UserStory) => canEditStatus(story._can?.edit, hasStoryStatusEditPermission);

    const handleToggleStorySelection = (storyId: string, selected: boolean) => {
        const story = storyById.get(storyId);
        if (!story) return;
        if (selected && !isStorySelectable(story)) {
            toast.warning("You don't have permission to select this story");
            return;
        }
        if (selected && !selectedStoryIds.has(storyId) && selectedStoryIds.size >= BULK_SELECTION_LIMIT) {
            toast.warning(`Selection is limited to ${BULK_SELECTION_LIMIT} stories`);
            return;
        }
        setSelectedStoryIds(prev => {
            const next = new Set(prev);
            if (selected) {
                next.add(storyId);
            } else {
                next.delete(storyId);
            }
            return next;
        });
    };

    const handleToggleAllSelection = (selected: boolean) => {
        if (!selected) {
            setSelectedStoryIds(new Set());
            return;
        }

        const selectableIds = filtered
            .filter(story => isStorySelectable(story))
            .map(story => story.id);
        const cappedIds = selectableIds.slice(0, BULK_SELECTION_LIMIT);
        setSelectedStoryIds(new Set(cappedIds));
        if (selectableIds.length > BULK_SELECTION_LIMIT) {
            toast.warning(`Selected the first ${BULK_SELECTION_LIMIT} editable stories. Refine filters to update more.`);
        }
    };

    const handleBulkStatusApply = async (nextStatus: string) => {
        if (selectedStories.length === 0 || isApplyingBulkStatus) return;

        const normalizedStatus = storyStatusRegistry.normalize(nextStatus);
        const candidates = selectedStories.slice(0, BULK_SELECTION_LIMIT);
        const previousStatuses = new Map(candidates.map(story => [story.id, storyStatusRegistry.normalize(story.status || '')]));
        const editableStories: UserStory[] = [];
        const failureReasons: string[] = [];

        candidates.forEach(story => {
            if (isStorySelectable(story)) {
                editableStories.push(story);
            } else {
                failureReasons.push('no permission');
            }
        });

        editableStories.forEach(story => {
            patchStory(story.id, { status: normalizedStatus });
        });

        setIsApplyingBulkStatus(true);
        try {
            const results = await runWithConcurrency(editableStories, BULK_STATUS_CONCURRENCY, async (story) => {
                const previousStatus = previousStatuses.get(story.id) || storyStatusRegistry.normalize(story.status || '');
                const payload = storyStatusRegistry.defaultFills?.(normalizedStatus, { previousStatus }) || {};
                try {
                    const updated = await storyStatusRegistry.update(story.id, normalizedStatus, payload);
                    return { story, ok: true as const, updated };
                } catch (error) {
                    return { story, ok: false as const, error };
                }
            });

            let updatedCount = 0;
            let failedCount = failureReasons.length;

            results.forEach(result => {
                if (result.ok) {
                    updatedCount += 1;
                    handleStatusCommitted(result.story.id, normalizedStatus, result.updated);
                    return;
                }
                failedCount += 1;
                failureReasons.push(getBulkErrorMessage(result.error));
                const previousStatus = previousStatuses.get(result.story.id) || storyStatusRegistry.normalize(result.story.status || '');
                patchStory(result.story.id, { status: previousStatus });
            });

            const distinctReasons = Array.from(new Set(failureReasons.filter(Boolean)));
            const reasonSuffix = distinctReasons.length > 0 ? ` (${distinctReasons.slice(0, 2).join(', ')})` : '';
            if (failedCount === 0) {
                toast.success(`${updatedCount} updated`);
            } else if (updatedCount > 0) {
                toast.warning(`${updatedCount} updated, ${failedCount} failed${reasonSuffix}`);
            } else {
                toast.error(`0 updated, ${failedCount} failed${reasonSuffix}`);
            }
            setSelectedStoryIds(new Set());
        } finally {
            setIsApplyingBulkStatus(false);
        }
    };

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
                            {isLoading ? (
                                <Skeleton className="mt-1 h-7 w-12" />
                            ) : (
                                <div className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">{s.value}</div>
                            )}
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
                    {storyStatusRegistry.statuses.map(s => {
                        const option = storyStatusRegistry.getOption(s);
                        return <option key={s} value={s}>{option.label}</option>;
                    })}
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

            {/* ── Error banner ────────────────────────────────────────── */}
            {loadError && (
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl p-4 flex items-center gap-3">
                    <svg className="w-5 h-5 text-rose-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                        <p className="text-sm font-medium text-rose-800 dark:text-rose-300">Failed to load user stories</p>
                        <p className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">{loadError}</p>
                    </div>
                    <button onClick={loadStories} className="ml-auto text-xs text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 font-medium underline">
                        Retry
                    </button>
                </div>
            )}

            {/* ── Table / Board ──────────────────────────────────────── */}
            {viewMode === 'board' ? (
                <StoriesBoardView
                    stories={filtered}
                    isLoading={isLoading}
                    onStoryClick={(id) => router.push(`/work/stories/${id}`)}
                />
            ) : (
                <>
                    <BulkStatusActionBar
                        artifactType="user_story"
                        selectedCount={selectedStoryIds.size}
                        isApplying={isApplyingBulkStatus}
                        onApplyStatus={handleBulkStatusApply}
                        onClear={() => setSelectedStoryIds(new Set())}
                    />
                    <StoriesTableView
                        stories={filtered}
                        isLoading={isLoading}
                        hasStatusEditPermission={hasStoryStatusEditPermission}
                        selectedStoryIds={selectedStoryIds}
                        selectionLimit={BULK_SELECTION_LIMIT}
                        onToggleStorySelection={handleToggleStorySelection}
                        onToggleAllSelection={handleToggleAllSelection}
                        onStatusOptimisticChange={(storyId, nextStatus) => patchStory(storyId, { status: nextStatus })}
                        onStatusCommitted={handleStatusCommitted}
                        onStatusRolledBack={(storyId, previousStatus) => patchStory(storyId, { status: previousStatus })}
                        onDelete={(id) => setStories(prev => prev.filter(s => s.id !== id))}
                    />
                </>
            )}
        </div>
    );
}

// ── Table view ────────────────────────────────────────────────────────────────

function StoriesTableView({
    stories,
    isLoading,
    hasStatusEditPermission,
    selectedStoryIds,
    selectionLimit,
    onToggleStorySelection,
    onToggleAllSelection,
    onStatusOptimisticChange,
    onStatusCommitted,
    onStatusRolledBack,
    onDelete,
}: {
    stories: UserStory[];
    isLoading: boolean;
    hasStatusEditPermission: boolean;
    selectedStoryIds: ReadonlySet<string>;
    selectionLimit: number;
    onToggleStorySelection: (storyId: string, selected: boolean) => void;
    onToggleAllSelection: (selected: boolean) => void;
    onStatusOptimisticChange: (storyId: string, nextStatus: string, previousStatus: string) => void;
    onStatusCommitted: (storyId: string, nextStatus: string, updated: unknown) => void;
    onStatusRolledBack: (storyId: string, previousStatus: string, nextStatus: string, error: unknown) => void;
    onDelete?: (id: string) => void;
}) {
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState<UserStory | null>(null);
    const selectableStoryIds = useMemo(
        () => stories
            .filter(story => canEditStatus(story._can?.edit, hasStatusEditPermission))
            .map(story => story.id),
        [stories, hasStatusEditPermission]
    );
    const cappedSelectableStoryIds = useMemo(
        () => selectableStoryIds.slice(0, selectionLimit),
        [selectableStoryIds, selectionLimit]
    );
    const selectedVisibleCount = cappedSelectableStoryIds.filter(id => selectedStoryIds.has(id)).length;
    const allVisibleSelected = cappedSelectableStoryIds.length > 0 && selectedVisibleCount === cappedSelectableStoryIds.length;
    const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;
    const selectionAtLimit = selectedStoryIds.size >= selectionLimit;

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
                    <table className="w-full text-sm us-table-scroll" style={{ minWidth: 1060 }}>
                        <thead>
                            <tr className="bg-slate-50/60 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800">
                                <th className="text-left pl-5 pr-3 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400 sticky left-0 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-sm" style={{ minWidth: 48 }}>
                                    <SelectAllCheckbox
                                        checked={allVisibleSelected}
                                        indeterminate={someVisibleSelected}
                                        disabled={cappedSelectableStoryIds.length === 0}
                                        onChange={onToggleAllSelection}
                                    />
                                </th>
                                <th className="text-left px-3 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400">ID</th>
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
                                Array.from({ length: 6 }).map((_, rowIndex) => (
                                    <tr key={rowIndex}>
                                        <td className="pl-5 pr-3 py-3.5 sticky left-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm">
                                            <Skeleton className="h-4 w-4 rounded" />
                                        </td>
                                        <td className="px-3 py-3.5">
                                            <Skeleton className="h-5 w-14" />
                                        </td>
                                        <td className="px-3 py-3.5" style={{ minWidth: 280, maxWidth: 360 }}>
                                            <Skeleton className="h-5 w-64 max-w-full" />
                                        </td>
                                        <td className="px-3 py-3.5"><Skeleton className="h-5 w-28" /></td>
                                        <td className="px-3 py-3.5"><Skeleton className="h-5 w-20 rounded-full" /></td>
                                        <td className="px-3 py-3.5"><Skeleton className="h-5 w-24 rounded-full" /></td>
                                        <td className="px-3 py-3.5"><Skeleton className="h-5 w-10" /></td>
                                        <td className="pl-3 pr-5 py-3.5"><Skeleton className="ml-auto h-5 w-16" /></td>
                                    </tr>
                                ))
                            ) : stories.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-5 py-12 text-center text-slate-400">No user stories found.</td>
                                </tr>
                            ) : stories.map(story => {
                                const canEdit = story._can?.edit !== false;
                                const canDelete = story._can?.delete !== false;
                                const selected = selectedStoryIds.has(story.id);
                                const selectable = canEditStatus(story._can?.edit, hasStatusEditPermission);
                                const disabledReason = !selectable
                                    ? "You don't have permission to select this story"
                                    : !selected && selectionAtLimit
                                        ? `Selection is limited to ${selectionLimit} stories`
                                        : '';
                                const displayId = story.tuleap_artifact_id ? `#${story.tuleap_artifact_id}` : story.id.slice(0, 8);
                                return (
                                <tr key={story.id} data-testid={`story-row-${story.id}`} className="hover:bg-violet-50/40 dark:hover:bg-violet-900/10 transition-colors group">
                                    <td className="pl-5 pr-3 py-3.5 sticky left-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm group-hover:bg-violet-50/95 dark:group-hover:bg-violet-900/20">
                                        <input
                                            type="checkbox"
                                            data-testid={`select-story-${story.id}`}
                                            aria-label={`Select story ${displayId}`}
                                            checked={selected}
                                            disabled={Boolean(disabledReason)}
                                            onChange={event => onToggleStorySelection(story.id, event.target.checked)}
                                            title={disabledReason || undefined}
                                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                                        />
                                    </td>
                                    <td className="px-3 py-3.5 whitespace-nowrap">
                                        <span className="font-mono text-xs font-semibold text-violet-600 dark:text-violet-300">
                                            {displayId}
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
                                        <StatusControl
                                            artifactType="user_story"
                                            artifactId={story.id}
                                            value={story.status || 'Draft'}
                                            canEdit={story._can?.edit}
                                            hasFallbackPermission={hasStatusEditPermission}
                                            onOptimisticChange={(next, previous) => onStatusOptimisticChange(story.id, next, previous)}
                                            onChangeCommitted={(next, updated) => onStatusCommitted(story.id, next, updated)}
                                            onChangeRolledBack={(previous, next, error) => onStatusRolledBack(story.id, previous, next, error)}
                                        />
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
        const groups = Object.fromEntries(storyStatusRegistry.statuses.map(status => [status, [] as UserStory[]])) as Record<string, UserStory[]>;
        stories.forEach(story => {
            const key = storyStatusRegistry.normalize(story.status || '');
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
                        <Skeleton className="h-10 rounded-xl" />
                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
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
