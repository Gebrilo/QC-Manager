'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { UserStoryForm } from '@/components/user-stories/UserStoryForm';

function CreateUserStoryContent() {
    const searchParams = useSearchParams();
    const projectId = searchParams.get('projectId');
    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Create User Story in Tuleap</h1>
            <UserStoryForm projectId={projectId || undefined} />
        </div>
    );
}

export default function CreateUserStoryPage() {
    return (
        <Suspense fallback={<div className="py-12 text-center text-slate-400">Loading...</div>}>
            <CreateUserStoryContent />
        </Suspense>
    );
}
