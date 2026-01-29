'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
type Density = 'comfortable' | 'compact';

interface ThemeContextType {
    theme: Theme;
    density: Density;
    toggleTheme: () => void;
    toggleDensity: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>('light');
    const [density, setDensity] = useState<Density>('comfortable');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // Hydrate from localStorage
        const storedTheme = localStorage.getItem('theme') as Theme | null;
        const storedDensity = localStorage.getItem('density') as Density | null;

        if (storedTheme) {
            setTheme(storedTheme);
        } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            setTheme('dark');
        }

        if (storedDensity) {
            setDensity(storedDensity);
        }

        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;

        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(theme);
        localStorage.setItem('theme', theme);
    }, [theme, mounted]);

    useEffect(() => {
        if (!mounted) return;
        localStorage.setItem('density', density);
    }, [density, mounted]);

    const toggleTheme = () => {
        setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
    };

    const toggleDensity = () => {
        setDensity((prev) => (prev === 'comfortable' ? 'compact' : 'comfortable'));
    };

    // We always render the provider to ensure useTheme() works in children (like Header)
    // even during initial render/hydration.
    console.log('ThemeProvider rendering. Mounted:', mounted);
    return (
        <ThemeContext.Provider value={{ theme, density, toggleTheme, toggleDensity }}>
            {/* 
                We render children immediately. 
                Theme might flip from light->dark after mount (hydration), causing a repaint.
                This is acceptable for a "no-new-libraries" approach to theme persistence.
            */}
            <script
                dangerouslySetInnerHTML={{
                    __html: `
                        try {
                            if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                                document.documentElement.classList.add('dark')
                            } else {
                                document.documentElement.classList.remove('dark')
                            }
                        } catch (_) {}
                    `,
                }}
            />
            <div className={mounted ? '' : 'invisible'}>
                {children}
            </div>
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
