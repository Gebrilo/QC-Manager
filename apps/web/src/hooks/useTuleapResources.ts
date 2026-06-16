'use client';
import { useState, useEffect, useMemo } from 'react';
import { resourcesApi, tuleapApi, type Resource } from '@/lib/api';

export interface TuleapResource {
    id: string;
    user_id?: string;
    resource_name: string;
    tuleap_username: string;
}

export interface UseTuleapResourcesResult {
    resources: TuleapResource[];
    loaded: boolean;
}

export function useTuleapResources(projectId?: string, trackerType?: string): UseTuleapResourcesResult {
    const [resources, setResources] = useState<TuleapResource[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [allowedLabels, setAllowedLabels] = useState<Set<string> | null>(null);

    useEffect(() => {
        resourcesApi.list()
            .then((all: Resource[]) => {
                setResources(
                    all
                        .filter(r => r.is_active && r.tuleap_username)
                        .map(r => ({
                            id: r.id,
                            user_id: r.user_id,
                            resource_name: r.resource_name,
                            tuleap_username: r.tuleap_username!,
                        }))
                );
            })
            .catch(() => {})
            .finally(() => setLoaded(true));
    }, []);

    useEffect(() => {
        if (!projectId || !trackerType) {
            setAllowedLabels(null);
            return;
        }
        let cancelled = false;
        tuleapApi.getBindLabels(projectId, trackerType)
            .then(res => {
                if (cancelled) return;
                const labels = res.data?.fields?.assigned_to;
                setAllowedLabels(labels ? new Set(labels) : null);
            })
            .catch(() => { if (!cancelled) setAllowedLabels(null); });
        return () => { cancelled = true; };
    }, [projectId, trackerType]);

    const filtered = useMemo(
        () => allowedLabels
            ? resources.filter(r => allowedLabels.has(r.tuleap_username))
            : resources,
        [resources, allowedLabels]
    );

    return { resources: filtered, loaded };
}
