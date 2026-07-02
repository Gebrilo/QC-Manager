'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { aiIntakeApi, projectsApi, type AiIntakeStoryResponse, type AiIntakeTaskInput, type Project, type Task } from '@/lib/api';
import { artifactPath } from '@/lib/artifactPath';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { QCCard, SectionLabel, DetailRow } from '@/components/shared/DetailCard';

function fieldClassName(disabled = false) {
    return [
        'w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 backdrop-blur-md px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100',
        'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-colors',
        disabled ? 'opacity-60 cursor-not-allowed' : '',
    ].join(' ');
}

function textareaClassName(disabled = false) {
    return [
        fieldClassName(disabled),
        'min-h-[220px] resize-y leading-relaxed',
    ].join(' ');
}

function normalizeTaskDrafts(raw: string): AiIntakeTaskInput[] {
    if (!raw.trim()) return [];

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error('Tasks must be valid JSON.');
    }

    if (!Array.isArray(parsed)) {
        throw new Error('Tasks JSON must be an array.');
    }

    return parsed.map((item, index) => {
        if (typeof item === 'string') {
            return { title: item };
        }

        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new Error(`Task ${index + 1} must be an object or string.`);
        }

        return item as AiIntakeTaskInput;
    });
}

function AiStoryIntakeContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const toast = useToast();

    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState(searchParams.get('projectId') || '');
    const [contentMarkdown, setContentMarkdown] = useState('');
    const [skillName, setSkillName] = useState('');
    const [sourceAgent, setSourceAgent] = useState('');
    const [sourceConversationId, setSourceConversationId] = useState('');
    const [tasksJson, setTasksJson] = useState('');
    const [forceImport, setForceImport] = useState(false);
    const [generateTasks, setGenerateTasks] = useState(false);
    const [submission, setSubmission] = useState<AiIntakeStoryResponse | null>(null);
    const [generatedTasks, setGeneratedTasks] = useState<Task[]>([]);
    const [pollError, setPollError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        projectsApi.list()
            .then(result => {
                if (mounted) {
                    setProjects(result);
                }
            })
            .catch((err: any) => {
                if (mounted) {
                    setError(err.message || 'Failed to load projects');
                }
            })
            .finally(() => {
                if (mounted) {
                    setIsLoading(false);
                }
            });

        return () => {
            mounted = false;
        };
    }, []);

    const selectedProject = projects.find(project => project.id === selectedProjectId) || null;
    const hasProject = Boolean(selectedProjectId);
    const hasMarkdown = Boolean(contentMarkdown.trim());
    const hasTaskDraft = Boolean(tasksJson.trim());
    const submitLabel = hasTaskDraft
        ? 'Create Story + Tasks'
        : generateTasks
            ? 'Queue Task Generation'
            : 'Create Story';

    const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const isMarkdown = file.name.toLowerCase().endsWith('.md') || file.type === 'text/markdown' || file.type === 'text/plain';
        if (!isMarkdown) {
            setError('Upload a Markdown (.md) file.');
            event.target.value = '';
            return;
        }

        try {
            setContentMarkdown(await file.text());
            setError(null);
        } catch {
            setError('Failed to read the selected Markdown file.');
        }
    };

    useEffect(() => {
        if (submission?.task_generation?.status !== 'pending' || !submission.story?.id) return;

        let cancelled = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        const poll = async () => {
            try {
                const result = await aiIntakeApi.getGeneratedTasks(submission.story.id);
                if (cancelled) return;

                setGeneratedTasks(result.tasks || []);
                setPollError(null);

                const status = (typeof result.job?.status === 'string'
                    ? result.job.status
                    : result.tasks.length > 0
                        ? 'processed'
                        : 'pending') as NonNullable<AiIntakeStoryResponse['task_generation']>['status'];

                setSubmission(prev => prev ? {
                    ...prev,
                    task_generation: {
                        ...prev.task_generation,
                        status,
                        created_task_count: result.tasks.length,
                    },
                } : prev);

                if (status === 'pending') {
                    timeoutId = setTimeout(poll, 3000);
                }
            } catch (err: any) {
                if (!cancelled) {
                    setPollError(err.message || 'Failed to refresh task generation status');
                    timeoutId = setTimeout(poll, 5000);
                }
            }
        };

        timeoutId = setTimeout(poll, 1500);

        return () => {
            cancelled = true;
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [submission?.story?.id, submission?.task_generation?.status]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);

        if (!selectedProjectId) {
            setError('Select a project before submitting the intake.');
            return;
        }

        if (!hasMarkdown) {
            setError('Story markdown is required.');
            return;
        }

        if (selectedProject && selectedProject.ai_intake_enabled === false) {
            setError('That project has AI intake disabled. Enable it in the project form first.');
            return;
        }

        let tasks: AiIntakeTaskInput[] | undefined;
        try {
            tasks = normalizeTaskDrafts(tasksJson);
        } catch (err: any) {
            setError(err.message || 'Invalid task JSON');
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await aiIntakeApi.createStory({
                project_id: selectedProjectId,
                content_markdown: contentMarkdown,
                tasks: tasks.length > 0 ? tasks : undefined,
                force_import: forceImport,
                create_tasks: tasks.length > 0 || generateTasks,
                skill_name: skillName.trim() || undefined,
                source_agent: sourceAgent.trim() || undefined,
                source_conversation_id: sourceConversationId.trim() || undefined,
            });

            toast.success(response.task_generation?.status === 'pending'
                ? 'AI intake queued task generation.'
                : 'AI intake created a user story.');

            setSubmission(response);
            setGeneratedTasks(response.tasks || []);
            setPollError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to submit AI intake');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
            <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                        <Link href="/work/stories" className="hover:text-violet-600 transition-colors">User Stories</Link>
                        <span className="text-slate-300 dark:text-slate-600">/</span>
                        <span className="text-slate-500 dark:text-slate-300 font-medium">AI Intake</span>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">AI Story Intake</h1>
                    <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 max-w-3xl">
                        Paste the AI-generated story markdown for a project. You can also provide a task array now,
                        or leave tasks empty and queue generation through the webhook workflow.
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
                    <Button type="submit" form="ai-intake-form" loading={isSubmitting} loadingText={submitLabel}>
                        {submitLabel}
                    </Button>
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
                    {error}
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.75fr)] items-start">
                <form id="ai-intake-form" onSubmit={handleSubmit} className="space-y-6">
                    <QCCard>
                        <SectionLabel>Intake</SectionLabel>
                        <div className="grid gap-5">
                            <div>
                                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    Project
                                </label>
                                <select
                                    value={selectedProjectId}
                                    onChange={event => setSelectedProjectId(event.target.value)}
                                    disabled={isLoading}
                                    className={fieldClassName(isLoading)}
                                >
                                    <option value="">Select a project</option>
                                    {projects.map(project => (
                                        <option
                                            key={project.id}
                                            value={project.id}
                                            disabled={!project.ai_intake_enabled}
                                        >
                                            {project.project_name} ({project.project_id}){project.ai_intake_enabled ? '' : ' - AI intake off'}
                                        </option>
                                    ))}
                                </select>
                                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                                    Only projects with AI intake enabled can accept these submissions.
                                </p>
                            </div>

                            <div>
                                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    Story Markdown
                                </label>
                                <input
                                    type="file"
                                    accept=".md,text/markdown,text/plain"
                                    onChange={handleFileSelected}
                                    className="mb-3 block w-full text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 dark:file:bg-slate-800 dark:file:text-slate-200 dark:hover:file:bg-slate-700"
                                />
                                <textarea
                                    value={contentMarkdown}
                                    onChange={event => setContentMarkdown(event.target.value)}
                                    placeholder={`# Feature title

## Description
As a ...

## Acceptance Criteria
- ...`}
                                    className={textareaClassName()}
                                />
                                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                                    Markdown is sanitized before storage. Headings become the title and sections feed the story fields.
                                </p>
                            </div>

                            <div className="grid gap-4 md:grid-cols-3">
                                <div>
                                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        Skill Name
                                    </label>
                                    <input
                                        value={skillName}
                                        onChange={event => setSkillName(event.target.value)}
                                        placeholder="Superpower PRD"
                                        className={fieldClassName()}
                                    />
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        Source Agent
                                    </label>
                                    <input
                                        value={sourceAgent}
                                        onChange={event => setSourceAgent(event.target.value)}
                                        placeholder="Codex"
                                        className={fieldClassName()}
                                    />
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        Conversation ID
                                    </label>
                                    <input
                                        value={sourceConversationId}
                                        onChange={event => setSourceConversationId(event.target.value)}
                                        placeholder="Optional"
                                        className={fieldClassName()}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    Optional Tasks JSON
                                </label>
                                <textarea
                                    value={tasksJson}
                                    onChange={event => setTasksJson(event.target.value)}
                                    placeholder={`[
  {"title": "Design login flow"},
  {"task_name": "Implement login form", "priority": "High"}
 ]`}
                                    className={textareaClassName()}
                                />
                                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                                    Paste a JSON array of task objects. If you leave this blank and enable generation, the workflow queues n8n to create tasks later.
                                </p>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 px-4 py-3">
                                    <input
                                        type="checkbox"
                                        checked={forceImport}
                                        onChange={event => setForceImport(event.target.checked)}
                                        className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span>
                                        <span className="block text-sm font-medium text-slate-900 dark:text-white">Force import</span>
                                        <span className="block text-xs text-slate-500 dark:text-slate-400 mt-1">
                                            Allow duplicate intake content to bypass the hash guard.
                                        </span>
                                    </span>
                                </label>

                                <label className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 px-4 py-3">
                                    <input
                                        type="checkbox"
                                        checked={generateTasks}
                                        onChange={event => setGenerateTasks(event.target.checked)}
                                        className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span>
                                        <span className="block text-sm font-medium text-slate-900 dark:text-white">Queue task generation</span>
                                        <span className="block text-xs text-slate-500 dark:text-slate-400 mt-1">
                                            Leave task JSON empty to hand the story off to the n8n workflow.
                                        </span>
                                    </span>
                                </label>
                            </div>
                        </div>
                    </QCCard>
                </form>

                <div className="space-y-6">
                    <QCCard>
                        <SectionLabel>What Happens</SectionLabel>
                        <div className="space-y-0">
                            <DetailRow label="Story status" value="Review" />
                            <DetailRow label="Task status" value="Todo" />
                            <DetailRow label="Sync mode" value="Standalone" />
                            <DetailRow label="Tuleap" value="Never auto-emitted" />
                        </div>
                    </QCCard>

                    <QCCard>
                        <SectionLabel>Example Payload</SectionLabel>
                        <pre className="overflow-auto rounded-xl bg-slate-950 text-slate-100 p-4 text-xs leading-relaxed">
{`{
  "project_id": "${selectedProjectId || 'PROJECT_UUID'}",
  "content_markdown": "# Story title\\n\\n## Description\\n...",
  "skill_name": "${skillName || 'unknown'}",
  "source_agent": "${sourceAgent || 'Codex'}",
  "create_tasks": ${tasksJson.trim() || generateTasks ? 'true' : 'false'},
  "tasks": [
    { "title": "First task", "priority": "High" }
  ]
}`}
                        </pre>
                    </QCCard>

                    <QCCard>
                        <SectionLabel>Selection</SectionLabel>
                        <div className="space-y-0">
                            <DetailRow label="Project" value={selectedProject?.project_name || (hasProject ? selectedProjectId : 'None selected')} />
                            <DetailRow label="Markdown" value={hasMarkdown ? 'Ready' : 'Missing'} />
                            <DetailRow label="Skill" value={skillName.trim() || 'Not set'} />
                            <DetailRow label="Agent" value={sourceAgent.trim() || 'Not set'} />
                            <DetailRow label="Task draft" value={tasksJson.trim() ? 'Provided' : 'Blank'} />
                        </div>
                    </QCCard>

                    {submission && (
                        <QCCard>
                            <SectionLabel>Result</SectionLabel>
                            <div className="space-y-0">
                                <DetailRow label="Story" value={submission.story.title || submission.story.id} />
                                <DetailRow label="Status" value={submission.story.status || 'Review'} />
                                <DetailRow label="Task generation" value={submission.task_generation?.status || (generatedTasks.length > 0 ? 'processed' : 'not requested')} />
                                <DetailRow label="Tasks" value={String(generatedTasks.length || submission.task_generation?.created_task_count || 0)} />
                            </div>
                            {pollError && (
                                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                                    {pollError}
                                </div>
                            )}
                            {submission.task_generation?.status === 'pending' && (
                                <div className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                                    <Spinner size="sm" />
                                    Waiting for generated tasks
                                </div>
                            )}
                            {generatedTasks.length > 0 && (
                                <div className="mt-3 space-y-2">
                                    {generatedTasks.slice(0, 5).map(task => (
                                        <Link
                                            key={task.id}
                                            href={artifactPath('task', task)}
                                            className="block rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-700 dark:border-slate-800 dark:text-slate-200 dark:hover:border-indigo-700 dark:hover:text-indigo-300"
                                        >
                                            {task.task_name || task.task_id || task.id}
                                        </Link>
                                    ))}
                                </div>
                            )}
                            <Link
                                href={artifactPath('user_story', submission.story)}
                                className="mt-4 inline-flex text-xs font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                            >
                                Open created user story
                            </Link>
                        </QCCard>
                    )}
                </div>
            </div>

            {isLoading && (
                <div className="flex items-center justify-center py-8 text-slate-400">
                    <Spinner size="md" />
                </div>
            )}
        </div>
    );
}

export default function AiStoryIntakePage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-64 text-slate-400"><Spinner size="lg" /></div>}>
            <AiStoryIntakeContent />
        </Suspense>
    );
}
