'use client';

import { useCallback, useState } from 'react';
import { useToast } from '@/components/ui/Toast';

interface AsyncState<T> {
    data: T | null;
    error: string | null;
    isLoading: boolean;
}

interface ExecuteOptions {
    successMessage?: string;
    errorMessage?: string;
    suppressToast?: boolean;
}

function mapStatusToMessage(status: number | undefined, fallback: string): string {
    switch (status) {
        case 403: return "You don't have permission to perform this action";
        case 404: return 'The requested item was not found';
        case 409: return 'Conflict — this item was modified by someone else';
        case 422: return fallback;
        case 429: return 'Too many requests — please slow down';
        case 500:
        case 502:
        case 503:
        case 504: return 'Something went wrong on the server. Please try again later.';
        default:  return fallback;
    }
}

export function useAsyncAction<T = unknown>() {
    const [state, setState] = useState<AsyncState<T>>({
        data: null,
        error: null,
        isLoading: false,
    });
    const toast = useToast();

    const execute = useCallback(async (
        asyncFn: () => Promise<T>,
        options: ExecuteOptions = {},
    ): Promise<T | null> => {
        setState({ data: null, error: null, isLoading: true });
        try {
            const data = await asyncFn();
            setState({ data, error: null, isLoading: false });
            if (options.successMessage && !options.suppressToast) {
                toast.success(options.successMessage);
            }
            return data;
        } catch (err) {
            const status = (err as { status?: number })?.status;
            const rawMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
            const message = options.errorMessage || mapStatusToMessage(status, rawMessage);
            setState({ data: null, error: message, isLoading: false });
            if (!options.suppressToast) {
                toast.error(message);
            }
            return null;
        }
    }, [toast]);

    const reset = useCallback(() => {
        setState({ data: null, error: null, isLoading: false });
    }, []);

    return { ...state, execute, reset };
}
