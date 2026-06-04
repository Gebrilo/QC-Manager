'use client';
import { useState, useEffect } from 'react';
import { resourcesApi, type Resource } from '@/lib/api';

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

export function useTuleapResources(): UseTuleapResourcesResult {
    const [resources, setResources] = useState<TuleapResource[]>([]);
    const [loaded, setLoaded] = useState(false);

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

    return { resources, loaded };
}
