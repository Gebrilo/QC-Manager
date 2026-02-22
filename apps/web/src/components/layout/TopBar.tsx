'use client';

import Link from 'next/link';
import { useTheme } from '../providers/ThemeProvider';
import { useAuth } from '../providers/AuthProvider';
import { useSidebar } from '../providers/SidebarProvider';
import { getLandingPage } from '../../config/routes';
import { Menu, Moon, Sun, LogOut } from 'lucide-react';
import { NotificationBell } from './NotificationBell';

export function TopBar() {
    const { theme, toggleTheme } = useTheme();
    const { user, logout } = useAuth();
    const { toggleExpanded, toggleMobile } = useSidebar();

    if (!user) return null;

    const logoHref = getLandingPage(user);
    const displayName = user.display_name || user.name;
    const userInitial = displayName?.charAt(0).toUpperCase() || 'U';

    const handleHamburger = () => {
        if (window.innerWidth < 768) {
            toggleMobile();
        } else {
            toggleExpanded();
        }
    };

    return (
        <header className="h-14 flex-shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 transition-colors duration-200">
            <div className="flex items-center justify-between h-full px-4">
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleHamburger}
                        className="p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        aria-label="Toggle navigation"
                    >
                        <Menu className="w-5 h-5" strokeWidth={1.75} />
                    </button>

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
                        aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                    >
                        {theme === 'light' ? (
                            <Moon className="w-[18px] h-[18px]" strokeWidth={1.75} />
                        ) : (
                            <Sun className="w-[18px] h-[18px]" strokeWidth={1.75} />
                        )}
                    </button>

                    <div className="w-px h-5 bg-slate-200 dark:bg-slate-800 mx-0.5 hidden sm:block" />

                    <Link
                        href="/preferences"
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group"
                    >
                        <div className="h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 font-semibold text-xs">
                            {userInitial}
                        </div>
                        <span className="hidden sm:inline text-[13px] font-medium text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white">
                            {displayName}
                        </span>
                    </Link>

                    <button
                        onClick={logout}
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-500 dark:text-slate-500 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Sign out"
                        aria-label="Sign out"
                    >
                        <LogOut className="w-[18px] h-[18px]" strokeWidth={1.75} />
                    </button>
                </div>
            </div>
        </header>
    );
}
