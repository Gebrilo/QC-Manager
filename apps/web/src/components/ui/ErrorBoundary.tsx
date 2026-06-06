'use client';

import { Component, ReactNode } from 'react';

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { hasError: false, message: '' };

    static getDerivedStateFromError(err: unknown): ErrorBoundaryState {
        return { hasError: true, message: err instanceof Error ? err.message : 'Unknown error' };
    }

    componentDidCatch(error: unknown) {
        console.error('UI ErrorBoundary caught:', error);
    }

    render() {
        if (!this.state.hasError) return this.props.children;
        if (this.props.fallback) return this.props.fallback;
        return (
            <div className="m-6 rounded-xl border border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-900/20 p-6 text-sm text-rose-700 dark:text-rose-300">
                <div className="font-semibold mb-1">Something went wrong rendering this view.</div>
                <div className="opacity-80">{this.state.message}</div>
            </div>
        );
    }
}
