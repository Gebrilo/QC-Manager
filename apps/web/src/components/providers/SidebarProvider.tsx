'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

interface SidebarContextType {
    isExpanded: boolean;
    isMobileOpen: boolean;
    toggleExpanded: () => void;
    toggleMobile: () => void;
    closeMobile: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

const STORAGE_KEY = 'qc-sidebar-expanded';

export function SidebarProvider({ children }: { children: ReactNode }) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored !== null) {
            setIsExpanded(stored === 'true');
        }
    }, []);

    const toggleExpanded = useCallback(() => {
        setIsExpanded(prev => {
            const next = !prev;
            localStorage.setItem(STORAGE_KEY, String(next));
            return next;
        });
    }, []);

    const toggleMobile = useCallback(() => {
        setIsMobileOpen(prev => !prev);
    }, []);

    const closeMobile = useCallback(() => {
        setIsMobileOpen(false);
    }, []);

    return (
        <SidebarContext.Provider value={{ isExpanded, isMobileOpen, toggleExpanded, toggleMobile, closeMobile }}>
            {children}
        </SidebarContext.Provider>
    );
}

export function useSidebar() {
    const context = useContext(SidebarContext);
    if (!context) {
        throw new Error('useSidebar must be used within a SidebarProvider');
    }
    return context;
}
