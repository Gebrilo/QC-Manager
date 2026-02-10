'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { taskCommentsApi, type TaskComment } from '@/lib/api';

interface TaskCommentSectionProps {
    taskId: string;
}

export function TaskCommentSection({ taskId }: TaskCommentSectionProps) {
    const [comments, setComments] = useState<TaskComment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newComment, setNewComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        loadComments();
    }, [taskId]);

    const loadComments = async () => {
        try {
            const data = await taskCommentsApi.list(taskId);
            setComments(data);
        } catch (err) {
            console.error('Failed to load comments:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim()) return;

        setIsSubmitting(true);
        try {
            await taskCommentsApi.create(taskId, newComment);
            setNewComment('');
            await loadComments();
        } catch (err) {
            console.error('Failed to add comment:', err);
            alert('Failed to add comment');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (commentId: string) => {
        if (!confirm('Are you sure you want to delete this comment?')) return;

        try {
            await taskCommentsApi.delete(taskId, commentId);
            await loadComments();
        } catch (err) {
            console.error('Failed to delete comment:', err);
            alert('Failed to delete comment');
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diffInSeconds < 60) return 'just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    };

    const getInitials = (email: string) => {
        if (!email || email === 'system') return 'SY';
        return email.substring(0, 2).toUpperCase();
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-sm uppercase tracking-wider text-slate-400">
                    Comments ({comments.length})
                </CardTitle>
            </CardHeader>
            <CardContent>
                {/* Comment Input */}
                <form onSubmit={handleSubmit} className="mb-6">
                    <div className="flex items-stretch gap-2">
                        <input
                            type="text"
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            placeholder="Add a comment..."
                            className="flex-1 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isSubmitting}
                        />
                        <Button
                            type="submit"
                            size="sm"
                            disabled={isSubmitting || !newComment.trim()}
                            className="flex-shrink-0"
                        >
                            {isSubmitting ? '...' : 'Add'}
                        </Button>
                    </div>
                </form>

                {/* Comments List */}
                {isLoading ? (
                    <div className="flex justify-center py-8">
                        <Spinner size="md" />
                    </div>
                ) : comments.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">
                        No comments yet. Be the first to comment!
                    </div>
                ) : (
                    <div className="space-y-4 max-h-[400px] overflow-y-auto">
                        {comments.map((comment) => (
                            <div
                                key={comment.id}
                                className="flex gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group"
                            >
                                {/* Avatar */}
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-700 dark:text-indigo-400 font-bold text-xs">
                                    {getInitials(comment.created_by)}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-slate-900 dark:text-white">
                                                {comment.created_by}
                                            </span>
                                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                                {formatDate(comment.created_at)}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => handleDelete(comment.id)}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                    <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
                                        {comment.comment}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
