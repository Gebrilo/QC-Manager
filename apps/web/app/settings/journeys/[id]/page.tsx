'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { journeysApi, JourneyFull, JourneyChapter, JourneyQuest, JourneyTask } from '../../../../src/lib/api';

export default function AdminJourneyEditorPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [journey, setJourney] = useState<JourneyFull | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingJourney, setEditingJourney] = useState(false);
    const [journeyForm, setJourneyForm] = useState({ title: '', slug: '', description: '', is_active: true, auto_assign_on_activation: true, sort_order: 0 });

    const loadJourney = useCallback(async () => {
        try {
            const data = await journeysApi.get(id);
            setJourney(data);
            setJourneyForm({
                title: data.title,
                slug: data.slug,
                description: data.description || '',
                is_active: data.is_active,
                auto_assign_on_activation: data.auto_assign_on_activation,
                sort_order: data.sort_order,
            });
        } catch (err) {
            console.error('Failed to load journey:', err);
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => { loadJourney(); }, [loadJourney]);

    const handleUpdateJourney = async () => {
        setSaving(true);
        try {
            await journeysApi.update(id, journeyForm);
            setEditingJourney(false);
            loadJourney();
        } catch (err: any) {
            alert(err.message || 'Failed to update');
        } finally {
            setSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
            </div>
        );
    }

    if (!journey) {
        return (
            <div className="text-center py-20">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Journey Not Found</h3>
                <button onClick={() => router.push('/settings/journeys')} className="mt-4 text-indigo-600 hover:text-indigo-500">
                    Back to Journeys
                </button>
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="mb-6">
                <button
                    onClick={() => router.push('/settings/journeys')}
                    className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 mb-3 flex items-center gap-1"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to Journeys
                </button>

                {/* Journey details form */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                            {editingJourney ? 'Edit Journey Details' : journey.title}
                        </h1>
                        <button
                            onClick={() => setEditingJourney(!editingJourney)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        >
                            {editingJourney ? 'Cancel' : 'Edit Details'}
                        </button>
                    </div>

                    {editingJourney ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Title</label>
                                <input value={journeyForm.title} onChange={(e) => setJourneyForm({ ...journeyForm, title: e.target.value })}
                                    className="w-full h-9 border border-slate-200 dark:border-slate-700 rounded-lg px-3 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Slug</label>
                                <input value={journeyForm.slug} onChange={(e) => setJourneyForm({ ...journeyForm, slug: e.target.value })}
                                    className="w-full h-9 border border-slate-200 dark:border-slate-700 rounded-lg px-3 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Description</label>
                                <textarea value={journeyForm.description} onChange={(e) => setJourneyForm({ ...journeyForm, description: e.target.value })}
                                    className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none" rows={2} />
                            </div>
                            <div className="flex items-center gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={journeyForm.is_active} onChange={(e) => setJourneyForm({ ...journeyForm, is_active: e.target.checked })}
                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                                    <span className="text-sm text-slate-700 dark:text-slate-300">Active</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={journeyForm.auto_assign_on_activation} onChange={(e) => setJourneyForm({ ...journeyForm, auto_assign_on_activation: e.target.checked })}
                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                                    <span className="text-sm text-slate-700 dark:text-slate-300">Auto-assign</span>
                                </label>
                            </div>
                            <div className="flex justify-end sm:col-span-2">
                                <button onClick={handleUpdateJourney} disabled={saving}
                                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 transition-colors disabled:opacity-50">
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                            <code className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-xs">{journey.slug}</code>
                            <span>{journey.is_active ? 'Active' : 'Inactive'}</span>
                            <span>{journey.auto_assign_on_activation ? 'Auto-assign: Yes' : 'Auto-assign: No'}</span>
                            {journey.description && <span className="truncate max-w-xs">{journey.description}</span>}
                        </div>
                    )}
                </div>
            </div>

            {/* Chapters tree */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Chapters</h2>
                    <AddChapterButton journeyId={id} onCreated={loadJourney} />
                </div>

                {journey.chapters?.map((chapter) => (
                    <ChapterEditor key={chapter.id} chapter={chapter} onChanged={loadJourney} />
                ))}

                {(!journey.chapters || journey.chapters.length === 0) && (
                    <div className="text-center py-8 text-sm text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                        No chapters yet. Add one to get started.
                    </div>
                )}
            </div>
        </div>
    );
}

// --- Add Chapter Button ---
function AddChapterButton({ journeyId, onCreated }: { journeyId: string; onCreated: () => void }) {
    const [show, setShow] = useState(false);
    const [form, setForm] = useState({ slug: '', title: '', description: '', sort_order: 0, is_mandatory: true });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async () => {
        if (!form.slug || !form.title) return;
        setSaving(true);
        try {
            await journeysApi.createChapter(journeyId, form);
            setShow(false);
            setForm({ slug: '', title: '', description: '', sort_order: 0, is_mandatory: true });
            onCreated();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setSaving(false);
        }
    };

    if (!show) {
        return (
            <button onClick={() => setShow(true)} className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500">
                + Add Chapter
            </button>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Chapter title"
                className="h-8 border border-slate-200 dark:border-slate-700 rounded-lg px-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} placeholder="slug"
                className="h-8 w-32 border border-slate-200 dark:border-slate-700 rounded-lg px-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
            <label className="flex items-center gap-1">
                <input type="checkbox" checked={form.is_mandatory} onChange={(e) => setForm({ ...form, is_mandatory: e.target.checked })} className="rounded border-slate-300 text-indigo-600" />
                <span className="text-xs text-slate-600 dark:text-slate-400">Mandatory</span>
            </label>
            <button onClick={handleSubmit} disabled={saving} className="h-8 px-3 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-50">
                {saving ? '...' : 'Add'}
            </button>
            <button onClick={() => setShow(false)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
        </div>
    );
}

// --- Chapter Editor ---
function ChapterEditor({ chapter, onChanged }: { chapter: JourneyChapter; onChanged: () => void }) {
    const [expanded, setExpanded] = useState(false);

    const handleDelete = async () => {
        if (!confirm(`Delete chapter "${chapter.title}" and all its quests/tasks?`)) return;
        try {
            await journeysApi.deleteChapter(chapter.id);
            onChanged();
        } catch (err: any) { alert(err.message); }
    };

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between p-4">
                <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 flex-1 text-left">
                    <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="font-medium text-slate-900 dark:text-white">{chapter.title}</span>
                    <code className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{chapter.slug}</code>
                    {!chapter.is_mandatory && <span className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded">Optional</span>}
                    <span className="text-xs text-slate-400">Order: {chapter.sort_order}</span>
                </button>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{chapter.quests?.length || 0} quests</span>
                    <button onClick={handleDelete} className="text-xs text-rose-500 hover:text-rose-700">Delete</button>
                </div>
            </div>

            {expanded && (
                <div className="border-t border-slate-200 dark:border-slate-800 p-4 space-y-3">
                    {chapter.quests?.map((quest) => (
                        <QuestEditor key={quest.id} quest={quest} onChanged={onChanged} />
                    ))}
                    <AddQuestButton chapterId={chapter.id} onCreated={onChanged} />
                </div>
            )}
        </div>
    );
}

// --- Add Quest Button ---
function AddQuestButton({ chapterId, onCreated }: { chapterId: string; onCreated: () => void }) {
    const [show, setShow] = useState(false);
    const [form, setForm] = useState({ slug: '', title: '', description: '', sort_order: 0, is_mandatory: true });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async () => {
        if (!form.slug || !form.title) return;
        setSaving(true);
        try {
            await journeysApi.createQuest(chapterId, form);
            setShow(false);
            setForm({ slug: '', title: '', description: '', sort_order: 0, is_mandatory: true });
            onCreated();
        } catch (err: any) { alert(err.message); } finally { setSaving(false); }
    };

    if (!show) {
        return <button onClick={() => setShow(true)} className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500">+ Add Quest</button>;
    }

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Quest title"
                className="h-8 border border-slate-200 dark:border-slate-700 rounded-lg px-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} placeholder="slug"
                className="h-8 w-28 border border-slate-200 dark:border-slate-700 rounded-lg px-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
            <button onClick={handleSubmit} disabled={saving} className="h-8 px-3 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-50">
                {saving ? '...' : 'Add'}
            </button>
            <button onClick={() => setShow(false)} className="text-xs text-slate-400">Cancel</button>
        </div>
    );
}

// --- Quest Editor ---
function QuestEditor({ quest, onChanged }: { quest: JourneyQuest; onChanged: () => void }) {
    const [expanded, setExpanded] = useState(false);

    const handleDelete = async () => {
        if (!confirm(`Delete quest "${quest.title}" and all its tasks?`)) return;
        try {
            await journeysApi.deleteQuest(quest.id);
            onChanged();
        } catch (err: any) { alert(err.message); }
    };

    return (
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between p-3">
                <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 flex-1 text-left">
                    <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{quest.title}</span>
                    <code className="text-xs text-slate-400">{quest.slug}</code>
                    {!quest.is_mandatory && <span className="text-xs text-amber-500">Optional</span>}
                </button>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{quest.tasks?.length || 0} tasks</span>
                    <button onClick={handleDelete} className="text-xs text-rose-500 hover:text-rose-700">Delete</button>
                </div>
            </div>

            {expanded && (
                <div className="border-t border-slate-200 dark:border-slate-700 p-3 space-y-2">
                    {quest.tasks?.map((task) => (
                        <TaskEditor key={task.id} task={task} onChanged={onChanged} />
                    ))}
                    <AddTaskButton questId={quest.id} onCreated={onChanged} />
                </div>
            )}
        </div>
    );
}

// --- Task Editor ---
function TaskEditor({ task, onChanged }: { task: JourneyTask; onChanged: () => void }) {
    const handleDelete = async () => {
        if (!confirm(`Delete task "${task.title}"?`)) return;
        try {
            await journeysApi.deleteTask(task.id);
            onChanged();
        } catch (err: any) { alert(err.message); }
    };

    return (
        <div className="flex items-center justify-between py-2 px-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 flex-shrink-0" />
                <span className="text-sm text-slate-800 dark:text-slate-200 truncate">{task.title}</span>
                <code className="text-xs text-slate-400">{task.slug}</code>
                <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">{task.validation_type}</span>
                {!task.is_mandatory && <span className="text-xs text-amber-500">Optional</span>}
                {task.estimated_minutes && <span className="text-xs text-slate-400">~{task.estimated_minutes}m</span>}
            </div>
            <button onClick={handleDelete} className="text-xs text-rose-500 hover:text-rose-700 ml-2">Delete</button>
        </div>
    );
}

// --- Add Task Button ---
function AddTaskButton({ questId, onCreated }: { questId: string; onCreated: () => void }) {
    const [show, setShow] = useState(false);
    const [form, setForm] = useState({
        slug: '', title: '', description: '', instructions: '',
        validation_type: 'checkbox' as const,
        validation_config: {} as Record<string, any>,
        sort_order: 0, is_mandatory: true, estimated_minutes: undefined as number | undefined,
    });
    const [saving, setSaving] = useState(false);
    const [configText, setConfigText] = useState('{}');

    const handleSubmit = async () => {
        if (!form.slug || !form.title) return;
        setSaving(true);
        try {
            let vc = {};
            try { vc = JSON.parse(configText); } catch { /* ignore */ }
            await journeysApi.createTask(questId, { ...form, validation_config: vc });
            setShow(false);
            setForm({ slug: '', title: '', description: '', instructions: '', validation_type: 'checkbox', validation_config: {}, sort_order: 0, is_mandatory: true, estimated_minutes: undefined });
            setConfigText('{}');
            onCreated();
        } catch (err: any) { alert(err.message); } finally { setSaving(false); }
    };

    if (!show) {
        return <button onClick={() => setShow(true)} className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500">+ Add Task</button>;
    }

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Task title"
                    className="h-8 border border-slate-200 dark:border-slate-700 rounded-lg px-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} placeholder="slug"
                    className="h-8 border border-slate-200 dark:border-slate-700 rounded-lg px-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description"
                    className="border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none sm:col-span-2" rows={2} />
                <textarea value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="Instructions (markdown)"
                    className="border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none sm:col-span-2" rows={2} />
                <div>
                    <label className="block text-xs text-slate-500 mb-1">Validation Type</label>
                    <select value={form.validation_type} onChange={(e) => setForm({ ...form, validation_type: e.target.value as any })}
                        className="h-8 w-full border border-slate-200 dark:border-slate-700 rounded-lg px-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
                        <option value="checkbox">Checkbox</option>
                        <option value="multi_checkbox">Multi Checkbox</option>
                        <option value="text_acknowledge">Text Acknowledge</option>
                        <option value="link_visit">Link Visit</option>
                        <option value="file_upload">File Upload</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs text-slate-500 mb-1">Validation Config (JSON)</label>
                    <input value={configText} onChange={(e) => setConfigText(e.target.value)} placeholder='{}'
                        className="h-8 w-full border border-slate-200 dark:border-slate-700 rounded-lg px-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                </div>
                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1">
                        <input type="checkbox" checked={form.is_mandatory} onChange={(e) => setForm({ ...form, is_mandatory: e.target.checked })} className="rounded border-slate-300 text-indigo-600" />
                        <span className="text-xs text-slate-600 dark:text-slate-400">Mandatory</span>
                    </label>
                    <input type="number" value={form.estimated_minutes || ''} onChange={(e) => setForm({ ...form, estimated_minutes: parseInt(e.target.value) || undefined })}
                        placeholder="Min" className="h-8 w-16 border border-slate-200 dark:border-slate-700 rounded-lg px-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                    <span className="text-xs text-slate-400">minutes</span>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <button onClick={handleSubmit} disabled={saving} className="h-8 px-3 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-50">
                    {saving ? '...' : 'Add Task'}
                </button>
                <button onClick={() => setShow(false)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
            </div>
        </div>
    );
}
