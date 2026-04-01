'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const COLORS: Record<string, string> = {
    TEST_CASE: '#3b82f6',
    EXPLORATORY: '#f59e0b',
};

interface Props {
    testCase: number;
    exploratory: number;
}

export function BugsBySourceChart({ testCase, exploratory }: Props) {
    const data = [
        { name: 'Test Cases', value: testCase, key: 'TEST_CASE' },
        { name: 'Exploratory', value: exploratory, key: 'EXPLORATORY' },
    ];

    if (testCase + exploratory === 0) {
        return (
            <div className="flex items-center justify-center h-40 text-slate-400 dark:text-slate-500 text-sm">
                No bug data available
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                    <Pie
                        data={data}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                        label={({ name, percent }: any) =>
                            `${name} ${((percent || 0) * 100).toFixed(0)}%`
                        }
                    >
                        {data.map((entry) => (
                            <Cell key={entry.key} fill={COLORS[entry.key]} />
                        ))}
                    </Pie>
                    <Tooltip />
                </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-6">
                {data.map((entry) => (
                    <div key={entry.key} className="flex items-center gap-2 text-sm">
                        <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: COLORS[entry.key] }}
                        />
                        <span className="text-slate-600 dark:text-slate-400">{entry.name}</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{entry.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
