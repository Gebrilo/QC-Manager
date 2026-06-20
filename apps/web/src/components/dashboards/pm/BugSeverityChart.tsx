'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const SEVERITY_COLORS: Record<string, string> = {
    Critical: '#b91c1c',
    High:     '#ea580c',
    Medium:   '#ca8a04',
    Low:      '#65a30d',
    None:     '#6b7280',
};

export default function BugSeverityChart({ data }: { data: Record<string, number> }) {
    const rows = Object.entries(data).map(([k, v]) => ({ name: k, value: v }));
    return (
        <div className="rounded-2xl border border-slate-200/60 p-4 dark:border-slate-700/50">
            <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Bugs by severity</div>
            <ResponsiveContainer width="100%" height={180}>
                <BarChart data={rows}>
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {rows.map(r => <Cell key={r.name} fill={SEVERITY_COLORS[r.name] || '#6b7280'} />)}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
