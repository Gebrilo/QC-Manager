'use client';

import React, { useEffect, useState } from 'react';

interface DonutChartProps {
    data: { label: string; value: number; color: string }[];
    size?: number;
}

export function DonutChart({ data, size = 160 }: DonutChartProps) {
    const total = data.reduce((acc, item) => acc + Number(item.value), 0);
    // Use state for animation trigger
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Filter out zero-value segments for rendering
    const nonZeroData = data.filter(item => item.value > 0);

    let cumulativeValue = 0;
    const center = size / 2;
    const radius = size * 0.35;
    const strokeWidth = size * 0.15;
    const circumference = 2 * Math.PI * radius;

    return (
        <div className="relative flex items-center justify-center animate-in zoom-in-50 duration-700 ease-out" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
                {total === 0 ? (
                    <circle
                        cx={center}
                        cy={center}
                        r={radius}
                        fill="transparent"
                        stroke="currentColor"
                        strokeWidth={strokeWidth}
                        className="text-slate-100 dark:text-slate-800"
                    />
                ) : (
                    nonZeroData.map((item, index) => {
                        const percentage = item.value / total;
                        const strokeDasharray = `${percentage * circumference} ${circumference}`;
                        const strokeDashoffset = -(cumulativeValue / total) * circumference;
                        cumulativeValue += item.value;

                        // Only use round linecap if segment is less than ~95% to avoid visual overlap
                        const useRoundCap = percentage < 0.95;

                        return (
                            <circle
                                key={index}
                                cx={center}
                                cy={center}
                                r={radius}
                                fill="transparent"
                                stroke={item.color}
                                strokeWidth={strokeWidth}
                                strokeDasharray={strokeDasharray}
                                strokeDashoffset={strokeDashoffset}
                                strokeLinecap={useRoundCap ? 'round' : 'butt'}
                                className={`transition-all duration-1000 ease-out ${mounted ? 'opacity-100' : 'opacity-0 stroke-dasharray-[0]'}`}
                                style={{
                                    transitionDelay: `${index * 150}ms`,
                                    transformOrigin: 'center'
                                }}
                            />
                        );
                    })
                )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center animate-in fade-in delay-500 duration-700">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">{total}</span>
                <span className="text-xs text-slate-500 uppercase tracking-wider">Total</span>
            </div>
        </div>
    );
}

interface BarChartProps {
    data: { label: string; value: number }[];
    height?: number;
}

export function BarChart({ data, height = 120 }: BarChartProps) {
    // Filter out projects with 0 tasks (Phase 2 requirement: 0 tasks = Empty/Hidden)
    const filteredData = data.filter(item => item.value > 0);

    // Scaling Logic per roadmap:
    // - 0 tasks: Hidden (filtered above)
    // - 1-9 tasks: Proportional width (10% per task, so scaleMax = 10)
    // - 10+ tasks: Full width (100%, scaleMax = actual max)
    const maxDataValue = Math.max(...filteredData.map((item) => item.value), 0);
    const scaleMax = Math.max(10, maxDataValue);

    // Empty state when no projects have tasks
    if (filteredData.length === 0) {
        return (
            <div className="flex items-center justify-center w-full text-slate-400 dark:text-slate-500 text-sm" style={{ height }}>
                No project data available
            </div>
        );
    }

    return (
        <div className="flex items-end justify-between gap-2 w-full pt-4" style={{ height }}>
            {filteredData.map((item, index) => {
                const barHeight = (item.value / scaleMax) * 100;

                return (
                    <div key={index} className="flex-1 flex flex-col items-center group gap-2 h-full justify-end">
                        <div className="relative w-full flex items-end justify-center h-full">
                            {/* Track/Background Bar (Optional, for visual guide) */}
                            <div
                                className="w-full max-w-[24px] absolute bottom-0 bg-slate-100 dark:bg-slate-800/50 rounded-t-sm h-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                            />

                            {/* Actual Bar */}
                            <div
                                className="w-full max-w-[24px] bg-indigo-600 dark:bg-indigo-500 rounded-t-sm group-hover:bg-indigo-400 transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] animate-in slide-in-from-bottom-full"
                                style={{
                                    height: `${Math.max(barHeight, 0)}%`,
                                    position: 'relative',
                                    zIndex: 1,
                                    animationFillMode: 'both',
                                    animationDelay: `${index * 100}ms`
                                }}
                            />

                            {/* Tooltip-like value */}
                            <div className="absolute -top-8 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 bg-slate-900 text-white text-[10px] px-2 py-1 rounded pointer-events-none z-10 shadow-lg whitespace-nowrap">
                                {item.value} Tasks
                                <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45"></div>
                            </div>
                        </div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate w-full text-center h-4 leading-4">
                            {item.label}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
