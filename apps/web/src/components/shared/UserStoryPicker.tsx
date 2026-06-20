'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { searchApi, userStoriesApi, type UserStory } from '@/lib/api';
import { filterUserStories, getUserStoryDisplayId } from '@/lib/userStoryMatch';

type PickerStory = UserStory & {
    display_id?: string;
};

interface UserStoryPickerProps {
    projectId?: string;
    value?: string | null;
    onChange: (id: string | null) => void;
    initialValueId?: string | null;
    label?: string;
    disabled?: boolean;
}

function storySubtitle(story: PickerStory) {
    return [story.status, story.priority].filter(Boolean).join(' / ');
}

function normalizeSearchResult(result: Awaited<ReturnType<typeof searchApi.search>>['data'][number]): PickerStory {
    return {
        id: result.id,
        display_id: result.display_id,
        title: result.title,
        project_id: result.project_id,
        project_name: result.project_name,
        status: result.status,
        priority: result.priority || undefined,
    };
}

export function UserStoryPicker({
    projectId,
    value,
    onChange,
    initialValueId,
    label = 'Parent User Story',
    disabled = false,
}: UserStoryPickerProps) {
    const inputId = useId();
    const listboxId = `${inputId}-listbox`;
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    const isDisabled = disabled || !projectId;
    const [query, setQuery] = useState('');
    const [projectStories, setProjectStories] = useState<PickerStory[]>([]);
    const [results, setResults] = useState<PickerStory[]>([]);
    const [selectedStory, setSelectedStory] = useState<PickerStory | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [hasLoadedProject, setHasLoadedProject] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [isUnresolved, setIsUnresolved] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);

    const activeDescendant = isOpen && results[activeIndex] ? `${inputId}-option-${results[activeIndex].id}` : undefined;

    const loadProjectStories = useCallback(async () => {
        if (!projectId || isDisabled) return;
        setIsLoading(true);
        try {
            const res = await userStoriesApi.list({ project_id: projectId, limit: 50 });
            const stories = res.data || [];
            setProjectStories(stories);
            setResults(filterUserStories(query, stories).slice(0, 10));
            setHasLoadedProject(true);
        } catch (err) {
            console.error('Failed to load user stories', err);
            setProjectStories([]);
            setResults([]);
            setHasLoadedProject(true);
        } finally {
            setIsLoading(false);
        }
    }, [isDisabled, projectId, query]);

    const openPicker = useCallback(() => {
        if (isDisabled) return;
        setIsOpen(true);
        setActiveIndex(0);
        if (!hasLoadedProject) {
            void loadProjectStories();
        } else {
            setResults(filterUserStories(query, projectStories).slice(0, 10));
        }
    }, [hasLoadedProject, isDisabled, loadProjectStories, projectStories, query]);

    const selectStory = useCallback((story: PickerStory) => {
        setSelectedStory(story);
        setIsUnresolved(false);
        setQuery('');
        setIsOpen(false);
        onChange(story.id);
    }, [onChange]);

    const clearSelection = useCallback(() => {
        setSelectedStory(null);
        setIsUnresolved(false);
        setQuery('');
        setIsOpen(false);
        onChange(null);
        inputRef.current?.focus();
    }, [onChange]);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        setProjectStories([]);
        setResults([]);
        setHasLoadedProject(false);
        setHasSearched(false);
        setIsOpen(false);
        setQuery('');
    }, [projectId]);

    useEffect(() => {
        let cancelled = false;
        const idToResolve = value !== undefined && value !== null ? value : initialValueId || '';

        if (!idToResolve) {
            setSelectedStory(null);
            setIsUnresolved(false);
            return;
        }

        if (selectedStory?.id === idToResolve) return;

        const cached = projectStories.find(story => story.id === idToResolve);
        if (cached) {
            setSelectedStory(cached);
            setIsUnresolved(false);
            return;
        }

        setIsLoading(true);
        userStoriesApi.get(idToResolve)
            .then(story => {
                if (cancelled) return;
                setSelectedStory(story);
                setIsUnresolved(false);
            })
            .catch(err => {
                if (cancelled) return;
                console.error('Failed to resolve linked user story', err);
                setSelectedStory(null);
                setIsUnresolved(true);
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [initialValueId, projectStories, selectedStory?.id, value]);

    useEffect(() => {
        if (!isOpen || isDisabled) return;

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            const trimmed = query.trim();
            const localMatches = filterUserStories(trimmed, projectStories).slice(0, 10);

            if (trimmed.length < 2) {
                setResults(localMatches);
                setHasSearched(false);
                setActiveIndex(0);
                return;
            }

            setIsLoading(true);
            try {
                const res = await searchApi.search({
                    q: trimmed,
                    type: 'user_story',
                    project_id: projectId,
                    limit: 10,
                });
                const remoteMatches = res.data.map(normalizeSearchResult);
                const byId = new Map<string, PickerStory>();
                for (const story of [...localMatches, ...remoteMatches]) byId.set(story.id, story);
                setResults(Array.from(byId.values()).slice(0, 10));
                setHasSearched(true);
                setActiveIndex(0);
            } catch (err) {
                console.error('User story search failed', err);
                setResults(localMatches);
                setHasSearched(true);
            } finally {
                setIsLoading(false);
            }
        }, 300);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [isDisabled, isOpen, projectId, projectStories, query]);

    const statusText = useMemo(() => {
        if (!projectId) return 'Select a project first';
        if (isLoading) return 'Loading user stories...';
        if (!hasLoadedProject && !hasSearched) return '';
        if (projectStories.length === 0 && query.trim().length < 2) return 'No user stories to link';
        if (results.length === 0) return 'No results';
        return '';
    }, [hasLoadedProject, hasSearched, isLoading, projectId, projectStories.length, query, results.length]);

    return (
        <div ref={containerRef} className="relative md:col-span-2">
            {label && <label htmlFor={inputId} className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">{label}</label>}

            {selectedStory && (
                <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm dark:border-indigo-900/60 dark:bg-indigo-950/40">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="shrink-0 text-xs font-semibold text-indigo-700 dark:text-indigo-300">{getUserStoryDisplayId(selectedStory)}</span>
                            <span className="truncate font-medium text-slate-900 dark:text-white">{selectedStory.title}</span>
                        </div>
                        {storySubtitle(selectedStory) && (
                            <div className="text-xs text-slate-500 dark:text-slate-400">{storySubtitle(selectedStory)}</div>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={clearSelection}
                        disabled={disabled}
                        aria-label="Clear parent user story"
                        className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-white hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                        <X className="h-4 w-4" aria-hidden />
                    </button>
                </div>
            )}

            {isUnresolved && (
                <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                    Linked user story is unresolved. Pick a new one or clear the field.
                </div>
            )}

            <div className="relative">
                <input
                    id={inputId}
                    ref={inputRef}
                    type="text"
                    value={query}
                    disabled={isDisabled}
                    onChange={e => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={openPicker}
                    onKeyDown={e => {
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            if (!isOpen) openPicker();
                            setActiveIndex(index => Math.min(index + 1, Math.max(results.length - 1, 0)));
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setActiveIndex(index => Math.max(index - 1, 0));
                        } else if (e.key === 'Enter') {
                            if (isOpen && results[activeIndex]) {
                                e.preventDefault();
                                selectStory(results[activeIndex]);
                            }
                        } else if (e.key === 'Escape') {
                            setIsOpen(false);
                        }
                    }}
                    role="combobox"
                    aria-expanded={isOpen}
                    aria-controls={listboxId}
                    aria-activedescendant={activeDescendant}
                    aria-autocomplete="list"
                    placeholder={projectId ? 'Search or browse user stories...' : 'Select a project first'}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 pr-10 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                />
                {isLoading && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-indigo-500" aria-hidden />
                )}
            </div>

            {isOpen && (
                <div
                    id={listboxId}
                    role="listbox"
                    className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
                >
                    {results.length > 0 ? (
                        <div className="max-h-60 overflow-y-auto py-1">
                            {results.map((story, index) => (
                                <button
                                    id={`${inputId}-option-${story.id}`}
                                    key={story.id}
                                    type="button"
                                    role="option"
                                    aria-selected={index === activeIndex}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    onClick={() => selectStory(story)}
                                    className={`w-full px-3 py-2 text-left ${index === activeIndex ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-700/70'}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="shrink-0 text-xs font-semibold text-indigo-700 dark:text-indigo-300">{getUserStoryDisplayId(story)}</span>
                                        <span className="truncate text-sm font-medium text-slate-900 dark:text-white">{story.title}</span>
                                    </div>
                                    {storySubtitle(story) && (
                                        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{storySubtitle(story)}</div>
                                    )}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="p-3 text-center text-sm text-slate-500 dark:text-slate-400">
                            {statusText || 'No results'}
                        </div>
                    )}
                </div>
            )}

            {!isOpen && statusText && !selectedStory && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{statusText}</p>
            )}
        </div>
    );
}
