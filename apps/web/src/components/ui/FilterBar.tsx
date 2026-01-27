'use client';

import { useState, useEffect } from 'react';
import { useTheme } from '@/components/providers/ThemeProvider';
import { Button } from '@/components/ui/Button'; // Assuming Button component exists, else I'll use standard HTML button or check imports

// Define filter types
export type FilterAttribute = 'status' | 'priority' | 'resource';

export interface FilterConfig {
    id: string;
    name: string;
    filters: {
        search: string;
        attributes: Record<string, string>; // attribute -> value
    };
}

const ATTRIBUTES: { label: string; value: FilterAttribute; options: string[] }[] = [
    { label: 'Status', value: 'status', options: ['Backlog', 'In Progress', 'Done', 'Cancelled'] },
    { label: 'Priority', value: 'priority', options: ['High', 'Medium', 'Low'] }, // Assuming priority exists on Task
    { label: 'Assignee', value: 'resource', options: [] }, // We might need to fetch resources or just allow text input for now? Or mock it.
];

export function FilterBar() {
    const { density, toggleDensity } = useTheme();

    // Default Views
    const defaultViews: FilterConfig[] = [
        { id: 'all', name: 'All Tasks', filters: { search: '', attributes: {} } },
        { id: 'high-pri', name: 'My High Priority', filters: { search: '', attributes: { priority: 'High' } } },
        { id: 'late', name: 'Late Tasks', filters: { search: '', attributes: { status: 'Backlog' } } }, // formalized 'Late' distinct logic might be needed in client, but for now specific attribs
    ];

    const [savedViews, setSavedViews] = useState<FilterConfig[]>(defaultViews);
    const [activeViewId, setActiveViewId] = useState<string>('all');
    const [currentFilters, setCurrentFilters] = useState<Record<string, string>>({});
    const [searchTerm, setSearchTerm] = useState('');

    const [viewDropdownOpen, setViewDropdownOpen] = useState(false);
    const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);

    // Load from local storage on mount
    useEffect(() => {
        const stored = localStorage.getItem('qc_saved_views');
        if (stored) {
            try {
                setSavedViews(JSON.parse(stored));
            } catch (e) {
                console.error("Failed to parse saved views", e);
            }
        }
    }, []);

    // Save to local storage
    const saveView = (name: string) => {
        const newView: FilterConfig = {
            id: Date.now().toString(),
            name,
            filters: {
                search: searchTerm,
                attributes: { ...currentFilters }
            }
        };
        const newViews = [...savedViews, newView];
        setSavedViews(newViews);
        localStorage.setItem('qc_saved_views', JSON.stringify(newViews));
        setActiveViewId(newView.id);
        setViewDropdownOpen(false);
    };

    // Apply a view
    const applyView = (view: FilterConfig) => {
        setActiveViewId(view.id);
        setSearchTerm(view.filters.search);
        setCurrentFilters(view.filters.attributes);
        // Dispatch immediately
        dispatchFilterUpdate(view.filters.search, view.filters.attributes);
        setViewDropdownOpen(false);
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setSearchTerm(val);
        dispatchFilterUpdate(val, currentFilters);
    };

    const addFilter = (attr: string, value: string) => {
        const newFilters = { ...currentFilters, [attr]: value };
        setCurrentFilters(newFilters);
        dispatchFilterUpdate(searchTerm, newFilters);
        setFilterDropdownOpen(false);
    };

    const removeFilter = (attr: string) => {
        const newFilters = { ...currentFilters };
        delete newFilters[attr];
        setCurrentFilters(newFilters);
        dispatchFilterUpdate(searchTerm, newFilters);
    };

    const dispatchFilterUpdate = (search: string, filters: Record<string, string>) => {
        window.dispatchEvent(new CustomEvent('qc-filter-update', {
            detail: { search, filters }
        }));
    };

    // Auto-focus search on '/'
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                e.preventDefault();
                document.getElementById('task-search-input')?.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const activeViewName = savedViews.find(v => v.id === activeViewId)?.name || 'Custom';

    return (
        <div className="flex flex-col gap-4 mb-6 animate-in fade-in slide-in-from-top-4 duration-500">
            {/* Main Bar */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all duration-300">
                {/* Left: Views & Search */}
                <div className="flex items-center gap-4 w-full sm:w-auto flex-1">
                    {/* View Selector */}
                    <div className="relative shrink-0">
                        <button
                            onClick={() => setViewDropdownOpen(!viewDropdownOpen)}
                            className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 transition-colors focus:ring-2 focus:ring-indigo-500/20 outline-none border border-slate-200 dark:border-slate-700"
                        >
                            <span className="text-slate-500 dark:text-slate-500">View:</span>
                            {activeViewName}
                            <svg className={`w-4 h-4 text-slate-400 transition-transform ${viewDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {viewDropdownOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setViewDropdownOpen(false)}></div>
                                <div className="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                    <div className="py-1">
                                        <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Saved Views</div>
                                        {savedViews.map((view) => (
                                            <button
                                                key={view.id}
                                                onClick={() => applyView(view)}
                                                className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center justify-between ${activeViewId === view.id
                                                    ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 font-medium'
                                                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                                                    }`}
                                            >
                                                {view.name}
                                                {activeViewId === view.id && <span className="text-indigo-500">•</span>}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="border-t border-slate-100 dark:border-slate-700 p-2">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="w-full justify-start text-xs h-8"
                                            onClick={() => {
                                                const name = prompt("Enter name for this view:");
                                                if (name) saveView(name);
                                            }}
                                        >
                                            + Save Current as View
                                        </Button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block"></div>

                    {/* Search */}
                    <div className="relative flex-1 max-w-md">
                        <input
                            id="task-search-input"
                            type="text"
                            placeholder="Search tasks..."
                            value={searchTerm}
                            onChange={handleSearchChange}
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                        />
                        <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                    {/* Add Filter Button */}
                    <div className="relative">
                        <button
                            onClick={() => setFilterDropdownOpen(!filterDropdownOpen)}
                            className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 transition-all outline-none"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                            </svg>
                            Filter
                        </button>

                        {filterDropdownOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setFilterDropdownOpen(false)}></div>
                                <div className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-20 animate-in fade-in zoom-in-95 duration-200 p-2">
                                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 py-1 mb-1">Add Filter</div>
                                    <div className="space-y-1">
                                        {ATTRIBUTES.map(attr => (
                                            <div key={attr.value} className="group relative">
                                                <button className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 flex justify-between items-center">
                                                    {attr.label}
                                                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                </button>
                                                {/* Nested dropdown for values - simplified as hover/click for now or just inline expansion. Let's do simple inline expansion or list values below for MVP 'wow' feel */}
                                                <div className="hidden group-hover:block absolute right-full top-0 w-48 mr-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-2">
                                                    {attr.options.length > 0 ? attr.options.map(opt => (
                                                        <button
                                                            key={opt}
                                                            onClick={() => addFilter(attr.value, opt)}
                                                            className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-slate-700 dark:text-slate-300"
                                                        >
                                                            {opt}
                                                        </button>
                                                    )) : (
                                                        <div className="px-3 py-2 text-xs text-slate-400">No options (Mock)</div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <button
                        onClick={toggleDensity}
                        className="p-2 text-slate-400 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400 transition-colors focus:ring-2 focus:ring-indigo-500/20 rounded-lg outline-none"
                        title={`Current density: ${density}`}
                    >
                        {density === 'comfortable' ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>

            {/* Active Filters Row */}
            {Object.keys(currentFilters).length > 0 && (
                <div className="flex flex-wrap gap-2 items-center px-1">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider mr-2">Filters:</span>
                    {Object.entries(currentFilters).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-full text-xs font-medium text-indigo-700 dark:text-indigo-300 group">
                            <span className="opacity-60 capitalize">{key}:</span>
                            <span>{value}</span>
                            <button
                                onClick={() => removeFilter(key)}
                                className="ml-1 p-0.5 rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-500/30 transition-colors"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    ))}
                    <button
                        onClick={() => {
                            setCurrentFilters({});
                            dispatchFilterUpdate(searchTerm, {});
                        }}
                        className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline decoration-dotted underline-offset-2 ml-2"
                    >
                        Clear all
                    </button>
                </div>
            )}
        </div>
    );
}
