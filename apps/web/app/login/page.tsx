'use client';

import { useState, FormEvent, useEffect, Suspense } from 'react';
import { useAuth } from '../../src/components/providers/AuthProvider';
import { useSearchParams } from 'next/navigation';
import type { Provider } from '@supabase/supabase-js';

type AuthView = 'sign-in' | 'sign-up' | 'forgot-password' | 'phone-otp';

function LoginPageContent() {
    const { signInWithEmail, signUpWithEmail, signInWithProvider, signInWithPhone, verifyOtp, resetPassword, user, loading } = useAuth();
    const searchParams = useSearchParams();

    const [view, setView] = useState<AuthView>('sign-in');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [otpSent, setOtpSent] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

    // Pick up errors from OAuth callback
    useEffect(() => {
        const errorParam = searchParams.get('error');
        if (errorParam) {
            setError(decodeURIComponent(errorParam));
        }
    }, [searchParams]);

    // If user is already authenticated (e.g., session restored), redirect will happen via AuthProvider

    const handleEmailSignIn = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setActionLoading(true);
        try {
            await signInWithEmail(email, password);
        } catch (err: any) {
            setError(err.message || 'Sign in failed');
        } finally {
            setActionLoading(false);
        }
    };

    const handleEmailSignUp = async (e: FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setActionLoading(true);
        try {
            await signUpWithEmail({ name, email, password, phone: phone || undefined });
            setSuccess('Account created! Check your email to verify if required.');
        } catch (err: any) {
            setError(err.message || 'Registration failed');
        } finally {
            setActionLoading(false);
        }
    };

    const handleSocialLogin = async (provider: Provider) => {
        setError('');
        setActionLoading(true);
        try {
            await signInWithProvider(provider);
        } catch (err: any) {
            setError(err.message || `Sign in with ${provider} failed`);
            setActionLoading(false);
        }
    };

    const handleSendOtp = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        if (!phone) {
            setError('Please enter your phone number');
            return;
        }
        setActionLoading(true);
        try {
            await signInWithPhone(phone);
            setOtpSent(true);
            setSuccess('Verification code sent to your phone.');
        } catch (err: any) {
            setError(err.message || 'Failed to send OTP');
        } finally {
            setActionLoading(false);
        }
    };

    const handleVerifyOtp = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setActionLoading(true);
        try {
            await verifyOtp(phone, otpCode);
        } catch (err: any) {
            setError(err.message || 'Invalid or expired code');
        } finally {
            setActionLoading(false);
        }
    };

    const handleForgotPassword = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setActionLoading(true);
        try {
            const result = await resetPassword(email);
            setSuccess(result.message);
        } catch (err: any) {
            setError(err.message || 'Failed to send reset email');
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
                <div className="animate-spin h-8 w-8 border-2 border-indigo-400 border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-4">
            {/* Decorative background elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-violet-500/10 rounded-full blur-3xl" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/5 rounded-full blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                {/* Logo */}
                <div className="flex flex-col items-center mb-8">
                    <div className="h-14 w-14 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-500/30 mb-4">
                        QC
                    </div>
                    <h1 className="text-2xl font-bold text-white">
                        {view === 'sign-up' ? 'Create an account' :
                         view === 'forgot-password' ? 'Reset your password' :
                         view === 'phone-otp' ? 'Sign in with Phone' :
                         'Welcome back'}
                    </h1>
                    <p className="text-slate-400 mt-1">
                        {view === 'sign-up' ? 'Get started with QC Manager' :
                         view === 'forgot-password' ? 'We\'ll send you a reset link' :
                         view === 'phone-otp' ? 'We\'ll send you a verification code' :
                         'Sign in to QC Manager'}
                    </p>
                </div>

                {/* Card */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
                    {/* Error message */}
                    {error && (
                        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-400 text-sm flex items-center gap-2 mb-5">
                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.834-1.964-.834-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                            {error}
                        </div>
                    )}

                    {/* Success message */}
                    {success && (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-emerald-400 text-sm flex items-center gap-2 mb-5">
                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            {success}
                        </div>
                    )}

                    {/* ============= SIGN IN VIEW ============= */}
                    {view === 'sign-in' && (
                        <>
                            {/* Social Login Buttons */}
                            <div className="space-y-3 mb-6">
                                <button
                                    type="button"
                                    onClick={() => handleSocialLogin('google')}
                                    disabled={actionLoading}
                                    className="w-full h-11 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                    id="btn-google-login"
                                >
                                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                                    </svg>
                                    Sign in with Google
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handleSocialLogin('azure')}
                                    disabled={actionLoading}
                                    className="w-full h-11 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                    id="btn-microsoft-login"
                                >
                                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                                        <path fill="#F25022" d="M1 1h10v10H1z"/>
                                        <path fill="#00A4EF" d="M1 13h10v10H1z"/>
                                        <path fill="#7FBA00" d="M13 1h10v10H13z"/>
                                        <path fill="#FFB900" d="M13 13h10v10H13z"/>
                                    </svg>
                                    Sign in with Microsoft
                                </button>
                            </div>

                            {/* Divider */}
                            <div className="relative my-6">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-white/10" />
                                </div>
                                <div className="relative flex justify-center text-xs">
                                    <span className="px-3 text-slate-500 bg-transparent backdrop-blur-xl">or continue with</span>
                                </div>
                            </div>

                            {/* Email/Password Form */}
                            <form onSubmit={handleEmailSignIn} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                                        placeholder="you@company.com"
                                        required
                                        id="input-email"
                                    />
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="block text-sm font-medium text-slate-300">Password</label>
                                        <button
                                            type="button"
                                            onClick={() => { setView('forgot-password'); setError(''); setSuccess(''); }}
                                            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                                        >
                                            Forgot password?
                                        </button>
                                    </div>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                                        placeholder="••••••••"
                                        required
                                        minLength={6}
                                        id="input-password"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={actionLoading}
                                    className="w-full h-11 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    id="btn-sign-in"
                                >
                                    {actionLoading ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                            </svg>
                                            Signing in...
                                        </>
                                    ) : 'Sign In'}
                                </button>
                            </form>

                            {/* Phone OTP Link */}
                            <div className="mt-4 text-center">
                                <button
                                    type="button"
                                    onClick={() => { setView('phone-otp'); setError(''); setSuccess(''); }}
                                    className="text-sm text-slate-400 hover:text-slate-300 transition-colors"
                                >
                                    📱 Sign in with phone number
                                </button>
                            </div>

                            {/* Register Link */}
                            <div className="mt-4 text-center">
                                <p className="text-slate-400 text-sm">
                                    Don&apos;t have an account?{' '}
                                    <button
                                        type="button"
                                        onClick={() => { setView('sign-up'); setError(''); setSuccess(''); }}
                                        className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                                    >
                                        Create one
                                    </button>
                                </p>
                            </div>
                        </>
                    )}

                    {/* ============= SIGN UP VIEW ============= */}
                    {view === 'sign-up' && (
                        <>
                            <form onSubmit={handleEmailSignUp} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Full Name</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                                        placeholder="John Doe"
                                        required
                                        autoFocus
                                        id="input-name"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                                        placeholder="you@company.com"
                                        required
                                        id="input-signup-email"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Phone Number <span className="text-slate-500">(optional)</span></label>
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                                        placeholder="+1 (555) 000-0000"
                                        id="input-signup-phone"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                                        placeholder="••••••••"
                                        required
                                        minLength={6}
                                        id="input-signup-password"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Confirm Password</label>
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className={`w-full h-11 bg-white/5 border rounded-xl px-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all ${confirmPassword && password !== confirmPassword
                                            ? 'border-rose-500/50 focus:ring-rose-500/50'
                                            : 'border-white/10 focus:border-indigo-500/50'
                                        }`}
                                        placeholder="••••••••"
                                        required
                                        minLength={6}
                                        id="input-signup-confirm"
                                    />
                                    {confirmPassword && password !== confirmPassword && (
                                        <p className="text-rose-400 text-xs mt-1">Passwords do not match</p>
                                    )}
                                </div>

                                <button
                                    type="submit"
                                    disabled={actionLoading}
                                    className="w-full h-11 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6"
                                    id="btn-sign-up"
                                >
                                    {actionLoading ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                            </svg>
                                            Creating account...
                                        </>
                                    ) : 'Create Account'}
                                </button>
                            </form>

                            <div className="mt-6 text-center">
                                <p className="text-slate-400 text-sm">
                                    Already have an account?{' '}
                                    <button
                                        type="button"
                                        onClick={() => { setView('sign-in'); setError(''); setSuccess(''); }}
                                        className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                                    >
                                        Sign in
                                    </button>
                                </p>
                            </div>
                        </>
                    )}

                    {/* ============= PHONE OTP VIEW ============= */}
                    {view === 'phone-otp' && (
                        <>
                            {!otpSent ? (
                                <form onSubmit={handleSendOtp} className="space-y-5">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">Phone Number</label>
                                        <input
                                            type="tel"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                                            placeholder="+1 (555) 000-0000"
                                            required
                                            autoFocus
                                            id="input-otp-phone"
                                        />
                                        <p className="text-xs text-slate-500 mt-1">Include your country code (e.g., +1 for US)</p>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={actionLoading}
                                        className="w-full h-11 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        id="btn-send-otp"
                                    >
                                        {actionLoading ? (
                                            <>
                                                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                </svg>
                                                Sending code...
                                            </>
                                        ) : 'Send Verification Code'}
                                    </button>
                                </form>
                            ) : (
                                <form onSubmit={handleVerifyOtp} className="space-y-5">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">Verification Code</label>
                                        <input
                                            type="text"
                                            value={otpCode}
                                            onChange={(e) => setOtpCode(e.target.value)}
                                            className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all text-center text-lg tracking-widest"
                                            placeholder="000000"
                                            required
                                            autoFocus
                                            maxLength={6}
                                            id="input-otp-code"
                                        />
                                        <p className="text-xs text-slate-500 mt-1">Enter the 6-digit code sent to {phone}</p>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={actionLoading}
                                        className="w-full h-11 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        id="btn-verify-otp"
                                    >
                                        {actionLoading ? (
                                            <>
                                                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                </svg>
                                                Verifying...
                                            </>
                                        ) : 'Verify Code'}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => { setOtpSent(false); setOtpCode(''); setError(''); setSuccess(''); }}
                                        className="w-full text-sm text-slate-400 hover:text-slate-300 transition-colors text-center"
                                    >
                                        Use a different phone number
                                    </button>
                                </form>
                            )}

                            <div className="mt-6 text-center">
                                <button
                                    type="button"
                                    onClick={() => { setView('sign-in'); setError(''); setSuccess(''); setOtpSent(false); setOtpCode(''); }}
                                    className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                                >
                                    ← Back to sign in
                                </button>
                            </div>
                        </>
                    )}

                    {/* ============= FORGOT PASSWORD VIEW ============= */}
                    {view === 'forgot-password' && (
                        <>
                            <form onSubmit={handleForgotPassword} className="space-y-5">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                                        placeholder="you@company.com"
                                        required
                                        autoFocus
                                        id="input-reset-email"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={actionLoading}
                                    className="w-full h-11 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    id="btn-reset-password"
                                >
                                    {actionLoading ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                            </svg>
                                            Sending link...
                                        </>
                                    ) : 'Send Reset Link'}
                                </button>
                            </form>

                            <div className="mt-6 text-center">
                                <button
                                    type="button"
                                    onClick={() => { setView('sign-in'); setError(''); setSuccess(''); }}
                                    className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                                >
                                    ← Back to sign in
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <p className="text-center text-slate-600 text-xs mt-6">
                    QC Management Tool &copy; {new Date().getFullYear()}
                </p>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
                <div className="animate-spin h-8 w-8 border-2 border-indigo-400 border-t-transparent rounded-full" />
            </div>
        }>
            <LoginPageContent />
        </Suspense>
    );
}
