import './globals.css';
import { Inter } from 'next/font/google';
import { Header } from '@/components/layout/Header';
import { ThemeProvider } from '@/components/providers/ThemeProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
    title: 'QC Management Tool',
    description: 'Manage projects, tasks, and resources',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className={inter.className}>
                <ThemeProvider>
                    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
                        <Header />
                        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                            {children}
                        </main>
                    </div>
                </ThemeProvider>
            </body>
        </html>
    );
}
