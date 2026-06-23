'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '../providers/AuthProvider';
import { useSidebar } from '../providers/SidebarProvider';
import {
    getLandingPage,
    getVisibleNavSections,
    type NavigationNode,
} from '../../config/routes';
import { ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, X } from 'lucide-react';

export function Sidebar() {
    const { user, permissions, scopes, isAdmin, hasPermission } = useAuth();
    const { isExpanded, isMobileOpen, toggleExpanded, closeMobile } = useSidebar();
    const pathname = usePathname();
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({
        'my-work': true,
        quality: true,
        manage: true,
        admin: true,
    });

    const isActive = (path: string) => {
        if (pathname === path) return true;
        if (path !== '/' && pathname?.startsWith(path + '/')) return true;
        return false;
    };

    const sections = useMemo(() => {
        if (!user) return [];

        return getVisibleNavSections({
            role: user.role,
            isAdmin,
            hasPermission,
            effectiveScopes: scopes,
        });
    }, [user, isAdmin, hasPermission, scopes]);

    if (!user) return null;

    const logoHref = getLandingPage(user, permissions, scopes);

    const nodeIsActive = (node: NavigationNode): boolean => {
        if (node.path && isActive(node.path)) return true;
        return node.children?.some(child => nodeIsActive(child)) ?? false;
    };

    const toggleSection = (key: string) => {
        setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const renderNode = (node: NavigationNode, depth = 0) => {
        const Icon = node.icon;
        const active = nodeIsActive(node);

        if (node.children?.length) {
            return (
                <li key={node.label} className={depth === 0 ? 'pt-1.5' : undefined}>
                    {isExpanded && (
                        <div className={`flex items-center gap-2 px-3 py-1.5 ${depth > 0 ? 'ml-3' : ''}`}>
                            {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0 text-slate-400 dark:text-slate-400" strokeWidth={1.75} aria-hidden="true" />}
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-400 truncate">
                                {node.label}
                            </span>
                        </div>
                    )}
                    <ul className={`space-y-0.5 ${isExpanded ? 'ml-3 border-l border-slate-200 dark:border-slate-800 pl-2' : ''}`}>
                        {node.children.map(child => renderNode(child, depth + 1))}
                    </ul>
                </li>
            );
        }

        if (!node.path) return null;

        return (
            <li key={node.path}>
                <Link
                    href={node.path}
                    onClick={closeMobile}
                    aria-current={active ? 'page' : undefined}
                    title={!isExpanded ? node.label : undefined}
                    className={`flex items-center gap-3 rounded-lg transition-all duration-150 ${isExpanded ? 'px-3 py-2' : 'px-0 py-2.5 justify-center'} ${active
                        ? 'bg-slate-100 dark:bg-slate-800/60 text-slate-900 dark:text-white border-l-2 border-indigo-500 ml-0 pl-2.5'
                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40 hover:text-slate-700 dark:hover:text-slate-300 border-l-2 border-transparent'
                    }`}
                >
                    {Icon && <Icon className="w-[17px] h-[17px] flex-shrink-0" strokeWidth={1.75} aria-hidden="true" />}
                    {isExpanded && (
                        <span className="text-[13px] font-medium truncate">{node.label}</span>
                    )}
                </Link>
            </li>
        );
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
                <ul className="space-y-1.5">
                    {sections.map(section => {
                        const Icon = section.icon;
                        const active = section.children.some(child => nodeIsActive(child));
                        const open = openSections[section.key] ?? true;
                        return (
                            <li key={section.key}>
                                <button
                                    type="button"
                                    onClick={() => isExpanded && toggleSection(section.key)}
                                    title={!isExpanded ? section.label : undefined}
                                    aria-expanded={isExpanded ? open : undefined}
                                    className={`flex w-full items-center gap-3 rounded-lg transition-all duration-150 ${isExpanded ? 'px-3 py-2.5' : 'px-0 py-2.5 justify-center'} ${active
                                        ? 'text-slate-900 dark:text-white bg-slate-100/80 dark:bg-slate-800/50'
                                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40 hover:text-slate-700 dark:hover:text-slate-300'
                                    }`}
                                >
                                    <Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.75} aria-hidden="true" />
                                    {isExpanded && (
                                        <>
                                            <span className="text-[13px] font-semibold truncate flex-1 text-left">{section.label}</span>
                                            {open ? (
                                                <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" strokeWidth={1.75} aria-hidden="true" />
                                            ) : (
                                                <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" strokeWidth={1.75} aria-hidden="true" />
                                            )}
                                        </>
                                    )}
                                </button>
                                {(open || !isExpanded) && (
                                    <ul className={`mt-1 space-y-0.5 ${isExpanded ? 'pl-1' : ''}`}>
                                        {isExpanded ? section.children.map(child => renderNode(child)) : null}
                                    </ul>
                                )}
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
