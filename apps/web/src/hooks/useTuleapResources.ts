'use client';
import { useState, useEffect } from 'react';
import { resourcesApi, type Resource } from '@/lib/api';

export interface TuleapResource {
    id: string;
    resource_name: string;
    tuleap_username: string;
}

export function useTuleapResources() {
    const [resources, setResources] = useState<TuleapResource[]>([]);

    useEffect(() => {
        resourcesApi.list()
            .then((all: Resource[]) => {
                setResources(
                    all
                        .filter(r => r.is_active && r.tuleap_username)
                        .map(r => ({
                            id: r.id,
                            resource_name: r.resource_name,
                            tuleap_username: r.tuleap_username!,
                        }))
                );
            })
            .catch(() => {});
    }, []);

    return resources;
}
