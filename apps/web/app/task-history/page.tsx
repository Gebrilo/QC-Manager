'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import type { TaskHistory, TaskHistoryAction } from '../../src/types/governance';
import {
    TASK_HISTORY_ACTION_LABELS,
    TASK_HISTORY_ACTION_COLORS
} from '../../src/types/governance';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Project {
    id: string;
    project_name: string;
}

export default function TaskHistoryPage() {
    const [history, setHistory] = useState<TaskHistory[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProject, setSelectedProject] = useState('');
    const [selectedAction, setSelectedAction] = useState<TaskHistoryAction | ''>('');

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        try {
            setIsLoading(true);
            setError(null);

            const [historyRes, projectsRes] = await Promise.all([
                fetch(`${API_BASE}/tuleap-webhook/task-history`),
                fetch(`${API_BASE}/projects`)
            ]);

            if (!historyRes.ok) throw new Error('Failed to fetch task history');

            const historyData = await historyRes.json();
            const projectsData = projectsRes.ok ? await projectsRes.json() : [];

            setHistory(historyData.data || []);
            setProjects(Array.isArray(projectsData) ? projectsData : (projectsData.data ?? []));
        } catch (err: any) {
            console.error('Error loading task history:', err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }

    const filteredHistory = useMemo(() => {
        return history.filter(item => {
            // Search filter
            if (searchTerm) {
                const lower = searchTerm.toLowerCase();
                const matchesSearch =
                    item.task_name.toLowerCase().includes(lower) ||
                    item.new_assignee_name.toLowerCase().includes(lower) ||
                    item.previous_resource_name?.toLowerCase().includes(lower) ||
                    item.project_name?.toLowerCase().includes(lower);
                if (!matchesSearch) return false;
            }

            // Project filter
            if (selectedProject && item.project_id !== selectedProject) {
                return false;
            }

            // Action filter
            if (selectedAction && item.action !== selectedAction) {
                return false;
            }

            return true;
        });
    }, [history, searchTerm, selectedProject, selectedAction]);

    const clearFilters = () => {
        setSearchTerm('');
        setSelectedProject('');
        setSelectedAction('');
    };

    const hasActiveFilters = searchTerm || selectedProject || selectedAction;

    if (isLoading) {
        return (
            <div className="space-y-6 py-6 px-4 max-w-7xl mx-auto">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/4"></div>
                    <div className="h-32 bg-slate-200 dark:bg-slate-700 rounded"></div>
                    <div className="h-64 bg-slate-200 dark:bg-slate-700 rounded"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 py-6 px-4 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <Link
                            href="/tasks"
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Task History</h1>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 ml-8">
                        Tasks rejected or archived due to unknown assignees from Tuleap
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={loadData}
                        className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Refresh
                    </button>
                    <Link
                        href="/governance"
                        className="px-4 py-2 bg-indigo-600 rounded-lg text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
                    >
                        Governance Dashboard
                    </Link>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
                    Error loading task history: {error}
                </div>
            )}

            {/* Info Card */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-sm text-amber-800 dark:text-amber-200">
                        <p className="font-medium">About Task History</p>
                        <p className="mt-1 text-amber-700 dark:text-amber-300">
                            This page shows tasks from Tuleap that were either:
                        </p>
                        <ul className="mt-2 list-disc list-inside space-y-1 text-amber-700 dark:text-amber-300">
                            <li><strong>Rejected (New)</strong> - New tasks assigned to users not in your resources list</li>
                            <li><strong>Reassigned Out</strong> - Existing tasks that were reassigned to unknown users</li>
                        </ul>
                        <p className="mt-2 text-amber-700 dark:text-amber-300">
                            Click on the Tuleap link to view the original task in Tuleap.
                        </p>
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
                <div className="flex flex-col lg:flex-row gap-4">
                    {/* Search Input */}
                    <div className="relative flex-1 min-w-0">
                        <input
                            type="text"
                            placeholder="Search by task name, assignee..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all outline-none"
                        />
                        <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>

                    {/* Filter Dropdowns */}
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Project Filter */}
                        <div className="relative">
                            <select
                                value={selectedProject}
                                onChange={(e) => setSelectedProject(e.target.value)}
                                className="appearance-none pl-3 pr-8 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all outline-none cursor-pointer min-w-[140px]"
                            >
                                <option value="">All Projects</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.project_name}</option>
                                ))}
                            </select>
                            <svg className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>

                        {/* Action Filter */}
                        <div className="relative">
                            <select
                                value={selectedAction}
                                onChange={(e) => setSelectedAction(e.target.value as TaskHistoryAction | '')}
                                className="appearance-none pl-3 pr-8 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all outline-none cursor-pointer min-w-[150px]"
                            >
                                <option value="">All Actions</option>
                                <option value="rejected_new">Rejected (New)</option>
                                <option value="reassigned_out">Reassigned Out</option>
                            </select>
                            <svg className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>

                        {/* Clear Filters */}
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

                {/* Results Count */}
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-sm text-slate-500">
                        Showing {filteredHistory.length} of {history.length} records
                    </span>
                </div>
            </div>

            {/* History Table */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                {filteredHistory.length === 0 ? (
                    <div className="p-12 text-center text-slate-500 dark:text-slate-400">
                        <svg className="w-12 h-12 mx-auto mb-4 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <p className="text-lg font-medium">No task history found</p>
                        <p className="mt-1 text-sm">
                            {hasActiveFilters
                                ? 'Try adjusting your filters'
                                : 'Tasks rejected or archived from Tuleap will appear here'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                                        Task
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                                        Action
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                                        Previous Assignee
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                                        New Assignee
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                                        Date
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                                        Tuleap
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {filteredHistory.map((item) => (
                                    <tr
                                        key={item.id}
                                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                                    >
                                        <td className="px-4 py-4">
                                            <div className="max-w-xs">
                                                <p className="font-medium text-slate-900 dark:text-white truncate">
                                                    {item.task_name}
                                                </p>
                                                {item.project_name && (
                                                    <p className="text-xs text-slate-500 mt-1">
                                                        {item.project_name}
                                                    </p>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${TASK_HISTORY_ACTION_COLORS[item.action]}`}>
                                                {TASK_HISTORY_ACTION_LABELS[item.action]}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                                            {item.previous_resource_name || (
                                                <span className="text-slate-400">N/A</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className="text-sm font-medium text-orange-600 dark:text-orange-400">
                                                {item.new_assignee_name}
                                            </span>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                Not in resources
                                            </p>
                                        </td>
                                        <td className="px-4 py-4 text-sm text-slate-500">
                                            {new Date(item.created_at).toLocaleDateString('en-US', {
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </td>
                                        <td className="px-4 py-4">
                                            {item.tuleap_url ? (
                                                <a
                                                    href={item.tuleap_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 text-sm"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                    </svg>
                                                    View
                                                </a>
                                            ) : (
                                                <span className="text-slate-400 text-sm">-</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Stats Summary */}
            {history.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Records</p>
                        <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{history.length}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Rejected (New)</p>
                        <p className="text-2xl font-bold text-red-600 mt-1">
                            {history.filter(h => h.action === 'rejected_new').length}
                        </p>
                    </div>
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Reassigned Out</p>
                        <p className="text-2xl font-bold text-orange-600 mt-1">
                            {history.filter(h => h.action === 'reassigned_out').length}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
