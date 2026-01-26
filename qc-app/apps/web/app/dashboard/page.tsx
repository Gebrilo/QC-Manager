import { FilterBar } from '@/components/ui/FilterBar';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { DashboardClient } from './dashboard-client';

export default function DashboardPage() {
    return (
        <div className="max-w-7xl mx-auto py-6 px-4 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Overview of your projects and pending tasks.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Link href="/projects/create">
                        <Button variant="outline">+ New Project</Button>
                    </Link>
                    <Link href="/tasks/create">
                        <Button variant="primary">+ New Task</Button>
                    </Link>
                </div>
            </div>

            <FilterBar />

            {/* 
        We use a Client Component wrapper for data fetching to be safe with Docker networking 
        config currently set to 'localhost' for NEXT_PUBLIC_API_URL.
      */}
            <DashboardClient />
        </div>
    );
}
