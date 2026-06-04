'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function StatusBreakdownChart({
    data, title,
}: { data: Record<string, number>; title: string }) {
    const rows = Object.entries(data).map(([k, v]) => ({ name: k, value: v }));
    return (
        <div>
            <div className="mb-2 text-sm font-medium">{title}</div>
            <ResponsiveContainer width="100%" height={180}>
                <BarChart data={rows}>
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
