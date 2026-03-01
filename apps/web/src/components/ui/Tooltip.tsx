'use client';

/**
 * Tooltip components built on @radix-ui/react-tooltip.
 *
 * All tooltips render via a React Portal at the end of <body>, so they
 * always escape any parent `overflow: hidden` / local stacking contexts.
 * Radix UI uses floating-ui under the hood for viewport collision detection
 * (flip + shift), ensuring tooltips never overflow the screen edges.
 *
 * Usage:
 *   1. Wrap the app root with <TooltipProvider> (already added to layout.tsx).
 *   2. Use <Tooltip>, <TooltipTrigger>, <TooltipContent> for full control.
 *   3. Use <InfoTooltip> for the common "?" info icon pattern.
 */

import * as RadixTooltip from '@radix-ui/react-tooltip';
import { ReactNode } from 'react';
import { Info } from 'lucide-react';

// ---------------------------------------------------------------------------
// Re-export Radix primitives for full-control usage
// ---------------------------------------------------------------------------
export const TooltipProvider = RadixTooltip.Provider;
export const Tooltip = RadixTooltip.Root;
export const TooltipTrigger = RadixTooltip.Trigger;

export interface TooltipContentProps
    extends React.ComponentPropsWithoutRef<typeof RadixTooltip.Content> {
    className?: string;
}

export function TooltipContent({
    className = '',
    sideOffset = 6,
    children,
    ...props
}: TooltipContentProps) {
    return (
        <RadixTooltip.Portal>
            <RadixTooltip.Content
                sideOffset={sideOffset}
                className={[
                    // Layer: tooltips always on top
                    'z-[9999]',
                    // Sizing
                    'max-w-xs md:max-w-sm',
                    // Visual styling
                    'rounded-lg bg-slate-800 dark:bg-slate-700 px-4 py-3',
                    'text-white text-xs leading-relaxed shadow-xl',
                    'pointer-events-none select-none whitespace-normal',
                    // Animation (Radix data-state driven)
                    'data-[state=delayed-open]:animate-in',
                    'data-[state=delayed-open]:fade-in-0',
                    'data-[state=delayed-open]:zoom-in-95',
                    'data-[state=closed]:animate-out',
                    'data-[state=closed]:fade-out-0',
                    'data-[state=closed]:zoom-out-95',
                    className,
                ].join(' ')}
                {...props}
            >
                {children}
                <RadixTooltip.Arrow className="fill-slate-800 dark:fill-slate-700" />
            </RadixTooltip.Content>
        </RadixTooltip.Portal>
    );
}

// ---------------------------------------------------------------------------
// SimpleTooltip – backward-compat wrapper matching the old Tooltip API:
//   <SimpleTooltip content="text" position="top"><button /></SimpleTooltip>
// ---------------------------------------------------------------------------
interface SimpleTooltipProps {
    content: string;
    children: ReactNode;
    position?: 'top' | 'bottom' | 'left' | 'right';
    delayDuration?: number;
}

export function SimpleTooltip({
    content,
    children,
    position = 'top',
    delayDuration = 300,
}: SimpleTooltipProps) {
    return (
        <Tooltip delayDuration={delayDuration}>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent side={position}>{content}</TooltipContent>
        </Tooltip>
    );
}

// ---------------------------------------------------------------------------
// InfoTooltip – the "?" icon pattern, fully backward-compatible:
//   <InfoTooltip content="text" position="top" />
// ---------------------------------------------------------------------------
interface InfoTooltipProps {
    content: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
}

export function InfoTooltip({ content, position = 'top' }: InfoTooltipProps) {
    return (
        <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-help hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                    <Info className="w-3 h-3" />
                </span>
            </TooltipTrigger>
            <TooltipContent side={position}>{content}</TooltipContent>
        </Tooltip>
    );
}
