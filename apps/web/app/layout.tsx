'use client';

import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '../src/components/providers/ThemeProvider';
import { AuthProvider } from '../src/components/providers/AuthProvider';
import { RouteGuard } from '../src/components/providers/RouteGuard';
import { SidebarProvider } from '../src/components/providers/SidebarProvider';
import { Sidebar } from '../src/components/layout/Sidebar';
import { TopBar } from '../src/components/layout/TopBar';
import { ActivationBanner } from '../src/components/ui/ActivationBanner';
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
                        <RouteGuard>
                            <SidebarProvider>
                                {isAuthPage ? (
                                    children
                                ) : (
                                    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
                                        <Sidebar />
                                        <div className="flex-1 flex flex-col min-w-0">
                                            <TopBar />
                                            <ActivationBanner />
                                            <main className="flex-1 overflow-y-auto">
                                                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                                                    {children}
                                                </div>
                                            </main>
                                        </div>
                                    </div>
                                )}
                            </SidebarProvider>
                        </RouteGuard>
                    </AuthProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
