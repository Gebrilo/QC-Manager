'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useTheme } from '../providers/ThemeProvider';

export function Header() {
    const { theme, toggleTheme } = useTheme();
    const [userName, setUserName] = useState('John Doe');
    const [userAvatar, setUserAvatar] = useState('');

    useEffect(() => {
        const updatePrefs = () => {
            setUserName(localStorage.getItem('user-name') || 'John Doe');
            setUserAvatar(localStorage.getItem('user-avatar') || '');
        };

        updatePrefs();
        window.addEventListener('user-prefs-updated', updatePrefs);

        // Listener for the FilterBar theme toggle shortcut
        const handleToggle = () => toggleTheme();
        window.addEventListener('qc-toggle-theme', handleToggle);

        return () => {
            window.removeEventListener('user-prefs-updated', updatePrefs);
            window.removeEventListener('qc-toggle-theme', handleToggle);
        };
    }, [toggleTheme]);

    const userInitial = userName.charAt(0).toUpperCase();

    return (
        <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50 transition-colors duration-300">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16 items-center">
                    {/* Logo */}
                    <Link href="/" className="flex items-center gap-3 group">
                        <div className="h-9 w-9 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                            QC
                        </div>
                        <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300">
                            QC Manager
                        </span>
                    </Link>

                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex items-center gap-1">
                        <Link href="/" className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
                            Dashboard
                        </Link>
                        <Link href="/tasks" className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
                            Tasks
                        </Link>
                        <Link href="/projects" className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
                            Projects
                        </Link>
                        <Link href="/resources" className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
                            Resources
                        </Link>
                        <Link href="/governance" className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
                            Governance
                        </Link>
                        <Link href="/test-executions" className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
                            Test Runs
                        </Link>
                        <Link href="/reports" className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
                            Reports
                        </Link>
                    </nav>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={toggleTheme}
                            className="p-2 rounded-full text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        >
                            {theme === 'light' ? (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                                </svg>
                            ) : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 18v1m9-11h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                            )}
                        </button>

                        <div className="w-px h-6 bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block"></div>

                        <Link href="/preferences" className="flex items-center gap-2 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-all group">
                            <div className="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-700 dark:text-indigo-400 font-bold text-xs overflow-hidden">
                                {userAvatar ? (
                                    <img src={userAvatar} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    userInitial
                                )}
                            </div>
                            <span className="hidden sm:inline text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                {userName}
                            </span>
                        </Link>
                    </div>
                </div>
            </div>
        </header>
    );
}
