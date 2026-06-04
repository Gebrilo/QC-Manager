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
        <div>
            <div className="mb-2 text-sm font-medium">Bugs by severity</div>
            <ResponsiveContainer width="100%" height={180}>
                <BarChart data={rows}>
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value">
                        {rows.map(r => <Cell key={r.name} fill={SEVERITY_COLORS[r.name] || '#6b7280'} />)}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
