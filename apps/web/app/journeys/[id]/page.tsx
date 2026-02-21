'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { myJourneysApi, JourneyWithProgress, JourneyChapter, JourneyQuest, JourneyTask } from '../../../src/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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
            // Auto-expand first unlocked incomplete chapter
            if (data.chapters) {
                const firstIncomplete = data.chapters.find(ch => !ch.is_locked && !ch.progress?.is_complete);
                if (firstIncomplete) {
                    setExpandedChapters(new Set([firstIncomplete.id]));
                } else {
                    // All complete or locked - expand first chapter
                    const firstUnlocked = data.chapters.find(ch => !ch.is_locked);
                    if (firstUnlocked) {
                        setExpandedChapters(new Set([firstUnlocked.id]));
                    }
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
    const totalXp = journey.total_xp || 0;
    const maxXp = journey.chapters?.reduce((sum, ch) => sum + (ch.xp_reward || 0), 0) || 0;

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
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{journey.title}</h1>
                    {maxXp > 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800">
                            <svg className="w-4 h-4 text-violet-500" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            <span className="text-sm font-bold text-violet-700 dark:text-violet-300">{totalXp}</span>
                            <span className="text-xs text-violet-500 dark:text-violet-400">/ {maxXp} XP</span>
                        </div>
                    )}
                </div>
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
                        onToggle={() => !chapter.is_locked && toggleChapter(chapter.id)}
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
    const isLocked = chapter.is_locked;

    return (
        <div className={`bg-white dark:bg-slate-900 border rounded-xl overflow-hidden ${
            isLocked
                ? 'border-slate-200 dark:border-slate-800 opacity-60'
                : 'border-slate-200 dark:border-slate-800'
        }`}>
            <button
                onClick={onToggle}
                disabled={isLocked}
                className={`w-full flex items-center justify-between p-4 transition-colors ${
                    isLocked ? 'cursor-not-allowed' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
            >
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isLocked
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600'
                            : isComplete
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}>
                        {isLocked ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        ) : isComplete ? (
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
                            {(chapter.xp_reward || 0) > 0 && (
                                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                    isComplete
                                        ? 'bg-violet-100 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                                }`}>
                                    {isComplete ? '+' : ''}{chapter.xp_reward} XP
                                </span>
                            )}
                        </div>
                        {isLocked ? (
                            <p className="text-sm text-slate-400 dark:text-slate-500">Complete the previous chapter to unlock</p>
                        ) : chapter.description ? (
                            <p className="text-sm text-slate-500 dark:text-slate-400">{chapter.description}</p>
                        ) : null}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {progress && !isLocked && (
                        <span className="text-xs text-slate-500">
                            {progress.completed_quests}/{progress.total_quests} quests
                        </span>
                    )}
                    {!isLocked && (
                        <svg className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    )}
                </div>
            </button>

            {isExpanded && !isLocked && (
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
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploadError, setUploadError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleComplete = async (validationData: Record<string, any> = {}) => {
        setIsSubmitting(true);
        try {
            await myJourneysApi.completeTask(journeyId, task.id, validationData);
            onComplete();
        } catch (err: any) {
            console.error('Failed to complete task:', err);
            if (err.message?.includes('previous chapter')) {
                alert(err.message);
            }
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

    const handleFileUpload = async () => {
        if (!selectedFile) return;
        setIsSubmitting(true);
        setUploadError('');
        try {
            const attachment = await myJourneysApi.uploadFile(journeyId, task.id, selectedFile);
            // Now complete the task with file info
            await myJourneysApi.completeTask(journeyId, task.id, {
                file: {
                    filename: attachment.filename,
                    original_name: attachment.original_name,
                    mime_type: attachment.mime_type,
                    size_bytes: attachment.size_bytes,
                },
            });
            setSelectedFile(null);
            onComplete();
        } catch (err: any) {
            console.error('Failed to upload file:', err);
            setUploadError(err.message || 'Upload failed');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (task.is_completed) {
        const completionData = task.completion?.validation_data;
        return (
            <div className="flex items-start gap-3 p-3 bg-white dark:bg-slate-900 rounded-lg border border-emerald-200 dark:border-emerald-900">
                <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 line-through">{task.title}</p>
                    {/* Show uploaded file info if this was a file_upload task */}
                    {task.validation_type === 'file_upload' && completionData?.file && (
                        <div className="mt-1 flex items-center gap-2">
                            <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                            <a
                                href={`${API_URL}/uploads/journey-tasks/${completionData.file.filename}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                                {completionData.file.original_name}
                            </a>
                            <span className="text-xs text-slate-400">
                                ({Math.round((completionData.file.size_bytes || 0) / 1024)} KB)
                            </span>
                        </div>
                    )}
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
                                                    Min {task.validation_config.min_text_length} chars ({textValue.length})
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
                            <div className="space-y-2">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept={task.validation_config?.allowed_types || undefined}
                                    onChange={(e) => {
                                        setSelectedFile(e.target.files?.[0] || null);
                                        setUploadError('');
                                    }}
                                    className="hidden"
                                />
                                {!selectedFile ? (
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                        </svg>
                                        Choose File to Upload
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-2 flex-1 min-w-0 px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                            <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                            </svg>
                                            <span className="text-xs text-slate-700 dark:text-slate-300 truncate">{selectedFile.name}</span>
                                            <span className="text-xs text-slate-400 flex-shrink-0">({Math.round(selectedFile.size / 1024)} KB)</span>
                                        </div>
                                        <button
                                            onClick={handleFileUpload}
                                            disabled={isSubmitting}
                                            className="text-xs font-medium px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 flex-shrink-0"
                                        >
                                            {isSubmitting ? 'Uploading...' : 'Upload & Submit'}
                                        </button>
                                        <button
                                            onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                                            className="text-xs text-slate-400 hover:text-slate-600 flex-shrink-0"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                )}
                                {uploadError && (
                                    <p className="text-xs text-rose-500">{uploadError}</p>
                                )}
                                {task.validation_config?.allowed_types && (
                                    <p className="text-xs text-slate-400">Accepted: {task.validation_config.allowed_types}</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
