'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchApi } from '../../../../../src/lib/api';
import { ArrowLeft, CheckCircle2, Lock, Download, FileText } from 'lucide-react';

interface TaskProgress {
    total: number;
    completed: number;
    mandatory_total: number;
    mandatory_completed: number;
    is_complete: boolean;
}

interface ChapterProgress {
    total_quests: number;
    completed_quests: number;
    mandatory_total: number;
    mandatory_completed: number;
    is_complete: boolean;
}

interface Attachment {
    id: string;
    original_name: string;
    size_bytes: number;
    created_at: string;
}

interface Task {
    id: string;
    title: string;
    description: string;
    task_type: string;
    validation_type: string;
    is_mandatory: boolean;
    is_completed: boolean;
    validation_data?: any;
    xp_reward: number;
    completion?: {
        validation_data: any;
        completed_at: string;
    };
    attachment?: Attachment | null;
}

interface Quest {
    id: string;
    title: string;
    description: string;
    is_mandatory: boolean;
    tasks: Task[];
    progress: TaskProgress;
}

interface Chapter {
    id: string;
    title: string;
    description: string;
    is_locked: boolean;
    lock_reason: string;
    quests: Quest[];
    progress: ChapterProgress;
}

interface JourneyDetails {
    id: string;
    user_id: string;
    journey_id: string;
    title: string;
    description: string;
    status: string;
    total_xp: number;
    chapters: Chapter[];
}

