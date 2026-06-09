'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from '../providers/ThemeProvider';
import { useAuth } from '../providers/AuthProvider';
import { useSidebar } from '../providers/SidebarProvider';
import { getLandingPage } from '../../config/routes';
import { Menu, Moon, Sun, LogOut, Settings, ChevronDown } from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import { Breadcrumb } from './Breadcrumb';

export function TopBar() {
    const router = useRouter();
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const [isThemeMounted, setIsThemeMounted] = useState(false);
    const { theme, toggleTheme } = useTheme();
    const { user, permissions, logout } = useAuth();
    const { toggleExpanded, toggleMobile } = useSidebar();

    useEffect(() => {
        setIsThemeMounted(true);
    }, []);

    if (!user) return null;

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const logoHref = getLandingPage(user, permissions);
    const displayName = user.display_name || user.name;
    const userInitial = displayName?.charAt(0).toUpperCase() || 'U';
    const rawAvatar = user.avatar_url;
    const avatarSrc = rawAvatar?.startsWith('/uploads/') ? `${API_BASE}${rawAvatar}` : rawAvatar;

    const handleHamburger = () => {
        if (window.innerWidth < 768) {
            toggleMobile();
        } else {
            toggleExpanded();
        }
    };

    const handleLogout = () => {
        logout();
        router.push('/login');
        setIsUserMenuOpen(false);
    };

    return (
        <header className="h-14 flex-shrink-0 glass-panel sticky top-0 z-30 transition-colors duration-200">
            <div className="flex items-center justify-between h-full px-4">
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleHamburger}
                        className="p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        aria-label="Toggle navigation"
                    >
                        <Menu className="w-5 h-5" strokeWidth={1.75} />
                    </button>

                    <div className="hidden md:flex items-center">
                        <Breadcrumb />
                    </div>

                    <Link href={logoHref} className="flex items-center gap-2 md:hidden group">
                        <div className="h-7 w-7 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center text-white font-bold text-[10px] shadow-sm">
                            QC
                        </div>
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                            QC Manager
                        </span>
                    </Link>
                </div>

                <div className="flex items-center gap-1.5">
                    <NotificationBell />

                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        aria-label={!isThemeMounted ? 'Toggle theme' : theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                    >
                        {isThemeMounted && theme === 'dark' ? (
                            <Sun className="w-[18px] h-[18px]" strokeWidth={1.75} />
                        ) : (
                            <Moon className="w-[18px] h-[18px]" strokeWidth={1.75} />
                        )}
                    </button>

                    <div className="w-px h-5 bg-slate-200 dark:bg-slate-800 mx-0.5 hidden sm:block" />

                    <div className="relative">
                        <button
                            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group"
                            aria-label="User menu"
                            aria-expanded={isUserMenuOpen}
                        >
                            {avatarSrc ? (
                                <img
                                    src={avatarSrc}
                                    alt={displayName || 'User'}
                                    className="h-7 w-7 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                                />
                            ) : (
                                <div className="h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 font-semibold text-xs">
                                    {userInitial}
                                </div>
                            )}
                            <span className="hidden sm:inline text-[13px] font-medium text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white">
                                {displayName}
                            </span>
                            <ChevronDown className="hidden sm:inline w-4 h-4 text-slate-400" strokeWidth={1.75} />
                        </button>

                        {isUserMenuOpen && (
                            <>
                                <div
                                    className="fixed inset-0 z-10"
                                    onClick={() => setIsUserMenuOpen(false)}
                                />
                                <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 z-20 py-1">
                                    <Link
                                        href="/me/preferences"
                                        className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                        onClick={() => setIsUserMenuOpen(false)}
                                    >
                                        <Settings className="w-4 h-4" strokeWidth={1.75} />
                                        Preferences
                                    </Link>
                                    <div className="border-t border-slate-200 dark:border-slate-800 my-1" />
                                    <button
                                        onClick={handleLogout}
                                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                                    >
                                        <LogOut className="w-4 h-4" strokeWidth={1.75} />
                                        Sign out
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
}
