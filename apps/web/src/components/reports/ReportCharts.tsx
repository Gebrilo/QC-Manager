'use client';

import React from 'react';
import { STATUS_CONFIG } from './reportTypes';

// ── Radial gauge ─────────────────────────────────────────────────────────────
function gaugeColor(v: number) {
    if (v >= 85) return '#10b981';
    if (v >= 70) return '#3b82f6';
    if (v >= 50) return '#f59e0b';
    return '#f43f5e';
}

export function Gauge({ value, label, caption }: { value: number; label: string; caption: string }) {
    const r = 46, C = 2 * Math.PI * r;
    const pct = Math.min(100, Math.max(0, value));
    const color = gaugeColor(pct);
    return (
        <div className="flex flex-col items-center justify-center h-full">
            <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-slate-400 mb-2 self-start">{label}</p>
            <div className="relative flex items-center justify-center">
                <svg width="124" height="124" viewBox="0 0 124 124" className="-rotate-90">
                    <circle cx="62" cy="62" r={r} fill="none" stroke="#eef2f7" strokeWidth="11" />
                    <circle cx="62" cy="62" r={r} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round"
                        strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)}
                        style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)' }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-extrabold text-slate-900 leading-none tabular-nums">
                        {pct}<span className="text-base font-bold text-slate-400">%</span>
                    </span>
                </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-2 text-center">{caption}</p>
        </div>
    );
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
export function Sparkline({ data, w = 116, h = 34 }: { data: number[]; w?: number; h?: number }) {
    if (!data || data.length < 2) return null;
    const max = Math.max(...data), min = Math.min(...data), span = max - min || 1;
    const step = w / (data.length - 1);
    const pts = data.map((v, i): [number, number] => [i * step, h - 4 - ((v - min) / span) * (h - 8)]);
    const line = pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const area = `0,${h} ${line} ${w},${h}`;
    const rising = data[data.length - 1] >= data[0];
    const color = rising ? '#10b981' : '#f43f5e';
    return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
            <polygon points={area} fill={color} opacity="0.08" />
            <polyline points={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.5" fill={color} />
        </svg>
    );
}

// ── Column chart ──────────────────────────────────────────────────────────────
export function ColumnChart({ data }: { data: { title: string; unit: string; bars: Array<{ label: string; value: number; status: string }> } }) {
    const max = Math.max(...data.bars.map(b => b.value), 1);
    return (
        <div>
            <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-slate-400 mb-3">{data.title}</p>
            <div className="flex items-end gap-3 h-32 pl-1">
                {data.bars.map((b, i) => {
                    const color = (STATUS_CONFIG[b.status] || STATUS_CONFIG.ontrack).bar;
                    const h = Math.max(6, (b.value / max) * 100);
                    return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                            <span className="text-[10px] font-semibold text-slate-500 tabular-nums">{b.value}{data.unit}</span>
                            <div className="w-full flex items-end justify-center" style={{ height: '100%' }}>
                                <div className="w-full max-w-[34px] rounded-t-md transition-all duration-700"
                                    style={{ height: `${h}%`, background: `linear-gradient(180deg, ${color}, ${color}cc)` }} />
                            </div>
                            <span className="text-[10px] text-slate-400 truncate w-full text-center">{b.label}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
