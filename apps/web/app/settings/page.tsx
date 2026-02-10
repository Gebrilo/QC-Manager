'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface GlobalSettings {
    min_pass_rate_green: number;
    max_not_run_green: number;
    max_days_stale_green: number;
    max_failing_tests_green: number;
    min_pass_rate_amber: number;
    max_not_run_amber: number;
    max_days_stale_amber: number;
    low_pass_rate_trigger: number;
    high_not_run_trigger: number;
    stale_tests_trigger: number;
    high_failure_count_trigger: number;
    declining_trend_trigger: number;
    is_default?: boolean;
}

const DEFAULT_SETTINGS: GlobalSettings = {
    min_pass_rate_green: 95.0,
    max_not_run_green: 5.0,
    max_days_stale_green: 3,
    max_failing_tests_green: 0,
    min_pass_rate_amber: 80.0,
    max_not_run_amber: 15.0,
    max_days_stale_amber: 7,
    low_pass_rate_trigger: 80.0,
    high_not_run_trigger: 20.0,
    stale_tests_trigger: 14,
    high_failure_count_trigger: 10,
    declining_trend_trigger: 10.0,
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function SettingsPage() {
    const router = useRouter();
    const [settings, setSettings] = useState<GlobalSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${API_BASE}/governance/global-settings`);
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data) {
                    setSettings(result.data);
                }
            }
        } catch (err) {
            console.error('Failed to load settings:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setError(null);
            setSuccess(false);

            const response = await fetch(`${API_BASE}/governance/global-settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });

            if (!response.ok) {
                throw new Error('Failed to save settings');
            }

            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch (err: any) {
            setError(err.message || 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        setSettings(DEFAULT_SETTINGS);
    };

    const updateSetting = (key: keyof GlobalSettings, value: number) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-950 flex items-center justify-center">
                <div className="flex items-center gap-3 text-slate-500">
                    <svg className="animate-spin w-6 h-6" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading settings...
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-950 pb-12">
            {/* Header */}
            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg border-b border-slate-200/50 dark:border-slate-700/50 sticky top-0 z-20 shadow-sm">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                                Quality Gate Settings
                            </h1>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Configure global thresholds for release readiness and risk assessment
                            </p>
                        </div>
                        <button
                            onClick={() => router.push('/governance')}
                            className="group px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-lg text-sm font-medium text-white hover:from-indigo-700 hover:to-violet-700 transition-all shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5"
                        >
                            <span className="flex items-center gap-2">
                                <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                                Dashboard
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

                {/* Success/Error Messages */}
                {success && (
                    <div className="p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl text-green-700 dark:text-green-300 text-sm flex items-center gap-3 animate-slideIn">
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Settings saved successfully!
                    </div>
                )}

                {error && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm flex items-center gap-3">
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {error}
                    </div>
                )}

                {/* Release Readiness - GREEN Status */}
                <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 border border-slate-200/50 dark:border-slate-700/50 p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                            <div className="w-4 h-4 bg-green-500 rounded-full" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">GREEN Status (Ready for Release)</h2>
                            <p className="text-sm text-slate-500">Thresholds for a project to be marked as ready for release</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <SettingInput
                            label="Minimum Pass Rate"
                            value={settings.min_pass_rate_green}
                            onChange={(v) => updateSetting('min_pass_rate_green', v)}
                            unit="%"
                            min={0}
                            max={100}
                            step={0.5}
                            description="Tests must pass at this rate or higher"
                        />
                        <SettingInput
                            label="Maximum Not-Run Tests"
                            value={settings.max_not_run_green}
                            onChange={(v) => updateSetting('max_not_run_green', v)}
                            unit="%"
                            min={0}
                            max={100}
                            step={0.5}
                            description="Maximum percentage of tests not executed"
                        />
                        <SettingInput
                            label="Maximum Days Since Execution"
                            value={settings.max_days_stale_green}
                            onChange={(v) => updateSetting('max_days_stale_green', v)}
                            unit="days"
                            min={0}
                            max={30}
                            step={1}
                            description="Results must be this recent or fresher"
                        />
                        <SettingInput
                            label="Maximum Failing Tests"
                            value={settings.max_failing_tests_green}
                            onChange={(v) => updateSetting('max_failing_tests_green', v)}
                            unit="tests"
                            min={0}
                            max={100}
                            step={1}
                            description="Number of failing tests allowed"
                        />
                    </div>
                </section>

                {/* Release Readiness - AMBER Status */}
                <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 border border-slate-200/50 dark:border-slate-700/50 p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                            <div className="w-4 h-4 bg-amber-500 rounded-full" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">AMBER Status (Needs Review)</h2>
                            <p className="text-sm text-slate-500">Thresholds between GREEN and RED status</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <SettingInput
                            label="Minimum Pass Rate"
                            value={settings.min_pass_rate_amber}
                            onChange={(v) => updateSetting('min_pass_rate_amber', v)}
                            unit="%"
                            min={0}
                            max={100}
                            step={0.5}
                        />
                        <SettingInput
                            label="Maximum Not-Run Tests"
                            value={settings.max_not_run_amber}
                            onChange={(v) => updateSetting('max_not_run_amber', v)}
                            unit="%"
                            min={0}
                            max={100}
                            step={0.5}
                        />
                        <SettingInput
                            label="Maximum Days Since Execution"
                            value={settings.max_days_stale_amber}
                            onChange={(v) => updateSetting('max_days_stale_amber', v)}
                            unit="days"
                            min={0}
                            max={30}
                            step={1}
                        />
                    </div>
                </section>

                {/* Risk Assessment Triggers */}
                <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 border border-slate-200/50 dark:border-slate-700/50 p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Risk Assessment Triggers</h2>
                            <p className="text-sm text-slate-500">Thresholds that trigger quality risk flags</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <SettingInput
                            label="Low Pass Rate Trigger"
                            value={settings.low_pass_rate_trigger}
                            onChange={(v) => updateSetting('low_pass_rate_trigger', v)}
                            unit="%"
                            min={0}
                            max={100}
                            step={0.5}
                            description="Flags projects below this rate"
                        />
                        <SettingInput
                            label="High Not-Run Trigger"
                            value={settings.high_not_run_trigger}
                            onChange={(v) => updateSetting('high_not_run_trigger', v)}
                            unit="%"
                            min={0}
                            max={100}
                            step={0.5}
                            description="Flags projects above this rate"
                        />
                        <SettingInput
                            label="Stale Tests Trigger"
                            value={settings.stale_tests_trigger}
                            onChange={(v) => updateSetting('stale_tests_trigger', v)}
                            unit="days"
                            min={0}
                            max={60}
                            step={1}
                            description="Flags projects older than this"
                        />
                        <SettingInput
                            label="High Failure Count Trigger"
                            value={settings.high_failure_count_trigger}
                            onChange={(v) => updateSetting('high_failure_count_trigger', v)}
                            unit="tests"
                            min={0}
                            max={100}
                            step={1}
                            description="Flags projects with more failures"
                        />
                        <SettingInput
                            label="Declining Trend Trigger"
                            value={settings.declining_trend_trigger}
                            onChange={(v) => updateSetting('declining_trend_trigger', v)}
                            unit="% drop"
                            min={0}
                            max={50}
                            step={0.5}
                            description="Flags week-over-week decline"
                        />
                    </div>
                </section>

                {/* Actions */}
                <div className="flex justify-between items-center">
                    <button
                        onClick={handleReset}
                        className="px-6 py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 transition-all"
                    >
                        Reset to Defaults
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:from-slate-400 disabled:to-slate-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/30 transition-all disabled:shadow-none hover:shadow-indigo-500/50 hover:-translate-y-0.5 disabled:cursor-not-allowed"
                    >
                        {saving ? (
                            <span className="flex items-center gap-2">
                                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Saving...
                            </span>
                        ) : (
                            'Save Settings'
                        )}
                    </button>
                </div>
            </main>

            {/* Custom animations */}
            <style jsx>{`
                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(-10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .animate-slideIn {
                    animation: slideIn 0.3s ease-out;
                }
            `}</style>
        </div>
    );
}

interface SettingInputProps {
    label: string;
    value: number;
    onChange: (value: number) => void;
    unit: string;
    min: number;
    max: number;
    step: number;
    description?: string;
}

function SettingInput({ label, value, onChange, unit, min, max, step, description }: SettingInputProps) {
    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {label}
            </label>
            <div className="flex items-center gap-3">
                <input
                    type="number"
                    value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                    min={min}
                    max={max}
                    step={step}
                    className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
                <span className="text-sm text-slate-500 dark:text-slate-400 w-12">{unit}</span>
            </div>
            {description && (
                <p className="text-xs text-slate-400">{description}</p>
            )}
        </div>
    );
}
