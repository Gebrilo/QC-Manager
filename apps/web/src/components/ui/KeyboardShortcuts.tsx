'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function KeyboardShortcuts() {
    const router = useRouter();
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Show hint on mount
        setIsVisible(true);
        const timer = setTimeout(() => setIsVisible(false), 5000); // Fade out after 5s

        const handleKeyDown = (e: KeyboardEvent) => {
            // New Task: 'n' (if not typing in input)
            if (e.key.toLowerCase() === 'n' && !isInputActive()) {
                e.preventDefault();
                router.push('/tasks/create');
            }

            // Search: '/' (if not typing)
            if (e.key === '/' && !isInputActive()) {
                e.preventDefault();
                // If we had a search input, we'd focus it here.
                // For now, toggle visibility of shortcuts to acknowledge
                setIsVisible(true);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            clearTimeout(timer);
        };
    }, [router]);

    const isInputActive = () => {
        const activeElement = document.activeElement;
        return activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement;
    };

    return (
        <div className={`fixed bottom-6 right-6 z-40 transition-opacity duration-500 ${isVisible ? 'opacity-100' : 'opacity-30 hover:opacity-100'}`}>
            <div className="bg-slate-900/80 dark:bg-slate-800/90 backdrop-blur text-xs text-slate-400 px-3 py-2 rounded-full border border-slate-700/50 shadow-lg flex items-center gap-3">
                <div className="flex items-center gap-1">
                    <kbd className="bg-slate-800 text-slate-200 px-1.5 py-0.5 rounded border border-slate-700 font-sans min-w-[20px] text-center">N</kbd>
                    <span>New Task</span>
                </div>
                <div className="w-px h-3 bg-slate-700"></div>
                <div className="flex items-center gap-1">
                    <kbd className="bg-slate-800 text-slate-200 px-1.5 py-0.5 rounded border border-slate-700 font-sans min-w-[20px] text-center">Esc</kbd>
                    <span>Close</span>
                </div>
            </div>
        </div>
    );
}