export default function TeamJourneyDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const userId = params?.userId as string;
    const journeyId = params?.journeyId as string;

    const [journey, setJourney] = useState<JourneyDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [downloadingTasks, setDownloadingTasks] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (!userId || !journeyId) return;

        setLoading(true);
        fetchApi<JourneyDetails>(`/manager/team/${userId}/journeys/${journeyId}`)
            .then(data => setJourney(data))
            .catch(err => setError(err.message || 'Failed to load journey details'))
            .finally(() => setLoading(false));
    }, [userId, journeyId]);

    const handleDownload = async (taskId: string, originalName: string) => {
        try {
            setDownloadingTasks(prev => ({ ...prev, [taskId]: true }));
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/manager/team/${userId}/journeys/${journeyId}/tasks/${taskId}/attachment`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to download file');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = originalName || 'download';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err: any) {
            console.error('Download error:', err);
            alert(err.message || 'Failed to download attachment');
        } finally {
            setDownloadingTasks(prev => ({ ...prev, [taskId]: false }));
        }
    };

    const renderTaskInput = (task: Task) => {
        if (task.validation_type === 'file_upload') {
            return (
                <div className="mt-3 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Uploaded File:</p>
                    {task.attachment ? (
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded">
                                    <FileText className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-slate-900 dark:text-white">{task.attachment.original_name}</p>
                                    <p className="text-xs text-slate-500">{(task.attachment.size_bytes / 1024).toFixed(1)} KB</p>
                                </div>
                            </div>
                            <button
                                onClick={() => handleDownload(task.id, task.attachment!.original_name)}
                                disabled={downloadingTasks[task.id]}
                                className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                            >
                                {downloadingTasks[task.id] ? (
                                    <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <Download className="w-4 h-4" />
                                )}
                                Download
                            </button>
                        </div>
                    ) : (
                        <p className="text-sm text-slate-500 italic">No file attached</p>
                    )}
                </div>
            );
        }

        if (task.validation_type === 'text_input') {
            const answer = task.completion?.validation_data?.text || '';
            return (
                <div className="mt-3">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 mt-4 mt-r">User Input:</p>
                    <textarea
                        readOnly
                        disabled
                        value={answer}
                        className="w-full text-sm p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 rounded-lg resize-none min-h-[80px]"
                        placeholder="No input provided"
                    />
                </div>
            );
        }

        if (task.validation_type === 'multiple_choice') {
            const selected = task.completion?.validation_data?.selected_option || '';
            return (
                <div className="mt-3">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 mt-4 mt-r">Selected Option:</p>
                    <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
                        <p className="text-sm text-slate-700 dark:text-slate-300">{selected || <span className="text-slate-400 italic">No option selected</span>}</p>
                    </div>
                </div>
            )
        }

        return null;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (error || !journey) {
        return (
            <div>
                <button onClick={() => router.back()} className="flex items-center text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 mb-6">
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Back to Team Journeys
                </button>
                <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg text-rose-700 dark:text-rose-400">
                    {error || 'Journey not found'}
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto pb-12">
            <button
                onClick={() => router.back()}
                className="flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Team Overview
            </button>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 md:p-8 mb-8 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold rounded-full uppercase tracking-wider">
                            Read Only
                        </span>
                        <span className={`px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider ${journey.status === 'completed' ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300' :
                            journey.status === 'in_progress' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' :
                                'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}>
                            {journey.status.replace('_', ' ')}
                        </span>
                    </div>
                    {journey.total_xp > 0 && (
                        <div className="text-right">
                            <span className="text-2xl font-black text-violet-600 dark:text-violet-400 tracking-tight">{journey.total_xp}</span>
                            <span className="text-sm font-semibold text-slate-500 dark:text-slate-400 ml-1">XP</span>
                        </div>
                    )}
                </div>

                <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-3">{journey.title}</h1>
                {journey.description && (
                    <p className="text-slate-600 dark:text-slate-400 text-lg leading-relaxed max-w-3xl">
                        {journey.description}
                    </p>
                )}
            </div>

            <div className="space-y-6">
                {journey.chapters.map((chapter, cIdx) => (
                    <div key={chapter.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                        <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 p-5">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                                        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-sm">
                                            {cIdx + 1}
                                        </span>
                                        {chapter.title}
                                        {chapter.progress.is_complete && (
                                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                        )}
                                    </h2>
                                    {chapter.description && (
                                        <p className="text-slate-500 dark:text-slate-400 mt-2 ml-11 text-sm">{chapter.description}</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="p-5">
                            <div className="space-y-8">
                                {chapter.quests.map((quest, qIdx) => (
                                    <div key={quest.id} className="relative pl-6 border-l-2 border-slate-200 dark:border-slate-700 last:border-transparent pb-2">
                                        <div className="absolute -left-[11px] top-0 w-5 h-5 rounded-full bg-white dark:bg-slate-900 border-4 border-slate-200 dark:border-slate-700" />

                                        <div className="mb-4">
                                            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                                {quest.title}
                                                {quest.is_mandatory && <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-full">Required</span>}
                                                {quest.progress.is_complete && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                            </h3>
                                            {quest.description && <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{quest.description}</p>}
                                        </div>

                                        <div className="space-y-4">
                                            {quest.tasks.map(task => (
                                                <div
                                                    key={task.id}
                                                    className={`p-4 rounded-xl border ${task.is_completed
                                                        ? 'bg-white dark:bg-slate-900 border-emerald-200 dark:border-emerald-800/50'
                                                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                                                        }`}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <div className="mt-0.5">
                                                            {task.is_completed ? (
                                                                <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                                </div>
                                                            ) : (
                                                                <div className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-600" />
                                                            )}
                                                        </div>
                                                        <div className="flex-1">
                                                            <div className="flex justify-between items-start">
                                                                <h4 className="font-semibold text-slate-900 dark:text-slate-100">{task.title}</h4>
                                                                {task.xp_reward > 0 && (
                                                                    <span className="text-xs font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 px-2 py-1 rounded-md">
                                                                        +{task.xp_reward} XP
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {task.description && (
                                                                <p className="text-slate-600 dark:text-slate-400 text-sm mt-1 max-w-2xl">{task.description}</p>
                                                            )}

                                                            {task.is_completed && renderTaskInput(task)}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
