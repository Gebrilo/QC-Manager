'use client';

import { useEffect } from 'react';
import { onApiError } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

function humanize403(endpoint: string, fallback: string): string {
    if (endpoint.includes('/user-stories'))      return "You don't have permission to manage user stories";
    if (endpoint.includes('/tasks'))              return "You don't have permission to manage tasks";
    if (endpoint.includes('/projects'))           return "You don't have permission to manage projects";
    if (endpoint.includes('/reports') ||
        endpoint.includes('/governance'))         return "You don't have permission to generate reports";
    if (endpoint.includes('/test-executions') ||
        endpoint.includes('/results'))            return "You don't have permission to upload test results";
    return fallback || "You don't have permission to perform this action";
}

export function ApiErrorToaster() {
    const toast = useToast();
    useEffect(() => {
        return onApiError(e => {
            if (e.status === 401) return;
            if (e.status === 403) {
                toast.error(humanize403(e.endpoint, e.message));
                return;
            }
            if (e.status >= 500) {
                toast.error('Server error — please try again in a moment');
                return;
            }
        });
    }, [toast]);
    return null;
}
