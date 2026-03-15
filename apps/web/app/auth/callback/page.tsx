'use client';

import { useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/components/providers/AuthProvider';
import { getLandingPage } from '../../../src/config/routes';

function CallbackContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user, permissions, loading } = useAuth();
    const exchangeAttempted = useRef(false);

    // Once the user is loaded after session exchange, redirect to landing page
    useEffect(() => {
        if (!loading && user) {
            router.replace(getLandingPage(user, permissions));
        }
    }, [loading, user, permissions, router]);

    // Exchange the auth code for a session on mount
    useEffect(() => {
        if (exchangeAttempted.current) return;
        exchangeAttempted.current = true;

        const code = searchParams.get('code');
        const errorParam = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        if (errorParam) {
            const message = errorDescription || errorParam;
            router.replace(`/login?error=${encodeURIComponent(message)}`);
            return;
        }

        if (!code) {
            router.replace(`/login?error=${encodeURIComponent('No authorization code received')}`);
            return;
        }

        supabase.auth.exchangeCodeForSession(code)
            .then(({ error: exchangeError }) => {
                if (exchangeError) {
                    router.replace(`/login?error=${encodeURIComponent(exchangeError.message)}`);
                }
                // On success: onAuthStateChange in AuthProvider fires automatically,
                // handleSession runs, user state is set, and the redirect effect above
                // navigates to the landing page.
            })
            .catch(() => {
                router.replace(`/login?error=${encodeURIComponent('Authentication failed. Please try again.')}`);
            });
    }, [searchParams, router]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
            <div className="flex flex-col items-center gap-3">
                <div className="animate-spin h-8 w-8 border-2 border-indigo-400 border-t-transparent rounded-full" />
                <p className="text-sm text-slate-400">Completing sign in...</p>
            </div>
        </div>
    );
}

export default function AuthCallbackPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
                <div className="animate-spin h-8 w-8 border-2 border-indigo-400 border-t-transparent rounded-full" />
            </div>
        }>
            <CallbackContent />
        </Suspense>
    );
}
