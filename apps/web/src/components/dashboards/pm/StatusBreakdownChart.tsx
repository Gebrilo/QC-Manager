'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function StatusBreakdownChart({
    data, title,
}: { data: Record<string, number>; title: string }) {
    const rows = Object.entries(data).map(([k, v]) => ({ name: k, value: v }));
    return (
        <div className="rounded-2xl border border-slate-200/60 p-4 dark:border-slate-700/50">
            <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">{title}</div>
            <ResponsiveContainer width="100%" height={180}>
                <BarChart data={rows}>
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
