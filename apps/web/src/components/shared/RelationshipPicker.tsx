'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { searchApi } from '@/lib/api';

interface SearchResult {
    type: string;
    id: string;
    display_id: string;
    title: string;
    project_id: string;
    project_name: string;
    status: string;
    url: string;
}

interface RelationshipPickerProps {
    searchType: string;
    searchPlaceholder?: string;
    projectId?: string;
    onAdd: (item: SearchResult) => void;
    excludeIds?: string[];
    label?: string;
}

export function RelationshipPicker({ searchType, searchPlaceholder, projectId, onAdd, excludeIds = [], label }: RelationshipPickerProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const doSearch = useCallback(async (q: string) => {
        if (q.length < 2) { setResults([]); setIsOpen(false); return; }
        setIsSearching(true);
        try {
            const params: Record<string, string> = { q, type: searchType, limit: '10' };
            if (projectId) params.project_id = projectId;
            const res = await searchApi.search(params as any);
            setResults(res.data.filter(r => !excludeIds.includes(r.id)));
            setIsOpen(true);
        } catch (err) {
            console.error('Search failed', err);
            setResults([]);
        } finally {
            setIsSearching(false);
            setHasSearched(true);
        }
    }, [searchType, projectId, excludeIds.join(',')]);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => doSearch(query), 300);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [query, doSearch]);

    return (
        <div ref={containerRef} className="relative">
            {label && <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">{label}</label>}
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onFocus={() => { if (results.length > 0) setIsOpen(true); }}
                    placeholder={searchPlaceholder || `Search ${searchType}s...`}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {isSearching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                )}
            </div>
            {isOpen && results.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {results.map(item => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => { onAdd(item); setQuery(''); setIsOpen(false); setResults([]); }}
                            className="w-full text-left px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 flex items-center justify-between group"
                        >
                            <div>
                                <span className="text-sm font-medium text-slate-900 dark:text-white">{item.title}</span>
                                <span className="ml-2 text-xs text-slate-500">{item.display_id}</span>
                            </div>
                            <span className="text-xs text-slate-400">{item.project_name}</span>
                        </button>
                    ))}
                </div>
            )}
            {isOpen && hasSearched && results.length === 0 && !isSearching && (
                <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-3 text-center text-sm text-slate-500">
                    No results found
                </div>
            )}
        </div>
    );
}