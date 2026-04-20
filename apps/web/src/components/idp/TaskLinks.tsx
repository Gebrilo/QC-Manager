'use client';

import { useState } from 'react';
import { IDPTaskLink } from '@/lib/api';

interface TaskLinksProps {
    links: IDPTaskLink[];
    isManager: boolean;
    onAddLink?: (url: string, label: string) => Promise<void>;
    onDeleteLink?: (linkId: string) => Promise<void>;
}

export default function TaskLinks({ links, isManager, onAddLink, onDeleteLink }: TaskLinksProps) {
    const [showAdd, setShowAdd] = useState(false);
    const [newUrl, setNewUrl] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleAdd = async () => {
        if (!newUrl.trim() || !newLabel.trim()) return;
        setSubmitting(true);
        try {
            await onAddLink?.(newUrl.trim(), newLabel.trim());
            setNewUrl('');
            setNewLabel('');
            setShowAdd(false);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="mt-1.5">
            {links.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {links.map((link) => (
                        <span key={link.id} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 px-2 py-0.5 rounded-md group">
                            <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.172 13.828a4 4 0 015.656 0l4 4a4 4 0 01-5.656 5.656l-1.102-1.101" /></svg>
                            <a href={link.url} target="_blank" rel="noopener noreferrer" className="hover:underline truncate max-w-[150px]">{link.label}</a>
                            {isManager && onDeleteLink && (
                                <button onClick={() => onDeleteLink(link.id)} className="opacity-0 group-hover:opacity-100 ml-0.5 text-blue-400 hover:text-rose-500 transition-opacity" title="Remove link">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            )}
                        </span>
                    ))}
                </div>
            )}
            {isManager && onAddLink && (
                <div className="mt-1">
                    {showAdd ? (
                        <div className="flex gap-1.5 items-center">
                            <input type="text" placeholder="Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="text-xs border rounded px-2 py-1 w-28 dark:bg-gray-800 dark:border-gray-600" />
                            <input type="url" placeholder="https://..." value={newUrl} onChange={(e) => setNewUrl(e.target.value)} className="text-xs border rounded px-2 py-1 flex-1 min-w-0 dark:bg-gray-800 dark:border-gray-600" />
                            <button onClick={handleAdd} disabled={submitting} className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50">Add</button>
                            <button onClick={() => { setShowAdd(false); setNewUrl(''); setNewLabel(''); }} className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700">Cancel</button>
                        </div>
                    ) : (
                        <button onClick={() => setShowAdd(true)} className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            Add link
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}