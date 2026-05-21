'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { projectsApi, userStoriesApi, type Project, type UserStory } from '@/lib/api';
import { useAuth } from '@/components/providers/AuthProvider';
import { ViewToggle } from '@/components/tasks/ViewToggle';
import { Button } from '@/components/ui/Button';

const STATUS_OPTIONS = ['Draft', 'Changes', 'Review', 'Approved'];
const PRIORITY_OPTIONS = ['P1-Critical', 'P2-High', 'P3-Medium', 'P4-Low', 'None'];

const STATUS_BADGE: Record<string, string> = {
    Draft: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
    Changes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    Review: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
    Approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
};

const PRIORITY_BADGE: Record<string, string> = {
    'P1-Critical': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    'P2-High': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    'P3-Medium': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    'P4-Low': 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
    None: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
};

const STORY_BOARD_COLUMNS = [
    { status: 'Draft', label: 'Draft', badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400', border: 'border-sky-300 dark:border-sky-700' },
    { status: 'Changes', label: 'Changes', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', border: 'border-amber-300 dark:border-amber-600' },
    { status: 'Review', label: 'Review', badge: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400', border: 'border-slate-300 dark:border-slate-600' },
    { status: 'Approved', label: 'Approved', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', border: 'border-emerald-300 dark:border-emerald-600' },
];

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
                const matches =
                    story.title.toLowerCase().includes(lower) ||
                    story.project_name?.toLowerCase().includes(lower) ||
                    String(story.tuleap_artifact_id ?? '').includes(lower);

                if (!matches) return false;
            }

            if (selectedProject && story.project_id !== selectedProject) return false;
            if (selectedStatus && story.status !== selectedStatus) return false;
            if (selectedPriority && story.priority !== selectedPriority) return false;

            return true;
        });
    }, [stories, searchTerm, selectedProject, selectedStatus, selectedPriority]);

    const clearFilters = () => {
        setSearchTerm('');
        setSelectedProject('');
        setSelectedStatus('');
        setSelectedPriority('');
    };

    const hasActiveFilters = Boolean(searchTerm || selectedProject || selectedStatus || selectedPriority);

    return (
        <div className="space-y-6 py-6 px-4 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">User Stories</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Manage all user stories across projects.</p>
                </div>
                <div className="flex items-center gap-3">
                    <ViewToggle view={viewMode} onChange={handleViewChange} />
                    {hasPermission('qc.projects.view') && (
                        <Link href="/work/stories/create">
                            <Button className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/30 border-none">
                                + New Story
                            </Button>
                        </Link>
                    )}
                </div>
            </div>

            <div className="glass-card rounded-xl p-4">
                <div className="flex flex-col lg:flex-row gap-4">
                    <div className="relative flex-1 min-w-0">
                        <input
                            type="text"
                            placeholder="Search stories by title, ID, project..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all outline-none"
                        />
                        <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative">
                            <select
                                value={selectedProject}
                                onChange={(e) => setSelectedProject(e.target.value)}
                                className="appearance-none pl-3 pr-8 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all outline-none cursor-pointer min-w-[140px]"
                            >
                                <option value="">All Projects</option>
                                {projects.map(project => (
                                    <option key={project.id} value={project.id}>{project.project_name}</option>
                                ))}
                            </select>
                            <svg className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>

                        <div className="relative">
                            <select
                                value={selectedStatus}
                                onChange={(e) => setSelectedStatus(e.target.value)}
                                className="appearance-none pl-3 pr-8 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all outline-none cursor-pointer min-w-[130px]"
                            >
                                <option value="">All Statuses</option>
                                {STATUS_OPTIONS.map(status => (
                                    <option key={status} value={status}>{status}</option>
                                ))}
                            </select>
                            <svg className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>

                        <div className="relative">
                            <select
                                value={selectedPriority}
                                onChange={(e) => setSelectedPriority(e.target.value)}
                                className="appearance-none pl-3 pr-8 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all outline-none cursor-pointer min-w-[130px]"
                            >
                                <option value="">All Priorities</option>
                                {PRIORITY_OPTIONS.map(priority => (
                                    <option key={priority} value={priority}>{priority}</option>
                                ))}
                            </select>
                            <svg className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>

                        {hasActiveFilters && (
                            <button
                                onClick={clearFilters}
                                className="px-3 py-2 text-sm text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors flex items-center gap-1"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Clear
                            </button>
                        )}
                    </div>
                </div>

                {hasActiveFilters && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Active:</span>
                        {searchTerm && (
                            <span className="px-2 py-1 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs rounded-md">
                                Search: &quot;{searchTerm}&quot;
                            </span>
                        )}
                        {selectedProject && (
                            <span className="px-2 py-1 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs rounded-md">
                                Project: {projects.find(project => project.id === selectedProject)?.project_name}
                            </span>
                        )}
                        {selectedStatus && (
                            <span className="px-2 py-1 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs rounded-md">
                                Status: {selectedStatus}
                            </span>
                        )}
                        {selectedPriority && (
                            <span className="px-2 py-1 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs rounded-md">
                                Priority: {selectedPriority}
                            </span>
                        )}
                        <span className="text-xs text-slate-400 ml-2">
                            ({filtered.length} of {stories.length} stories)
                        </span>
                    </div>
                )}
            </div>

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
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
                <div>
                    <h2 className="font-semibold text-slate-900 dark:text-white">All User Stories</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{stories.length} rows</p>
                </div>
                <div className="hidden md:flex items-center gap-2 text-xs text-slate-400">
                    <span>Scroll to see all columns</span>
                </div>
            </div>
            <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>
                <style jsx>{`
                    .bugs-table-scroll::-webkit-scrollbar {
                        height: 8px;
                    }
                    .bugs-table-scroll::-webkit-scrollbar-track {
                        background: transparent;
                    }
                    .bugs-table-scroll::-webkit-scrollbar-thumb {
                        background-color: #cbd5e1;
                        border-radius: 999px;
                    }
                    .dark .bugs-table-scroll::-webkit-scrollbar-thumb {
                        background-color: #475569;
                    }
                `}</style>
                <table className="w-full text-sm bugs-table-scroll" style={{ minWidth: 1000 }}>
                    <thead>
                        <tr className="bg-slate-50/60 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800">
                            <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400 sticky left-0 z-10 bg-slate-50 dark:bg-slate-900">ID</th>
                            <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400">Title</th>
                            <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400">Project</th>
                            <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400">Status</th>
                            <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400">Priority</th>
                            <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400">Points</th>
                            <th className="text-right px-5 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                        {isLoading ? (
                            <tr>
                                <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                                    Loading user stories...
                                </td>
                            </tr>
                        ) : stories.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                                    No user stories found.
                                </td>
                            </tr>
                        ) : stories.map(story => (
                            <tr key={story.id} className="group hover:bg-violet-50/40 dark:hover:bg-violet-950/10 transition-colors">
                                <td className="px-5 py-3.5 sticky left-0 z-10 bg-white dark:bg-slate-900 group-hover:bg-violet-50 dark:group-hover:bg-slate-900">
                                    <span className="font-mono text-xs text-slate-400">
                                        {story.tuleap_artifact_id ? `#${story.tuleap_artifact_id}` : '-'}
                                    </span>
                                </td>
                                <td className="px-5 py-3.5">
                                    <Link
                                        href={`/work/stories/${story.id}`}
                                        className="font-medium text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors line-clamp-1"
                                    >
                                        {story.title || <span className="text-slate-400 italic">Untitled</span>}
                                    </Link>
                                </td>
                                <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400 text-sm truncate max-w-[180px]">
                                    {story.project_name ?? '-'}
                                </td>
                                <td className="px-5 py-3.5">
                                    {story.status ? (
                                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[story.status] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`}>
                                            {story.status}
                                        </span>
                                    ) : '-'}
                                </td>
                                <td className="px-5 py-3.5">
                                    {story.priority && story.priority !== 'None' ? (
                                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PRIORITY_BADGE[story.priority] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`}>
                                            {story.priority}
                                        </span>
                                    ) : (
                                        <span className="text-slate-300 dark:text-slate-600">-</span>
                                    )}
                                </td>
                                <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400 text-sm">
                                    {story.story_points ?? '-'}
                                </td>
                                <td className="px-5 py-3.5 text-right">
                                    <div className="flex items-center justify-end gap-3">
                                        <Link
                                            href={`/work/stories/${story.tuleap_artifact_id || story.id}/edit`}
                                            className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium transition-colors"
                                        >
                                            Edit
                                        </Link>
                                        <button
                                            onClick={() => setPendingDelete(story)}
                                            disabled={deletingId === story.id}
                                            className="text-xs text-rose-500 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 font-medium transition-colors disabled:opacity-40"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
                <span>
                    Showing <span className="font-medium text-slate-700 dark:text-slate-300">{isLoading ? 0 : stories.length}</span> of {isLoading ? 0 : stories.length}
                </span>
            </div>

            {pendingDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
                        <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">Delete User Story</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
                            Delete &quot;{pendingDelete.title || 'Untitled'}&quot;?
                            {pendingDelete.tuleap_artifact_id && (
                                <span className="block mt-1 text-rose-500 dark:text-rose-400">This will also delete the artifact from Tuleap.</span>
                            )}
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setPendingDelete(null)}
                                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={deletingId !== null}
                                className="px-4 py-2 text-sm font-medium bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors disabled:opacity-50"
                            >
                                {deletingId ? 'Deleting…' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function StoriesBoardView({
    stories,
    isLoading,
    onStoryClick,
}: {
    stories: UserStory[];
    isLoading: boolean;
    onStoryClick: (id: string) => void;
}) {
    const grouped = useMemo(() => {
        const groups: Record<string, UserStory[]> = { Draft: [], Changes: [], Review: [], Approved: [] };

        stories.forEach(story => {
            const key = story.status ?? 'Draft';
            if (groups[key]) {
                groups[key].push(story);
            } else {
                groups.Draft.push(story);
            }
        });

        return groups;
    }, [stories]);

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {STORY_BOARD_COLUMNS.map(column => (
                    <div key={column.status} className="space-y-3">
                        <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
                        {[1, 2, 3].map(index => (
                            <div key={index} className="h-24 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
                        ))}
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {STORY_BOARD_COLUMNS.map(column => {
                const columnStories = grouped[column.status] || [];

                return (
                    <div key={column.status} className="flex flex-col">
                        <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 border-t-2 ${column.border} px-4 py-2.5 rounded-xl mb-3 flex items-center justify-between`}>
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{column.label}</span>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${column.badge}`}>{columnStories.length}</span>
                        </div>
                        <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-320px)]">
                            {columnStories.length === 0 ? (
                                <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-5 text-center">
                                    <p className="text-sm text-slate-400">No stories</p>
                                </div>
                            ) : columnStories.map(story => (
                                <div
                                    key={story.id}
                                    onClick={() => onStoryClick(story.id)}
                                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm transition-all"
                                >
                                    <p className="text-sm font-medium text-slate-900 dark:text-white line-clamp-2 leading-snug mb-2">{story.title}</p>
                                    {story.project_name && (
                                        <p className="text-xs text-slate-400 mb-2 truncate">{story.project_name}</p>
                                    )}
                                    <div className="flex items-center justify-between gap-2">
                                        {story.priority && story.priority !== 'None' ? (
                                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${PRIORITY_BADGE[story.priority] ?? ''}`}>
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
