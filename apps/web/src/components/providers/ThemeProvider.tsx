'use client';

import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';

// The public marketing landing (`/`) is a fixed light design. It must render
// in light mode even for a returning visitor whose saved theme is `dark`,
// otherwise the global `.dark` base rules (e.g. `.dark h1 { color:#fff }`)
// repaint its headings white on its white background. We force light on these
// routes for the DOM only — the user's saved preference is left untouched so
// the authenticated app still honours dark mode.
const LIGHT_ONLY_PATHS = ['/'];

type Theme = 'light' | 'dark';
type Density = 'comfortable' | 'compact';

interface ThemeContextType {
    theme: Theme;
    density: Density;
    toggleTheme: () => void;
    toggleDensity: () => void;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const forceLight = LIGHT_ONLY_PATHS.includes(pathname);
    const [theme, setTheme] = useState<Theme>(() => {
        if (typeof window === 'undefined') return 'light';
        return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
    });
    const [density, setDensity] = useState<Density>(() => {
        if (typeof window === 'undefined') return 'comfortable';
        return localStorage.getItem('density') === 'compact' ? 'compact' : 'comfortable';
    });

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');

        // Apply the user's theme everywhere except light-only routes (the
        // public landing), which always render light. The saved preference is
        // still persisted so dark mode is restored inside the app.
        root.classList.add(forceLight ? 'light' : theme);

        localStorage.setItem('theme', theme);
    }, [theme, forceLight]);

    useEffect(() => {
        localStorage.setItem('density', density);
    }, [density]);

    const toggleTheme = () => {
        setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
    };

    const toggleDensity = () => {
        setDensity((prev) => (prev === 'comfortable' ? 'compact' : 'comfortable'));
    };

    return (
        <ThemeContext.Provider value={{ theme, density, toggleTheme, toggleDensity, setTheme }}>
            <script
                dangerouslySetInnerHTML={{
                    __html: `
                        try {
                            var t = localStorage.getItem('theme');
                            var lightOnly = ${JSON.stringify(LIGHT_ONLY_PATHS)}.indexOf(window.location.pathname) !== -1;
                            if (t === 'dark' && !lightOnly) {
                                document.documentElement.classList.add('dark');
                            } else {
                                document.documentElement.classList.remove('dark');
                            }
                        } catch (_) {}
                    `,
                }}
            />
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
