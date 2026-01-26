'use client';

import { useRouter } from 'next/navigation';
import ProjectForm from '@/components/projects/ProjectForm';

export default function CreateProjectPage() {
    const router = useRouter();

    const handleSuccess = () => {
        router.push('/projects');
        router.refresh();
    };

    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <header className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Create New Project</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1">Define project metadata and constraints.</p>
            </header>
            <ProjectForm onSuccess={handleSuccess} />
        </div>
    );
}
