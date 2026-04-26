import * as React from 'react';
import { twMerge } from 'tailwind-merge';
import { clsx, type ClassValue } from 'clsx';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export interface TextareaProps
    extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, label, error, ...props }, ref) => {
        return (
            <div className="w-full">
                {label && (
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        {label}
                    </label>
                )}
                <textarea
                    className={cn(
                        "w-full rounded-xl border bg-slate-50 dark:bg-slate-950 p-4 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none min-h-[120px] transition-all resize-y",
                        error ? "border-rose-300 dark:border-rose-700" : "border-slate-200 dark:border-slate-800",
                        className
                    )}
                    ref={ref}
                    {...props}
                />
                {error && <p className="text-sm font-medium text-rose-500 mt-1">{error}</p>}
            </div>
        );
    }
);
Textarea.displayName = 'Textarea';

export { Textarea };
