'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';

type ToastVariant = 'info' | 'success' | 'warning' | 'error';

interface ToastItem {
    id: number;
    variant: ToastVariant;
    message: string;
}

interface ToastContextValue {
    push: (variant: ToastVariant, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4000;
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

    const dismiss = useCallback((id: number) => {
        const timer = timersRef.current.get(id);
        if (timer !== undefined) {
            clearTimeout(timer);
            timersRef.current.delete(id);
        }
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const push = useCallback((variant: ToastVariant, message: string) => {
        const id = nextId++;
        setToasts(prev => [...prev, { id, variant, message }]);
        const timer = setTimeout(() => {
            timersRef.current.delete(id);
            setToasts(prev => prev.filter(t => t.id !== id));
        }, AUTO_DISMISS_MS);
        timersRef.current.set(id, timer);
    }, []);

    useEffect(() => {
        const timers = timersRef.current;
        return () => {
            timers.forEach(t => clearTimeout(t));
            timers.clear();
        };
    }, []);

    return (
        <ToastContext.Provider value={{ push }}>
            {children}
            <div
                aria-live="polite"
                aria-atomic="true"
                className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
            >
                {toasts.map(t => <ToastRow key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />)}
            </div>
        </ToastContext.Provider>
    );
}

function ToastRow({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
    const palette: Record<ToastVariant, string> = {
        info:    'bg-slate-800 text-white border-slate-700',
        success: 'bg-emerald-600 text-white border-emerald-500',
        warning: 'bg-amber-500 text-slate-900 border-amber-400',
        error:   'bg-rose-600 text-white border-rose-500',
    };
    return (
        <div
            role={toast.variant === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto min-w-[240px] max-w-sm rounded-lg border shadow-lg px-4 py-3 text-sm ${palette[toast.variant]}`}
        >
            <div className="flex items-start gap-3">
                <span className="flex-1">{toast.message}</span>
                <button
                    type="button"
                    aria-label="Dismiss notification"
                    onClick={onDismiss}
                    className="opacity-70 hover:opacity-100 text-xs"
                >
                    ✕
                </button>
            </div>
        </div>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        throw new Error('useToast must be used inside <ToastProvider>');
    }
    return {
        info:    (msg: string) => ctx.push('info', msg),
        success: (msg: string) => ctx.push('success', msg),
        warning: (msg: string) => ctx.push('warning', msg),
        error:   (msg: string) => ctx.push('error', msg),
    };
}
