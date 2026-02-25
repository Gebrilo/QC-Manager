'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../providers/AuthProvider';
import { useSidebar } from '../providers/SidebarProvider';
import { getNavbarRoutes, getLandingPage } from '../../config/routes';
import { ChevronsLeft, ChevronsRight, X } from 'lucide-react';

export function Sidebar() {
    const { user, permissions, isAdmin, hasPermission } = useAuth();
    const { isExpanded, isMobileOpen, toggleExpanded, closeMobile } = useSidebar();
    const pathname = usePathname();

    if (!user) return null;

    const navLinks = getNavbarRoutes().filter(route => {
        if (route.requiresActivation && !user.activated) return false;
        if (route.adminOnly && !isAdmin) return false;
        if (route.permission && !hasPermission(route.permission)) return false;
        return true;
    });

    const logoHref = getLandingPage(user, permissions);

    const isActive = (path: string) => {
        if (pathname === path) return true;
        if (path !== '/' && pathname?.startsWith(path + '/')) return true;
        return false;
    };

    const sidebarContent = (
        <div className="flex flex-col h-full">
            <div className={`flex items-center h-14 border-b border-slate-200 dark:border-slate-800 flex-shrink-0 ${isExpanded ? 'px-4' : 'px-0 justify-center'}`}>
                <Link href={logoHref} className="flex items-center gap-2.5 group" onClick={closeMobile}>
                    <div className="h-8 w-8 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-md flex-shrink-0">
                        QC
                    </div>
                    {isExpanded && (
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            QC Manager
                        </span>
                    )}
                </Link>
                <button
                    onClick={closeMobile}
                    className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors md:hidden"
                    aria-label="Close menu"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <nav className="flex-1 overflow-y-auto sidebar-scrollbar py-3 px-2" aria-label="Main navigation">
                <ul className="space-y-0.5">
                    {navLinks.map(route => {
                        const Icon = route.icon;
                        const active = isActive(route.path);
                        return (
                            <li key={route.path}>
                                <Link
                                    href={route.path}
                                    onClick={closeMobile}
                                    aria-current={active ? 'page' : undefined}
                                    title={!isExpanded ? route.label : undefined}
                                    className={`flex items-center gap-3 rounded-lg transition-all duration-150 ${isExpanded ? 'px-3 py-2.5' : 'px-0 py-2.5 justify-center'} ${active
                                            ? 'bg-slate-100 dark:bg-slate-800/60 text-slate-900 dark:text-white border-l-2 border-indigo-500 ml-0 pl-2.5'
                                            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40 hover:text-slate-700 dark:hover:text-slate-300 border-l-2 border-transparent'
                                        }`}
                                >
                                    {Icon && <Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.75} aria-hidden="true" />}
                                    {isExpanded && (
                                        <span className="text-[13px] font-medium truncate">{route.label}</span>
                                    )}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            <div className="border-t border-slate-200 dark:border-slate-800 p-2 flex-shrink-0 hidden md:block">
                <button
                    onClick={toggleExpanded}
                    className={`flex items-center gap-2 w-full rounded-lg py-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${isExpanded ? 'px-3' : 'justify-center px-0'}`}
                    aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
                >
                    {isExpanded ? (
                        <>
                            <ChevronsLeft className="w-4 h-4 flex-shrink-0" strokeWidth={1.75} />
                            <span className="text-xs font-medium">Collapse</span>
                        </>
                    ) : (
                        <ChevronsRight className="w-4 h-4" strokeWidth={1.75} />
                    )}
                </button>
            </div>
        </div>
    );

    return (
        <>
            {isMobileOpen && (
                <div
                    className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 md:hidden"
                    onClick={closeMobile}
                    aria-hidden="true"
                />
            )}

            <aside
                className={`
                    fixed md:sticky top-0 left-0 z-50 md:z-30 h-screen
                    glass-panel
                    transition-all duration-200 ease-in-out flex-shrink-0
                    ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                    ${isExpanded ? 'w-60' : 'w-16'}
                `}
                aria-label="Sidebar"
            >
                {sidebarContent}
            </aside>
        </>
    );
}
