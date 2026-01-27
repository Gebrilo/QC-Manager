'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';

export default function PreferencesPage() {
    const [name, setName] = useState('John Doe');
    const [avatar, setAvatar] = useState('/placeholder-avatar.png');
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        const storedName = localStorage.getItem('user-name');
        const storedAvatar = localStorage.getItem('user-avatar');
        if (storedName) setName(storedName);
        if (storedAvatar) setAvatar(storedAvatar);
    }, []);

    const handleSave = () => {
        setIsSaving(true);
        localStorage.setItem('user-name', name);
        localStorage.setItem('user-avatar', avatar);

        // Trigger a custom event for the Header to update
        window.dispatchEvent(new CustomEvent('user-prefs-updated'));

        setTimeout(() => {
            setIsSaving(false);
            setMessage('Preferences saved successfully!');
            setTimeout(() => setMessage(''), 3000);
        }, 800);
    };

    return (
        <div className="max-w-2xl mx-auto py-8 px-4">
            <header className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">User Preferences</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1">Manage your profile and display settings.</p>
            </header>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-8 space-y-8">
                    {/* Profile Section */}
                    <div className="space-y-6">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">Profile Information</h2>

                        <div className="flex flex-col sm:flex-row items-center gap-6">
                            <div className="relative group">
                                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 p-1">
                                    <div className="w-full h-full rounded-full bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden">
                                        {avatar.startsWith('/') ? (
                                            <span className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{name.charAt(0)}</span>
                                        ) : (
                                            <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
                                        )}
                                    </div>
                                </div>
                                <label className="absolute inset-0 flex items-center justify-center bg-black/40 text-white rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity text-xs font-medium">
                                    Change
                                    <input
                                        type="file"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onloadend = () => setAvatar(reader.result as string);
                                                reader.readAsDataURL(file);
                                            }
                                        }}
                                    />
                                </label>
                            </div>

                            <div className="flex-1 space-y-4 w-full">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Display Name</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
                                    <input
                                        type="email"
                                        disabled
                                        value="user@example.com"
                                        className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 cursor-not-allowed outline-none"
                                    />
                                    <p className="text-[10px] text-slate-400 mt-1">Email cannot be changed in the trial version.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Display Preferences */}
                    <div className="space-y-6 pt-4">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">Display & Workspace</h2>

                        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800">
                            <div>
                                <h4 className="text-sm font-medium text-slate-900 dark:text-white">Interface Theme</h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Manage how QC looks in your browser</p>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => window.dispatchEvent(new CustomEvent('qc-toggle-theme'))}>
                                Change Mode
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 px-8 py-4 flex items-center justify-between border-t border-slate-200 dark:border-slate-800">
                    <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{message}</p>
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
