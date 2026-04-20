'use client';

import { useState, useRef } from 'react';
import { IDPTaskAttachment, developmentPlansApi } from '@/lib/api';

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface TaskAttachmentsProps {
    attachments: IDPTaskAttachment[];
    isManager: boolean;
    currentUserId: string;
    onUpload: (file: File) => Promise<void>;
    onDelete: (attachmentId: string) => Promise<void>;
}

export default function TaskAttachments({ attachments, isManager, currentUserId, onUpload, onDelete }: TaskAttachmentsProps) {
    const [uploading, setUploading] = useState(false);
    const [downloading, setDownloading] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            await onUpload(file);
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const handleDownload = async (att: IDPTaskAttachment) => {
        setDownloading(att.id);
        try {
            const result = await developmentPlansApi.getAttachmentUrl(att.id);
            window.open(result.url, '_blank');
        } finally {
            setDownloading(null);
        }
    };

    const canDelete = (att: IDPTaskAttachment) => {
        if (isManager) return true;
        return att.uploaded_by_role === 'resource' && att.user_id === currentUserId;
    };

    const managerFiles = attachments.filter(a => a.uploaded_by_role === 'manager');
    const resourceFiles = attachments.filter(a => a.uploaded_by_role === 'resource');

    return (
        <div className="mt-1.5 space-y-2">
            {managerFiles.length > 0 && (
                <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Manager Materials</p>
                    <div className="space-y-1">
                        {managerFiles.map((att) => (
                            <div key={att.id} className="flex items-center gap-2 text-xs bg-purple-50 dark:bg-purple-900/20 px-2 py-1.5 rounded-md group">
                                <svg className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                                <button onClick={() => handleDownload(att)} disabled={downloading === att.id} className="text-purple-700 dark:text-purple-300 hover:underline truncate flex-1 text-left disabled:opacity-50">
                                    {att.original_name}
                                </button>
                                <span className="text-gray-400">{formatFileSize(att.size_bytes)}</span>
                                {canDelete(att) && (
                                    <button onClick={() => onDelete(att.id)} className="opacity-0 group-hover:opacity-100 text-rose-400 hover:text-rose-600 transition-opacity" title="Delete">
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {resourceFiles.length > 0 && (
                <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Submissions</p>
                    <div className="space-y-1">
                        {resourceFiles.map((att) => (
                            <div key={att.id} className="flex items-center gap-2 text-xs bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1.5 rounded-md group">
                                <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <button onClick={() => handleDownload(att)} disabled={downloading === att.id} className="text-emerald-700 dark:text-emerald-300 hover:underline truncate flex-1 text-left disabled:opacity-50">
                                    {att.original_name}
                                </button>
                                <span className="text-gray-400">{formatFileSize(att.size_bytes)}</span>
                                {canDelete(att) && (
                                    <button onClick={() => onDelete(att.id)} className="opacity-0 group-hover:opacity-100 text-rose-400 hover:text-rose-600 transition-opacity" title="Delete">
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <div className="flex items-center gap-2">
                <input ref={fileRef} type="file" className="hidden" onChange={handleFileSelect} accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip" />
                <button onClick={() => fileRef.current?.click()} disabled={uploading} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 flex items-center gap-1 disabled:opacity-50">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    {uploading ? 'Uploading...' : 'Attach file'}
                </button>
            </div>
        </div>
    );
}