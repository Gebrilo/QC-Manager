'use client';

import { TestCaseForm } from '@/components/test-cases/TestCaseForm';

export default function CreateTestCasePage() {
    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Create Test Case in Tuleap</h1>
            <TestCaseForm />
        </div>
    );
}
