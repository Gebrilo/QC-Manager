'use client';

import { useSearchParams } from 'next/navigation';
import { BugForm } from '@/components/bugs/BugForm';

export default function CreateBugPage() {
    const searchParams = useSearchParams();
    const projectId = searchParams.get('projectId') || undefined;
    return <BugForm projectId={projectId} />;
}
