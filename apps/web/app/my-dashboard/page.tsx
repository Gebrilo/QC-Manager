import { MyDashboardClient } from './my-dashboard-client';

export default function MyDashboardPage() {
    return (
        <div className="max-w-7xl mx-auto py-6 px-4 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Dashboard</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Your personal overview — tasks, projects, and bugs.
                    </p>
                </div>
            </div>

            <MyDashboardClient />
        </div>
    );
}
