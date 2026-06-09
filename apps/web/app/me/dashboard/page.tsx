'use client';

import { useAuth } from '@/components/providers/AuthProvider';
import { MyDashboardClient } from './my-dashboard-client';

export default function MyDashboardPage() {
    const { isAdmin, isManager } = useAuth();

    const subtitle = isAdmin ? 'Organisation-wide tasks, projects, and team health.'
        : isManager ? 'Your team\'s tasks, projects, and member activity.'
        : 'Your personal overview — tasks, projects, and bugs.';

    return (
        <div className="max-w-7xl mx-auto py-6 px-4 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">My Dashboard</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>
                </div>
            </div>
            <MyDashboardClient />
        </div>
    );
}
