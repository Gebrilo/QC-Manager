'use client';

import { useState, useEffect, useMemo } from 'react';
import { fetchApi } from '@/lib/api';
import { Task } from '@/types';
import { TaskTable } from '@/components/tasks/TaskTable';
import { FilterBar } from '@/components/ui/FilterBar';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';

export default function TasksPage() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState('');

    useEffect(() => {
        async function load() {
            try {
                const data = await fetchApi<Task[]>('/tasks', { cache: 'no-store' });
                setTasks(data);
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }
        load();
    }, []);

    // Listen for FilterBar's custom event
    useEffect(() => {
        const handleSearch = (e: CustomEvent) => {
            setFilter(e.detail || '');
        };
        window.addEventListener('qc-search', handleSearch as EventListener);
        return () => window.removeEventListener('qc-search', handleSearch as EventListener);
    }, []);

    const filteredTasks = useMemo(() => {
        if (!filter) return tasks;
        const lower = filter.toLowerCase();
        return tasks.filter(t =>
            t.task_name.toLowerCase().includes(lower) ||
            t.task_id.toLowerCase().includes(lower) ||
            t.project_name?.toLowerCase().includes(lower) ||
            t.resource1_name?.toLowerCase().includes(lower)
        );
    }, [tasks, filter]);

    return (
        <div className="space-y-6 py-6 px-4 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Tasks</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Manage all tasks across projects.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Link href="/tasks/create">
                        <Button className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/30 border-none">
                            + New Task
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Filter Bar - uses custom event 'qc-search' */}
            <FilterBar />

            {/* Task Table */}
            <TaskTable tasks={filteredTasks} isLoading={isLoading} />
        </div>
    );
}
