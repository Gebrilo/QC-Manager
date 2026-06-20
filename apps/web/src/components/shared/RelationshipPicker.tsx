'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
    /**
     * Minimum characters before searching. The default (2) keeps the field
     * quiet until the user types. Pass 0 to "browse": load a suggested list
     * on focus so the relevant artifacts are visible before any typing.
     */
    minChars?: number;
}

export function RelationshipPicker({
    searchType,
    searchPlaceholder,
    projectId,
    onAdd,
    excludeIds = [],
    label,
    minChars = 2,
}: RelationshipPickerProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    // Only auto-search once the field has been focused, so a browse picker
    // (minChars=0) doesn't pop open on mount.
    const touchedRef = useRef(false);

    // Position the portal-rendered menu under the input. Rendering in a portal
    // escapes the `overflow-hidden` cards the picker lives inside, which would
    // otherwise clip the dropdown.
    const updateMenuPos = useCallback(() => {
        const el = containerRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        setMenuPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }, []);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            const target = e.target as Node;
            if (containerRef.current?.contains(target)) return;
            if (menuRef.current?.contains(target)) return;
            setIsOpen(false);
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        updateMenuPos();
        const reposition = () => updateMenuPos();
        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);
        return () => {
            window.removeEventListener('scroll', reposition, true);
            window.removeEventListener('resize', reposition);
        };
    }, [isOpen, results.length, updateMenuPos]);

    const doSearch = useCallback(async (q: string) => {
        if (q.length < minChars) {
            setResults([]);
            setIsOpen(false);
            return;
        }
        setIsSearching(true);
        try {
            const params: Record<string, string> = { q, type: searchType, limit: '50' };
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
    }, [searchType, projectId, excludeIds.join(','), minChars]);

    useEffect(() => {
        if (!touchedRef.current) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => doSearch(query), 300);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [query, doSearch]);

    const handleFocus = () => {
        touchedRef.current = true;
        updateMenuPos();
        // Browse mode: surface suggestions immediately. Otherwise just reopen
        // an existing result set.
        if (minChars === 0) doSearch(query);
        else if (results.length > 0) setIsOpen(true);
    };

    const handleSelect = (item: SearchResult) => {
        onAdd(item);
        setQuery('');
        if (minChars === 0) {
            // Keep the list open for adding more (multi-select); refresh so the
            // just-added item drops out via excludeIds.
            doSearch('');
        } else {
            setIsOpen(false);
            setResults([]);
        }
    };

    const menu = isOpen && menuPos ? (
        <div
            ref={menuRef}
            style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, width: menuPos.width, zIndex: 9999 }}
            className="rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
        >
            {isSearching && results.length === 0 ? (
                <div className="p-3 text-center text-sm text-slate-500">Searching…</div>
            ) : results.length > 0 ? (
                <div className="max-h-72 overflow-y-auto py-1">
                    {results.map(item => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => handleSelect(item)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                        >
                            <div className="min-w-0">
                                <span className="text-sm font-medium text-slate-900 dark:text-white">{item.title}</span>
                                <span className="ml-2 text-xs text-slate-500">{item.display_id}</span>
                            </div>
                            <span className="shrink-0 text-xs text-slate-400">{item.project_name}</span>
                        </button>
                    ))}
                </div>
            ) : (
                <div className="p-3 text-center text-sm text-slate-500">
                    {query.length >= minChars && hasSearched ? 'No results found' : 'Type to search…'}
                </div>
            )}
        </div>
    ) : null;

    return (
        <div ref={containerRef} className="relative">
            {label && <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">{label}</label>}
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onFocus={handleFocus}
                    placeholder={searchPlaceholder || `Search ${searchType.replace(/_/g, ' ')}s...`}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {isSearching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                )}
            </div>
            {typeof document !== 'undefined' && menu ? createPortal(menu, document.body) : null}
        </div>
    );
}
