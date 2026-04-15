import { StatCard } from '@/components/ui/StatCard';
import { MeDashboard } from '@/lib/api';

interface MyStatCardsProps {
    summary: MeDashboard['summary'];
}

export function MyStatCards({ summary }: MyStatCardsProps) {
    const { total_tasks, total_projects, hours_variance } = summary;

    const varianceDisplay = hours_variance === 0
        ? '0'
        : `${hours_variance > 0 ? '+' : ''}${hours_variance.toFixed(1)}`;

    const varianceTrend = hours_variance > 0 ? 'down' : hours_variance < 0 ? 'up' : undefined;

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
                title="Total Tasks"
                value={total_tasks}
                subtitle="assigned to you"
                icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                }
                tooltip="Total project tasks assigned to you (primary or secondary resource)."
            />
            <StatCard
                title="Total Projects"
                value={total_projects}
                subtitle="you're contributing to"
                icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                }
                tooltip="Number of distinct projects you have tasks in."
            />
            <StatCard
                title="Hours Variance"
                value={varianceDisplay}
                subtitle="actual vs estimated hrs"
                trend={varianceTrend}
                icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                }
                tooltip="Difference between actual and estimated hours across all your tasks. Positive (+) means over budget, negative (-) means under budget."
            />
        </div>
    );
}
