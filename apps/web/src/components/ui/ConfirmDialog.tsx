'use client';

import React, { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';

type ConfirmVariant = 'danger' | 'default';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: ConfirmVariant;
    children?: ReactNode;
    onConfirm: () => void;
    onCancel: () => void;
}

interface ConfirmOptions {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: ConfirmVariant;
}

interface ConfirmContextValue {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'default',
    children,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    if (!open) return null;

    const confirmClass = variant === 'danger'
        ? 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500 text-white'
        : 'bg-indigo-600 hover:bg-indigo-700 focus-visible:ring-indigo-500 text-white';

    return (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm">
            <div
                className="absolute inset-0"
                onClick={onCancel}
                aria-hidden="true"
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                className="relative w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl"
            >
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                    <h2 id="confirm-dialog-title" className="text-base font-semibold text-slate-900 dark:text-white">
                        {title}
                    </h2>
                    {message && (
                        <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                            {message}
                        </p>
                    )}
                </div>
                {children && (
                    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                        {children}
                    </div>
                )}
                <div className="flex justify-end gap-2 px-5 py-4">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className={`h-9 px-4 rounded-lg text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${confirmClass}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
    const [options, setOptions] = useState<ConfirmOptions | null>(null);
    const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);

    const close = useCallback((confirmed: boolean) => {
        resolverRef.current?.(confirmed);
        resolverRef.current = null;
        setOptions(null);
    }, []);

    const confirm = useCallback((nextOptions: ConfirmOptions) => {
        setOptions(nextOptions);
        return new Promise<boolean>(resolve => {
            resolverRef.current = resolve;
        });
    }, []);

    const value = useMemo(() => ({ confirm }), [confirm]);

    return (
        <ConfirmContext.Provider value={value}>
            {children}
            <ConfirmDialog
                open={Boolean(options)}
                title={options?.title || ''}
                message={options?.message}
                confirmLabel={options?.confirmLabel}
                cancelLabel={options?.cancelLabel}
                variant={options?.variant}
                onConfirm={() => close(true)}
                onCancel={() => close(false)}
            />
        </ConfirmContext.Provider>
    );
}

export function useConfirm() {
    const ctx = useContext(ConfirmContext);
    if (!ctx) {
        throw new Error('useConfirm must be used inside <ConfirmDialogProvider>');
    }
    return ctx.confirm;
}
