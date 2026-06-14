import { redirect } from 'next/navigation';

// The per-case results list now lives as the "All Results" tab on /test/runs.
// Redirect any direct hit (and the legacy dashboard deep-link) there, keeping
// the project filter if one was passed.
export default function TestResultsRedirect({
    searchParams,
}: {
    searchParams?: { project_id?: string };
}) {
    const projectId = searchParams?.project_id;
    const query = projectId ? `&project_id=${encodeURIComponent(projectId)}` : '';
    redirect(`/test/runs?tab=results${query}`);
}
