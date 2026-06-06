'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';

type ToastVariant = 'info' | 'success' | 'warning' | 'error';

interface ToastAction {
    label: string;
    onClick: () => void;
}

interface ToastItem {
    id: number;
    variant: ToastVariant;
    message: string;
    action?: ToastAction;
}

interface PushOptions {
    action?: ToastAction;
    durationMs?: number;
}

interface ToastContextValue {
    push: (variant: ToastVariant, message: string, options?: PushOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_DURATION_MS: Record<ToastVariant, number> = {
    info: 4000,
    success: 4000,
    warning: 0,
    error: 6000,
};

let nextId = 1;

const ICONS: Record<ToastVariant, ReactNode> = {
    info: <Info className="w-4 h-4 shrink-0 mt-0.5" />,
    success: <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />,
    error: <XCircle className="w-4 h-4 shrink-0 mt-0.5" />,
};

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

    const push = useCallback((variant: ToastVariant, message: string, options?: PushOptions) => {
        const id = nextId++;
        setToasts(prev => [...prev, { id, variant, message, action: options?.action }]);
        const duration = options?.durationMs ?? VARIANT_DURATION_MS[variant];
        if (duration > 0) {
            const timer = setTimeout(() => {
                timersRef.current.delete(id);
                setToasts(prev => prev.filter(t => t.id !== id));
            }, duration);
            timersRef.current.set(id, timer);
        }
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
                {ICONS[toast.variant]}
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
            {toast.action && (
                <div className="mt-2 flex justify-end">
                    <button
                        type="button"
                        onClick={() => { toast.action!.onClick(); onDismiss(); }}
                        className="text-xs font-medium underline underline-offset-2 opacity-90 hover:opacity-100"
                    >
                        {toast.action.label}
                    </button>
                </div>
            )}
        </div>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    const push = ctx?.push;
    const memo = useMemo(() => ({
        info:    (msg: string, options?: PushOptions) => push?.('info', msg, options),
        success: (msg: string, options?: PushOptions) => push?.('success', msg, options),
        warning: (msg: string, options?: PushOptions) => push?.('warning', msg, options),
        error:   (msg: string, options?: PushOptions) => push?.('error', msg, options),
    }), [push]);
    if (!ctx) {
        throw new Error('useToast must be used inside <ToastProvider>');
    }
    return memo;
}
