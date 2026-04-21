import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { FilterBar } from '@/components/ui/FilterBar';
import { DashboardClient } from './dashboard-client';

export default function DashboardPage() {
    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                        Quality overview
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Overview of your projects and pending tasks.
                    </p>
                </div>
                <div className="flex items-center gap-3 pt-1">
                    <Link href="/projects/create">
                        <Button variant="outline">New Project</Button>
                    </Link>
                    <Link href="/tasks/create">
                        <Button variant="primary">
                            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                                <path d="M12 5v14M5 12h14"/>
                            </svg>
                            New Task
                        </Button>
                    </Link>
                </div>
            </div>

            <FilterBar />
            <DashboardClient />
        </div>
    );
}
