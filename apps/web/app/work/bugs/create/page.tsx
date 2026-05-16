'use client';

import { useSearchParams } from 'next/navigation';
import { BugForm } from '@/components/bugs/BugForm';

export default function CreateBugPage() {
    const searchParams = useSearchParams();
    const projectId = searchParams.get('projectId') || undefined;
    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Create Bug in Tuleap</h1>
            <BugForm projectId={projectId} />
        </div>
    );
}
