'use client';

interface ViewToggleProps {
    view: 'table' | 'board';
    onChange: (view: 'table' | 'board') => void;
}

export function ViewToggle({ view, onChange }: ViewToggleProps) {
    return (
        <div className="flex items-center glass-card p-1 gap-1">
            {/* Table View Button */}
            <button
                onClick={() => onChange('table')}
                aria-pressed={view === 'table'}
                aria-label="Switch to table view"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${view === 'table'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100/60 dark:hover:bg-slate-800/60'
                    }`}
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M3 10h18M3 14h18M3 6h18M3 18h18" />
                </svg>
                <span className="hidden sm:inline">Table</span>
            </button>

            {/* Board View Button */}
            <button
                onClick={() => onChange('board')}
                aria-pressed={view === 'board'}
                aria-label="Switch to board view"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${view === 'board'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100/60 dark:hover:bg-slate-800/60'
                    }`}
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
                <span className="hidden sm:inline">Board</span>
            </button>
        </div>
    );
}
