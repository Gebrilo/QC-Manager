'use client';

import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '../src/components/providers/ThemeProvider';
import { AuthProvider } from '../src/components/providers/AuthProvider';
import { Header } from '../src/components/layout/Header';
import { usePathname } from 'next/navigation';

const inter = Inter({ subsets: ['latin'] });

const AUTH_PAGES = ['/login', '/register'];

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const isAuthPage = AUTH_PAGES.includes(pathname || '');

    return (
        <html lang="en" suppressHydrationWarning>
            <body className={inter.className}>
                <ThemeProvider>
                    <AuthProvider>
                        {isAuthPage ? (
                            // Auth pages render full-screen without header/nav
                            children
                        ) : (
                            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
                                <Header />
                                <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                                    {children}
                                </main>
                            </div>
                        )}
                    </AuthProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
