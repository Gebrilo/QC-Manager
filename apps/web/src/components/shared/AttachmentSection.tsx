'use client';

import { useState, useEffect, useRef } from 'react';
import { attachmentsApi, type Attachment } from '@/lib/api';

interface Props {
    artifactType: 'bug' | 'user_story' | 'task';
    artifactId: string | null;
    tempId: string | null;
    id?: string;
}

function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPreviewable(mimeType: string) {
    return mimeType.startsWith('image/') || mimeType === 'application/pdf';
}

function FileIcon({ mimeType }: { mimeType: string }) {
    if (mimeType.startsWith('image/')) return <span className="text-base">🖼️</span>;
    if (mimeType === 'application/pdf') return <span className="text-base">📄</span>;
    return <span className="text-base">📎</span>;
}

export function AttachmentSection({ artifactType, artifactId, tempId, id }: Props) {
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [stagedFiles, setStagedFiles] = useState<Array<{ storagePath: string; originalName: string; mimeType: string; sizeBytes: number }>>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [preview, setPreview] = useState<{ url: string; mimeType: string; name: string } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (artifactId) {
            setIsLoading(true);
            attachmentsApi.list(artifactType, artifactId)
                .then(data => setAttachments(data))
                .catch(err => console.error('Failed to load attachments:', err))
                .finally(() => setIsLoading(false));
        }
    }, [artifactId, artifactType]);

    async function handleFile(file: File) {
        setIsUploading(true);
        try {
            if (artifactId) {
                const result = await attachmentsApi.upload(artifactType, artifactId, file);
                setAttachments(prev => [...prev, result]);
            } else if (tempId) {
                const result = await attachmentsApi.uploadStaged(tempId, file);
                setStagedFiles(prev => [...prev, result]);
            }
        } catch (err: any) {
            alert(err.message || 'Upload failed');
        } finally {
            setIsUploading(false);
        }
    }

    async function handlePreview(id: string, name: string, mimeType: string) {
        try {
            const { url } = await attachmentsApi.getUrl(id);
            setPreview({ url, mimeType, name });
        } catch {
            alert('Could not load preview');
        }
    }

    async function handleDownload(id: string) {
        try {
            const { url } = await attachmentsApi.getUrl(id);
            window.open(url, '_blank');
        } catch {
            alert('Could not get download link');
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Delete this attachment?')) return;
        try {
            await attachmentsApi.delete(id);
            setAttachments(prev => prev.filter(a => a.id !== id));
        } catch (err: any) {
            alert(err.message || 'Delete failed');
        }
    }

    async function handleDeleteStaged(storagePath: string) {
        if (!confirm('Remove this attachment?')) return;
        try {
            await attachmentsApi.deleteStaged(storagePath);
            setStagedFiles(prev => prev.filter(f => f.storagePath !== storagePath));
        } catch (err: any) {
            alert(err.message || 'Delete failed');
        }
    }

    return (
        <>
            <div id={id} className="scroll-mt-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">

                {/* Section header — matches SectionCard style */}
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-500 to-slate-700 shadow-lg flex items-center justify-center flex-shrink-0">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Attachments</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Upload files, images, and documents.</p>
                    </div>
                </div>

                <div className="p-6 space-y-4">
                    <div
                        role="button"
                        tabIndex={0}
                        className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-6 text-center cursor-pointer hover:border-violet-400 dark:hover:border-violet-500 hover:bg-violet-50/40 dark:hover:bg-violet-900/10 transition-all"
                        onClick={() => fileRef.current?.click()}
                        onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                    >
                        <input
                            ref={fileRef}
                            type="file"
                            className="hidden"
                            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
                        />
                        {isUploading ? (
                            <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Uploading…
                            </div>
                        ) : (
                            <>
                                <svg className="w-7 h-7 mx-auto mb-2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Drop a file or <span className="text-violet-600 dark:text-violet-400 font-medium">click to upload</span></p>
                                <p className="text-xs text-slate-400 mt-1">PDF, images, Office docs, zip — max 20 MB</p>
                                {!artifactId && tempId && (
                                    <p className="text-xs text-amber-500 mt-1">Files will be linked when you save this record</p>
                                )}
                            </>
                        )}
                    </div>

                    {artifactId && (
                        isLoading ? (
                            <p className="text-sm text-slate-400">Loading…</p>
                        ) : attachments.length === 0 ? (
                            <p className="text-sm text-slate-400">No attachments yet.</p>
                        ) : (
                            <ul className="space-y-2">
                                {attachments.map(att => (
                                    <li key={att.id} className="flex items-center justify-between gap-3 py-2.5 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 text-sm">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <FileIcon mimeType={att.mime_type} />
                                            <span className="truncate text-slate-800 dark:text-slate-200 font-medium">{att.original_name}</span>
                                            <span className="text-xs text-slate-400 flex-shrink-0">{formatSize(att.size_bytes)}</span>
                                        </div>
                                        <div className="flex items-center gap-3 flex-shrink-0">
                                            {isPreviewable(att.mime_type) && (
                                                <button
                                                    type="button"
                                                    onClick={() => handlePreview(att.id, att.original_name, att.mime_type)}
                                                    className="text-xs text-violet-600 dark:text-violet-400 hover:underline font-medium"
                                                >
                                                    Preview
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => handleDownload(att.id)}
                                                className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:underline"
                                            >
                                                Download
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(att.id)}
                                                className="text-xs text-rose-500 hover:text-rose-700 hover:underline"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )
                    )}

                    {!artifactId && stagedFiles.length > 0 && (
                        <ul className="space-y-2">
                            {stagedFiles.map(f => (
                                <li key={f.storagePath} className="flex items-center justify-between gap-3 py-2.5 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 text-sm">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <FileIcon mimeType={f.mimeType} />
                                        <span className="truncate text-slate-800 dark:text-slate-200 font-medium">{f.originalName}</span>
                                        <span className="text-xs text-slate-400 flex-shrink-0">{formatSize(f.sizeBytes)}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteStaged(f.storagePath)}
                                        className="text-xs text-rose-500 hover:text-rose-700 hover:underline flex-shrink-0"
                                    >
                                        Remove
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {preview && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                    onClick={() => setPreview(null)}
                >
                    <div
                        className="max-w-4xl w-full mx-4 max-h-[90vh] overflow-auto rounded-2xl bg-white dark:bg-slate-900 shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
                            <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{preview.name}</span>
                            <button
                                type="button"
                                onClick={() => setPreview(null)}
                                className="text-slate-400 hover:text-slate-600 ml-4 text-lg leading-none"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="p-4">
                            {preview.mimeType.startsWith('image/') ? (
                                <img src={preview.url} alt={preview.name} className="max-w-full h-auto rounded-lg" />
                            ) : (
                                <iframe src={preview.url} className="w-full h-[70vh] rounded-lg border-0" title={preview.name} />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
