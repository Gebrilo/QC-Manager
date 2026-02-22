'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';
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
    const [theme, setTheme] = useState<Theme>('light');
    const [density, setDensity] = useState<Density>('comfortable');

    useEffect(() => {
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
    }, []);

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');

        if (theme === 'system') {
            if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                root.classList.add('dark');
            }
        } else {
            root.classList.add(theme);
        }

        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        localStorage.setItem('density', density);
    }, [density]);

    const toggleTheme = () => {
        setTheme((prev) => {
            if (prev === 'light') return 'dark';
            if (prev === 'dark') return 'system';
            return 'light';
        });
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
                            if (t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
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
