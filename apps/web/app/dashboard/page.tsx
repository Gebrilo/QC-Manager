import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { FilterBar } from '@/components/ui/FilterBar';
import { DashboardClient } from './dashboard-client';

export default function DashboardPage() {
    return (
        <div className="relative">
            {/* Decorative orbs */}
            <div aria-hidden="true" className="fixed inset-0 pointer-events-none overflow-hidden">
                <div
                    className="absolute -top-24 -right-24 w-[400px] h-[400px] rounded-full opacity-20 dark:opacity-25"
                    style={{ background: '#6366f1', filter: 'blur(100px)' }}
                />
                <div
                    className="absolute top-1/2 -left-32 w-[400px] h-[400px] rounded-full opacity-20 dark:opacity-25"
                    style={{ background: '#7c3aed', filter: 'blur(100px)' }}
                />
            </div>

            <div className="relative max-w-7xl mx-auto py-6 px-4 space-y-6">
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
        </div>
    );
}
