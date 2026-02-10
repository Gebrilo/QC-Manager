'use client';

import { useState, ReactNode } from 'react';

interface TooltipProps {
    content: string;
    children: ReactNode;
    position?: 'top' | 'bottom' | 'left' | 'right';
}

export function Tooltip({ content, children, position = 'top' }: TooltipProps) {
    const [isVisible, setIsVisible] = useState(false);

    const positionClasses = {
        top: 'bottom-full left-1/2 -translate-x-1/2 mb-3',
        bottom: 'top-full left-1/2 -translate-x-1/2 mt-3',
        left: 'right-full top-1/2 -translate-y-1/2 mr-3',
        right: 'left-full top-1/2 -translate-y-1/2 ml-3',
    };

    const arrowClasses = {
        top: 'top-full left-1/2 -translate-x-1/2 border-t-slate-800 border-x-transparent border-b-transparent',
        bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-800 border-x-transparent border-t-transparent',
        left: 'left-full top-1/2 -translate-y-1/2 border-l-slate-800 border-y-transparent border-r-transparent',
        right: 'right-full top-1/2 -translate-y-1/2 border-r-slate-800 border-y-transparent border-l-transparent',
    };

    return (
        <div
            className="relative inline-flex"
            onMouseEnter={() => setIsVisible(true)}
            onMouseLeave={() => setIsVisible(false)}
        >
            {children}
            {isVisible && (
                <div
                    className={`absolute z-50 ${positionClasses[position]} pointer-events-none`}
                    role="tooltip"
                >
                    <div className="bg-slate-800 dark:bg-slate-700 text-white text-xs px-4 py-3 rounded-lg shadow-xl w-72 md:w-96 whitespace-normal leading-relaxed">
                        {content}
                    </div>
                    <div
                        className={`absolute w-0 h-0 border-4 ${arrowClasses[position]}`}
                    />
                </div>
            )}
        </div>
    );
}

// Simple info icon with tooltip
interface InfoTooltipProps {
    content: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
}

export function InfoTooltip({ content, position = 'top' }: InfoTooltipProps) {
    return (
        <Tooltip content={content} position={position}>
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-[10px] cursor-help hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                ?
            </span>
        </Tooltip>
    );
}
