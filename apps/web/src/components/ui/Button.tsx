import * as React from 'react';
import { twMerge } from 'tailwind-merge';
import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
    size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'default', size = 'default', ...props }, ref) => {
        return (
            <button
                className={cn(
                    "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-white dark:ring-offset-slate-950",
                    {
                        "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 active:scale-95": variant === 'primary',
                        "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-indigo-500/20 active:scale-95": variant === 'default',
                        "bg-rose-600 text-white hover:bg-rose-700 shadow-sm hover:shadow-rose-500/20 active:scale-95": variant === 'destructive',
                        "border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 shadow-sm": variant === 'outline',
                        "bg-slate-100 text-slate-900 hover:bg-slate-200/80 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700": variant === 'secondary',
                        "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300": variant === 'ghost',
                        "text-indigo-600 dark:text-indigo-400 underline-offset-4 hover:underline": variant === 'link',
                        "h-10 px-4 py-2": size === 'default',
                        "h-8 rounded-lg px-3 text-xs": size === 'sm',
                        "h-11 rounded-lg px-8": size === 'lg',
                        "h-10 w-10": size === 'icon',
                    },
                    className
                )}
                ref={ref}
                {...props}
            />
        );
    }
);
Button.displayName = 'Button';

export { Button };
