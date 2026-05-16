'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { getBreadcrumbs, type BreadcrumbItem } from '../../config/routes';
import { ChevronRight } from 'lucide-react';

export function Breadcrumb() {
    const pathname = usePathname();

    const items = useMemo(() => getBreadcrumbs(pathname), [pathname]);

    if (items.length === 0) return null;

    return (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[13px] min-w-0">
            {items.map((item, i) => {
                const isLast = i === items.length - 1;
                const isSection = i === 0;

                return (
                    <span key={i} className="flex items-center gap-1 min-w-0">
                        {i > 0 && (
                            <ChevronRight className="w-3 h-3 flex-shrink-0 text-slate-300 dark:text-slate-600" strokeWidth={2} />
                        )}
                        {isLast || !item.path ? (
                            <span className={`truncate ${isSection
                                ? 'text-slate-400 dark:text-slate-500 font-medium'
                                : 'text-slate-700 dark:text-slate-200 font-semibold'
                            }`}>
                                {item.label}
                            </span>
                        ) : (
                            <Link
                                href={item.path}
                                className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors truncate"
                            >
                                {item.label}
                            </Link>
                        )}
                    </span>
                );
            })}
        </nav>
    );
}