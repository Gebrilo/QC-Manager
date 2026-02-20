'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { myJourneysApi, JourneyWithProgress, JourneyChapter, JourneyQuest, JourneyTask } from '../../../src/lib/api';

export default function JourneyDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [journey, setJourney] = useState<JourneyWithProgress | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());

    const loadJourney = useCallback(async () => {
        try {
            const data = await myJourneysApi.get(id);
            setJourney(data);
            // Auto-expand first incomplete chapter
            if (data.chapters) {
                const firstIncomplete = data.chapters.find(ch => !ch.progress?.is_complete);
                if (firstIncomplete) {
                    setExpandedChapters(new Set([firstIncomplete.id]));
                } else {
                    setExpandedChapters(new Set([data.chapters[0]?.id].filter(Boolean)));
                }
            }
        } catch (err) {
            console.error('Failed to load journey:', err);
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => { loadJourney(); }, [loadJourney]);

    const toggleChapter = (chapterId: string) => {
        setExpandedChapters(prev => {
            const next = new Set(prev);
            if (next.has(chapterId)) next.delete(chapterId);
            else next.add(chapterId);
            return next;
        });
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
                <button onClick={() => router.push('/journeys')} className="mt-4 text-indigo-600 hover:text-indigo-500">
                    Back to Journeys
                </button>
            </div>
        );
    }

    const progress = journey.progress;

    return (
        <div>
            {/* Header */}
            <div className="mb-6">
                <button
                    onClick={() => router.push('/journeys')}
                    className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 mb-3 flex items-center gap-1"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to Journeys
                </button>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{journey.title}</h1>
                {journey.description && (
                    <p className="text-slate-500 dark:text-slate-400 mt-1">{journey.description}</p>
                )}

                {/* Overall progress bar */}
                {progress && (
                    <div className="mt-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                        <div className="flex items-center justify-between text-sm mb-2">
                            <span className="font-medium text-slate-700 dark:text-slate-300">Overall Progress</span>
                            <span className="text-slate-500 dark:text-slate-400">
                                {progress.mandatory_completed}/{progress.mandatory_tasks} mandatory tasks &middot; {progress.completion_pct}%
                            </span>
                        </div>
                        <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${progress.completion_pct === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                style={{ width: `${progress.completion_pct}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Chapters accordion */}
            <div className="space-y-3">
                {journey.chapters?.map((chapter) => (
                    <ChapterSection
                        key={chapter.id}
                        chapter={chapter}
                        journeyId={id}
                        isExpanded={expandedChapters.has(chapter.id)}
                        onToggle={() => toggleChapter(chapter.id)}
                        onTaskComplete={loadJourney}
                    />
                ))}
            </div>
        </div>
    );
}

function ChapterSection({
    chapter,
    journeyId,
    isExpanded,
    onToggle,
    onTaskComplete,
}: {
    chapter: JourneyChapter;
    journeyId: string;
    isExpanded: boolean;
    onToggle: () => void;
    onTaskComplete: () => void;
}) {
    const progress = chapter.progress;
    const isComplete = progress?.is_complete;

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isComplete
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}>
                        {isComplete ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        ) : (
                            <span className="text-xs font-bold">{chapter.sort_order}</span>
                        )}
                    </div>
                    <div className="text-left">
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-slate-900 dark:text-white">{chapter.title}</h3>
                            {!chapter.is_mandatory && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">Optional</span>
                            )}
                        </div>
                        {chapter.description && (
                            <p className="text-sm text-slate-500 dark:text-slate-400">{chapter.description}</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {progress && (
                        <span className="text-xs text-slate-500">
                            {progress.completed_quests}/{progress.total_quests} quests
                        </span>
                    )}
                    <svg className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </button>

            {isExpanded && (
                <div className="border-t border-slate-200 dark:border-slate-800 p-4 space-y-4">
                    {chapter.quests?.map((quest) => (
                        <QuestSection key={quest.id} quest={quest} journeyId={journeyId} onTaskComplete={onTaskComplete} />
                    ))}
                </div>
            )}
        </div>
    );
}

function QuestSection({
    quest,
    journeyId,
    onTaskComplete,
}: {
    quest: JourneyQuest;
    journeyId: string;
    onTaskComplete: () => void;
}) {
    const progress = quest.progress;

    return (
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <h4 className="font-medium text-slate-800 dark:text-slate-200">{quest.title}</h4>
                    {!quest.is_mandatory && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400">Optional</span>
                    )}
                </div>
                {progress && (
                    <span className={`text-xs font-medium ${progress.is_complete ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
                        {progress.completed}/{progress.total}
                    </span>
                )}
            </div>
            {quest.description && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">{quest.description}</p>
            )}
            <div className="space-y-2">
                {quest.tasks?.map((task) => (
                    <TaskItem key={task.id} task={task} journeyId={journeyId} onComplete={onTaskComplete} />
                ))}
            </div>
        </div>
    );
}

function TaskItem({
    task,
    journeyId,
    onComplete,
}: {
    task: JourneyTask;
    journeyId: string;
    onComplete: () => void;
}) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [textValue, setTextValue] = useState('');
    const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
    const [showForm, setShowForm] = useState(false);

    const handleComplete = async (validationData: Record<string, any> = {}) => {
        setIsSubmitting(true);
        try {
            await myJourneysApi.completeTask(journeyId, task.id, validationData);
            onComplete();
        } catch (err) {
            console.error('Failed to complete task:', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUndo = async () => {
        setIsSubmitting(true);
        try {
            await myJourneysApi.uncompleteTask(journeyId, task.id);
            onComplete();
        } catch (err) {
            console.error('Failed to undo task:', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (task.is_completed) {
        return (
            <div className="flex items-start gap-3 p-3 bg-white dark:bg-slate-900 rounded-lg border border-emerald-200 dark:border-emerald-900">
                <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 line-through">{task.title}</p>
                    <button
                        onClick={handleUndo}
                        disabled={isSubmitting}
                        className="text-xs text-slate-400 hover:text-rose-500 mt-1 transition-colors disabled:opacity-50"
                    >
                        Undo
                    </button>
                </div>
            </div>
        );
    }

    // Render validation widget based on type
    return (
        <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{task.title}</p>
                        {!task.is_mandatory && (
                            <span className="text-xs text-slate-400">Optional</span>
                        )}
                        {task.estimated_minutes && (
                            <span className="text-xs text-slate-400">~{task.estimated_minutes}m</span>
                        )}
                    </div>
                    {task.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{task.description}</p>
                    )}
                    {task.instructions && (
                        <div className="mt-2 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded p-2 whitespace-pre-wrap">
                            {task.instructions}
                        </div>
                    )}

                    {/* Validation widgets */}
                    <div className="mt-3">
                        {task.validation_type === 'checkbox' && (
                            <button
                                onClick={() => handleComplete({ checked: true })}
                                disabled={isSubmitting}
                                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors disabled:opacity-50"
                            >
                                {isSubmitting ? 'Saving...' : 'Mark as Done'}
                            </button>
                        )}

                        {task.validation_type === 'link_visit' && (
                            <button
                                onClick={() => handleComplete({ visited: true })}
                                disabled={isSubmitting}
                                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors disabled:opacity-50"
                            >
                                {isSubmitting ? 'Saving...' : "I've Visited This"}
                            </button>
                        )}

                        {task.validation_type === 'text_acknowledge' && (
                            <>
                                {!showForm ? (
                                    <button
                                        onClick={() => setShowForm(true)}
                                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors"
                                    >
                                        Respond
                                    </button>
                                ) : (
                                    <div className="space-y-2">
                                        {task.validation_config?.prompt && (
                                            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">{task.validation_config.prompt}</p>
                                        )}
                                        <textarea
                                            value={textValue}
                                            onChange={(e) => setTextValue(e.target.value)}
                                            placeholder="Type your response..."
                                            className="w-full text-sm p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                                            rows={2}
                                        />
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleComplete({ text: textValue })}
                                                disabled={isSubmitting || textValue.length < (task.validation_config?.min_text_length || 1)}
                                                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
                                            >
                                                {isSubmitting ? 'Saving...' : 'Submit'}
                                            </button>
                                            <button
                                                onClick={() => { setShowForm(false); setTextValue(''); }}
                                                className="text-xs text-slate-400 hover:text-slate-600"
                                            >
                                                Cancel
                                            </button>
                                            {task.validation_config?.min_text_length && (
                                                <span className="text-xs text-slate-400">
                                                    Min {task.validation_config.min_text_length} chars
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {task.validation_type === 'multi_checkbox' && (
                            <div className="space-y-1.5">
                                {(task.validation_config?.items || []).map((item: string, idx: number) => (
                                    <label key={idx} className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={checkedItems.has(item)}
                                            onChange={(e) => {
                                                const next = new Set(checkedItems);
                                                if (e.target.checked) next.add(item);
                                                else next.delete(item);
                                                setCheckedItems(next);
                                            }}
                                            className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-xs text-slate-700 dark:text-slate-300">{item}</span>
                                    </label>
                                ))}
                                <button
                                    onClick={() => handleComplete({ checked_items: Array.from(checkedItems) })}
                                    disabled={isSubmitting || checkedItems.size < (task.validation_config?.items?.length || 0)}
                                    className="mt-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
                                >
                                    {isSubmitting ? 'Saving...' : 'Confirm All'}
                                </button>
                            </div>
                        )}

                        {task.validation_type === 'file_upload' && (
                            <button
                                onClick={() => handleComplete({ acknowledged: true })}
                                disabled={isSubmitting}
                                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors disabled:opacity-50"
                            >
                                {isSubmitting ? 'Saving...' : 'Mark as Done'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
