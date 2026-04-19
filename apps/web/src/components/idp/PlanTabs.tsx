'use client';

interface PlanTab {
    id: string;
    title: string;
    completion_pct: number;
}

interface PlanTabsProps {
    plans: PlanTab[];
    activePlanId: string;
    onPlanChange: (planId: string) => void;
}

export default function PlanTabs({ plans, activePlanId, onPlanChange }: PlanTabsProps) {
    if (plans.length <= 1) return null;

    return (
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-6 overflow-x-auto">
            {plans.map((plan) => (
                <button
                    key={plan.id}
                    onClick={() => onPlanChange(plan.id)}
                    className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                        plan.id === activePlanId
                            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                >
                    <span>{plan.title}</span>
                    <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                        plan.completion_pct === 100
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                    }`}>
                        {plan.completion_pct}%
                    </span>
                </button>
            ))}
        </div>
    );
}