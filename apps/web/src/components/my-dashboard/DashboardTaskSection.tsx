'use client';

import { useMemo, useState } from 'react';
import { Task } from '@/types';
import { TaskTable } from '@/components/tasks/TaskTable';

interface DashboardTaskSectionProps {
    tasks: Task[];
}

const MONTHS = ['All', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getMonthFromDate(dateStr?: string): string | null {
    if (!dateStr) return null;
    try {
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d.toLocaleString('en-US', { month: 'long' });
    } catch { return null; }
}

export function DashboardTaskSection({ tasks }: DashboardTaskSectionProps) {
    const [selectedResource, setSelectedResource] = useState('All');
    const [selectedProject, setSelectedProject] = useState('All');
    const [selectedMonth, setSelectedMonth] = useState('All');

    const resources = useMemo(() => {
        const set = new Set<string>();
        tasks.forEach(t => {
            if (t.resource1_name && t.resource1_name !== 'Unassigned') set.add(t.resource1_name);
            if (t.resource2_name && t.resource2_name !== 'Unassigned') set.add(t.resource2_name);
        });
        return ['All', ...Array.from(set).sort()];
    }, [tasks]);

    const projects = useMemo(() => {
        const set = new Set<string>();
        tasks.forEach(t => { if (t.project_name) set.add(t.project_name); });
        return ['All', ...Array.from(set).sort()];
    }, [tasks]);

    const filtered = useMemo(() => {
        return tasks.filter(t => {
            if (selectedResource !== 'All' && t.resource1_name !== selectedResource && t.resource2_name !== selectedResource) return false;
            if (selectedProject !== 'All' && t.project_name !== selectedProject) return false;
            if (selectedMonth !== 'All') {
                const m = getMonthFromDate(t.deadline) ?? getMonthFromDate(t.completed_date) ?? getMonthFromDate(t.created_at);
                if (m !== selectedMonth) return false;
            }
            return true;
        });
    }, [tasks, selectedResource, selectedProject, selectedMonth]);

    const activeFilterCount = [selectedResource, selectedProject, selectedMonth].filter(v => v !== 'All').length;

    return (
        <div className="glass-card rounded-2xl overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    Tasks
                    <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
                        ({filtered.length}{activeFilterCount > 0 ? ` of ${tasks.length}` : ''})
                    </span>
                </h2>
                <div className="flex flex-wrap gap-2">
                    <select
                        value={selectedResource}
                        onChange={e => setSelectedResource(e.target.value)}
                        className="text-xs border-none bg-indigo-50 dark:bg-slate-800 rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 text-slate-600 dark:text-slate-300"
                    >
                        {resources.map(r => <option key={r} value={r}>{r === 'All' ? 'All Resources' : r}</option>)}
                    </select>
                    <select
                        value={selectedProject}
                        onChange={e => setSelectedProject(e.target.value)}
                        className="text-xs border-none bg-indigo-50 dark:bg-slate-800 rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 text-slate-600 dark:text-slate-300"
                    >
                        {projects.map(p => <option key={p} value={p}>{p === 'All' ? 'All Projects' : p}</option>)}
                    </select>
                    <select
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value)}
                        className="text-xs border-none bg-indigo-50 dark:bg-slate-800 rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 text-slate-600 dark:text-slate-300"
                    >
                        {MONTHS.map(m => <option key={m} value={m}>{m === 'All' ? 'All Months' : m}</option>)}
                    </select>
                    {activeFilterCount > 0 && (
                        <button
                            onClick={() => { setSelectedResource('All'); setSelectedProject('All'); setSelectedMonth('All'); }}
                            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline px-1"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>
            <TaskTable tasks={filtered} isLoading={false} />
        </div>
    );
}
