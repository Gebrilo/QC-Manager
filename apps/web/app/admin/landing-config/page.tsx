'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
    BarChart3,
    Bot,
    CalendarClock,
    Check,
    Clipboard,
    Eye,
    EyeOff,
    FileText,
    LayoutTemplate,
    ListPlus,
    Loader2,
    Megaphone,
    Pencil,
    Plus,
    Save,
    Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { MarkdownContent } from '@/components/landing/MarkdownContent';
import { FEATURE_ICON_OPTIONS } from '@/components/landing/iconRegistry';
import {
    landingPageApi,
    type ChangelogEntry,
    type ChangelogSource,
    type LandingPageConfig,
    type LandingPageFeature,
    type RoadmapItem,
    type RoadmapPriority,
    type RoadmapStatus,
} from '@/lib/api';

type TabKey = 'settings' | 'features' | 'roadmap' | 'changelog' | 'ai';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'https://api.gebrils.cloud').replace(/\/$/, '');

const tabs: Array<{ key: TabKey; label: string; icon: typeof LayoutTemplate }> = [
    { key: 'settings', label: 'Global Settings', icon: LayoutTemplate },
    { key: 'features', label: 'Features', icon: ListPlus },
    { key: 'roadmap', label: 'Roadmap', icon: CalendarClock },
    { key: 'changelog', label: 'Changelog', icon: FileText },
    { key: 'ai', label: 'AI / n8n', icon: Bot },
];

const emptyFeature = {
    title: '',
    description: '',
    icon_key: 'shield',
    display_order: 0,
    is_active: true,
};

const emptyRoadmap: Omit<RoadmapItem, 'id'> = {
    title: '',
    description: '',
    status: 'planned',
    priority: 'medium',
    target_date: null,
    completion_date: null,
    display_order: 0,
    is_public: true,
    source_reference: null,
};

const emptyChangelog: Omit<ChangelogEntry, 'id'> = {
    version_number: '',
    title: '',
    content_markdown: '',
    published_at: new Date().toISOString(),
    is_published: false,
    generated_by_ai: false,
    source: 'manual',
    source_reference: '',
};

function classNames(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(' ');
}

function sortByDisplayOrder<T extends { display_order: number; created_at?: string }>(items: T[]) {
    return [...items].sort((a, b) => {
        if (a.display_order !== b.display_order) return a.display_order - b.display_order;
        return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });
}

function toDateInput(value?: string | null) {
    return value ? value.slice(0, 10) : '';
}

function toDateTimeInput(value?: string | null) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

function fromDateTimeInput(value: string) {
    return value ? new Date(value).toISOString() : null;
}

function formatDate(value?: string | null) {
    if (!value) return 'Not set';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not set';
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function ToggleField({
    label,
    checked,
    onChange,
}: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}) {
    return (
        <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer">
            <span>{label}</span>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={classNames(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900',
                    checked ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700',
                )}
            >
                <span
                    aria-hidden="true"
                    className={classNames(
                        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                        checked ? 'translate-x-5' : 'translate-x-0',
                    )}
                />
            </button>
        </label>
    );
}

function SelectField({
    label,
    value,
    onChange,
    children,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    children: ReactNode;
}) {
    return (
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            <span className="mb-2 block">{label}</span>
            <select
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
            >
                {children}
            </select>
        </label>
    );
}

function StatusBadge({ status }: { status: RoadmapStatus }) {
    const variant = status === 'completed' ? 'success' : status === 'in_progress' ? 'warning' : 'info';
    return <Badge variant={variant}>{status.replace('_', ' ')}</Badge>;
}

function PriorityBadge({ priority }: { priority: RoadmapPriority }) {
    const variant = priority === 'critical' ? 'danger' : priority === 'high' ? 'warning' : priority === 'medium' ? 'info' : 'secondary';
    return <Badge variant={variant}>{priority}</Badge>;
}

export default function LandingConfigPage() {
    const confirmAction = useConfirm();
    const [activeTab, setActiveTab] = useState<TabKey>('settings');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const [config, setConfig] = useState<LandingPageConfig | null>(null);
    const [features, setFeatures] = useState<LandingPageFeature[]>([]);
    const [roadmap, setRoadmap] = useState<RoadmapItem[]>([]);
    const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);

    const [featureForm, setFeatureForm] = useState(emptyFeature);
    const [editingFeatureId, setEditingFeatureId] = useState<string | null>(null);

    const [roadmapForm, setRoadmapForm] = useState(emptyRoadmap);
    const [editingRoadmapId, setEditingRoadmapId] = useState<string | null>(null);

    const [changelogForm, setChangelogForm] = useState(emptyChangelog);
    const [editingChangelogId, setEditingChangelogId] = useState<string | null>(null);

    const showMessage = useCallback((type: 'success' | 'error', message: string) => {
        if (type === 'success') {
            setSuccess(message);
            setError(null);
            setTimeout(() => setSuccess(null), 3500);
        } else {
            setError(message);
            setSuccess(null);
            setTimeout(() => setError(null), 6000);
        }
    }, []);

    const loadData = useCallback(async (showSpinner = true) => {
        if (showSpinner) setLoading(true);
        try {
            const [configData, featureData, roadmapData, changelogData] = await Promise.all([
                landingPageApi.admin.getConfig(),
                landingPageApi.admin.listFeatures(),
                landingPageApi.admin.listRoadmap(),
                landingPageApi.admin.listChangelog(),
            ]);
            setConfig(configData);
            setFeatures(sortByDisplayOrder(featureData));
            setRoadmap(sortByDisplayOrder(roadmapData));
            setChangelog(changelogData);
        } catch (err: any) {
            showMessage('error', err.message || 'Failed to load landing page configuration');
        } finally {
            if (showSpinner) setLoading(false);
        }
    }, [showMessage]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const publicWebhookUrl = `${API_BASE}/api/webhooks/landing-content/changelog`;
    const roadmapWebhookUrl = `${API_BASE}/api/webhooks/landing-content/roadmap`;

    const changelogPreview = useMemo(() => changelogForm.content_markdown || '### Release notes preview\n- Write Markdown content to preview it here.', [changelogForm.content_markdown]);

    async function saveConfig() {
        if (!config) return;
        setSaving(true);
        try {
            const updated = await landingPageApi.admin.updateConfig(config);
            setConfig(updated);
            showMessage('success', 'Landing page settings saved');
        } catch (err: any) {
            showMessage('error', err.message || 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    }

    async function saveFeature() {
        if (!featureForm.title.trim() || !featureForm.description.trim()) {
            showMessage('error', 'Feature title and description are required');
            return;
        }
        setSaving(true);
        try {
            if (editingFeatureId) {
                const updated = await landingPageApi.admin.updateFeature(editingFeatureId, featureForm);
                setFeatures(current => sortByDisplayOrder(current.map(item => item.id === updated.id ? updated : item)));
                showMessage('success', 'Feature updated');
            } else {
                const created = await landingPageApi.admin.createFeature(featureForm);
                setFeatures(current => sortByDisplayOrder([...current, created]));
                showMessage('success', 'Feature added');
            }
            setFeatureForm(emptyFeature);
            setEditingFeatureId(null);
        } catch (err: any) {
            showMessage('error', err.message || 'Failed to save feature');
        } finally {
            setSaving(false);
        }
    }

    async function deleteFeature(feature: LandingPageFeature) {
        const confirmed = await confirmAction({
            title: 'Delete feature',
            message: `Delete "${feature.title}" from the landing page?`,
            confirmLabel: 'Delete',
            variant: 'danger',
        });
        if (!confirmed) return;
        try {
            await landingPageApi.admin.deleteFeature(feature.id);
            setFeatures(current => current.filter(item => item.id !== feature.id));
            showMessage('success', 'Feature deleted');
        } catch (err: any) {
            showMessage('error', err.message || 'Failed to delete feature');
        }
    }

    async function saveRoadmap() {
        if (!roadmapForm.title.trim() || !roadmapForm.description.trim()) {
            showMessage('error', 'Roadmap title and description are required');
            return;
        }
        setSaving(true);
        try {
            if (editingRoadmapId) {
                const updated = await landingPageApi.admin.updateRoadmapItem(editingRoadmapId, roadmapForm);
                setRoadmap(current => sortByDisplayOrder(current.map(item => item.id === updated.id ? updated : item)));
                showMessage('success', 'Roadmap item updated');
            } else {
                const created = await landingPageApi.admin.createRoadmapItem(roadmapForm);
                setRoadmap(current => sortByDisplayOrder([...current, created]));
                showMessage('success', 'Roadmap item added');
            }
            setRoadmapForm(emptyRoadmap);
            setEditingRoadmapId(null);
        } catch (err: any) {
            showMessage('error', err.message || 'Failed to save roadmap item');
        } finally {
            setSaving(false);
        }
    }

    async function deleteRoadmapItem(item: RoadmapItem) {
        const confirmed = await confirmAction({
            title: 'Delete roadmap item',
            message: `Delete "${item.title}" from the public roadmap?`,
            confirmLabel: 'Delete',
            variant: 'danger',
        });
        if (!confirmed) return;
        try {
            await landingPageApi.admin.deleteRoadmapItem(item.id);
            setRoadmap(current => current.filter(row => row.id !== item.id));
            showMessage('success', 'Roadmap item deleted');
        } catch (err: any) {
            showMessage('error', err.message || 'Failed to delete roadmap item');
        }
    }

    async function saveChangelog() {
        if (!changelogForm.title.trim() || !changelogForm.content_markdown.trim()) {
            showMessage('error', 'Changelog title and Markdown content are required');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                ...changelogForm,
                version_number: changelogForm.version_number || null,
                source_reference: changelogForm.source_reference || null,
            };
            if (editingChangelogId) {
                const updated = await landingPageApi.admin.updateChangelogEntry(editingChangelogId, payload);
                setChangelog(current => current.map(item => item.id === updated.id ? updated : item));
                showMessage('success', 'Changelog entry updated');
            } else {
                const created = await landingPageApi.admin.createChangelogEntry(payload);
                setChangelog(current => [created, ...current]);
                showMessage('success', 'Changelog entry added');
            }
            setChangelogForm(emptyChangelog);
            setEditingChangelogId(null);
        } catch (err: any) {
            showMessage('error', err.message || 'Failed to save changelog entry');
        } finally {
            setSaving(false);
        }
    }

    async function deleteChangelogEntry(entry: ChangelogEntry) {
        const confirmed = await confirmAction({
            title: 'Delete changelog entry',
            message: `Delete "${entry.title}" from the changelog?`,
            confirmLabel: 'Delete',
            variant: 'danger',
        });
        if (!confirmed) return;
        try {
            await landingPageApi.admin.deleteChangelogEntry(entry.id);
            setChangelog(current => current.filter(item => item.id !== entry.id));
            showMessage('success', 'Changelog entry deleted');
        } catch (err: any) {
            showMessage('error', err.message || 'Failed to delete changelog entry');
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    Loading landing page configuration...
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Landing Page Configuration</h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage the public overview, roadmap, changelog, and AI content intake.</p>
                </div>
                <a
                    href="/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                    <Eye className="h-4 w-4" />
                    View Public Page
                </a>
            </div>

            {(success || error) && (
                <div className={classNames(
                    'rounded-lg border p-3 text-sm',
                    success && 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300',
                    error && 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300'
                )}>
                    {success || error}
                </div>
            )}

            <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setActiveTab(tab.key)}
                            className={classNames(
                                'inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition',
                                active
                                    ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                            )}
                        >
                            <Icon className="h-4 w-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {activeTab === 'settings' && config && (
                <section className="space-y-6">
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="mb-5 flex items-center gap-2">
                            <Megaphone className="h-5 w-5 text-indigo-600" />
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Hero and Marketing Copy</h2>
                        </div>
                        <div className="grid gap-4 lg:grid-cols-2">
                            <Input label="Hero title" value={config.hero_title} onChange={(event) => setConfig({ ...config, hero_title: event.target.value })} />
                            <Input label="Primary CTA label" value={config.hero_cta_label} onChange={(event) => setConfig({ ...config, hero_cta_label: event.target.value })} />
                            <Input label="Primary CTA URL" value={config.hero_cta_url} onChange={(event) => setConfig({ ...config, hero_cta_url: event.target.value })} />
                            <Input label="Secondary CTA label" value={config.hero_secondary_cta_label || ''} onChange={(event) => setConfig({ ...config, hero_secondary_cta_label: event.target.value })} />
                            <Input label="Secondary CTA URL" value={config.hero_secondary_cta_url || ''} onChange={(event) => setConfig({ ...config, hero_secondary_cta_url: event.target.value })} />
                            <Input label="Marketing intro title" value={config.marketing_intro_title} onChange={(event) => setConfig({ ...config, marketing_intro_title: event.target.value })} />
                            <div className="lg:col-span-2">
                                <Textarea label="Hero subtitle" value={config.hero_subtitle} onChange={(event) => setConfig({ ...config, hero_subtitle: event.target.value })} />
                            </div>
                            <div className="lg:col-span-2">
                                <Textarea label="Marketing intro description" value={config.marketing_intro_description} onChange={(event) => setConfig({ ...config, marketing_intro_description: event.target.value })} />
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            <h2 className="mb-5 text-lg font-semibold text-slate-900 dark:text-white">Section Visibility</h2>
                            <div className="space-y-3">
                                <ToggleField label="Landing page is public" checked={config.is_public} onChange={(checked) => setConfig({ ...config, is_public: checked })} />
                                <ToggleField label="Show features section" checked={config.show_features} onChange={(checked) => setConfig({ ...config, show_features: checked })} />
                                <ToggleField label="Show roadmap section" checked={config.show_roadmap} onChange={(checked) => setConfig({ ...config, show_roadmap: checked })} />
                                <ToggleField label="Show changelog section" checked={config.show_changelog} onChange={(checked) => setConfig({ ...config, show_changelog: checked })} />
                                <ToggleField label="Show footer CTA" checked={config.show_footer_cta} onChange={(checked) => setConfig({ ...config, show_footer_cta: checked })} />
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            <h2 className="mb-5 text-lg font-semibold text-slate-900 dark:text-white">Footer CTA</h2>
                            <div className="space-y-4">
                                <Input label="Footer CTA title" value={config.footer_cta_title || ''} onChange={(event) => setConfig({ ...config, footer_cta_title: event.target.value })} />
                                <Textarea label="Footer CTA description" value={config.footer_cta_description || ''} onChange={(event) => setConfig({ ...config, footer_cta_description: event.target.value })} />
                                <Input label="Footer CTA label" value={config.footer_cta_label || ''} onChange={(event) => setConfig({ ...config, footer_cta_label: event.target.value })} />
                                <Input label="Footer CTA URL" value={config.footer_cta_url || ''} onChange={(event) => setConfig({ ...config, footer_cta_url: event.target.value })} />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <Button variant="primary" onClick={saveConfig} loading={saving} loadingText="Saving...">
                            <Save className="mr-2 h-4 w-4" />
                            Save Settings
                        </Button>
                    </div>
                </section>
            )}

            {activeTab === 'features' && (
                <section className="grid gap-6 lg:grid-cols-[0.9fr_1.4fr]">
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <h2 className="mb-5 text-lg font-semibold text-slate-900 dark:text-white">{editingFeatureId ? 'Edit Feature' : 'Add Feature'}</h2>
                        <div className="space-y-4">
                            <Input label="Title" value={featureForm.title} onChange={(event) => setFeatureForm({ ...featureForm, title: event.target.value })} />
                            <Textarea label="Description" value={featureForm.description} onChange={(event) => setFeatureForm({ ...featureForm, description: event.target.value })} />
                            <SelectField label="Icon" value={featureForm.icon_key || ''} onChange={(value) => setFeatureForm({ ...featureForm, icon_key: value })}>
                                {FEATURE_ICON_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </SelectField>
                            <Input label="Display order" type="number" min={0} value={featureForm.display_order} onChange={(event) => setFeatureForm({ ...featureForm, display_order: Number(event.target.value) })} />
                            <ToggleField label="Active" checked={featureForm.is_active} onChange={(checked) => setFeatureForm({ ...featureForm, is_active: checked })} />
                            <div className="flex gap-2">
                                <Button variant="primary" onClick={saveFeature} loading={saving}>
                                    <Save className="mr-2 h-4 w-4" />
                                    {editingFeatureId ? 'Save Feature' : 'Add Feature'}
                                </Button>
                                {editingFeatureId && (
                                    <Button variant="outline" onClick={() => { setEditingFeatureId(null); setFeatureForm(emptyFeature); }}>
                                        Cancel
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Feature Cards</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                                    <tr>
                                        <th className="px-5 py-3">Feature</th>
                                        <th className="px-5 py-3">Icon</th>
                                        <th className="px-5 py-3">Order</th>
                                        <th className="px-5 py-3">State</th>
                                        <th className="px-5 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                    {features.length === 0 ? (
                                        <tr><td className="px-5 py-8 text-center text-slate-500" colSpan={5}>No features configured.</td></tr>
                                    ) : features.map(feature => (
                                        <tr key={feature.id}>
                                            <td className="max-w-md px-5 py-4">
                                                <div className="font-semibold text-slate-900 dark:text-white">{feature.title}</div>
                                                <div className="mt-1 line-clamp-2 text-slate-500 dark:text-slate-400">{feature.description}</div>
                                            </td>
                                            <td className="px-5 py-4 text-slate-600 dark:text-slate-300">{feature.icon_key || 'None'}</td>
                                            <td className="px-5 py-4 text-slate-600 dark:text-slate-300">{feature.display_order}</td>
                                            <td className="px-5 py-4">{feature.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</td>
                                            <td className="px-5 py-4">
                                                <div className="flex justify-end gap-2">
                                                    <Button size="icon" variant="ghost" title="Edit feature" onClick={() => { setEditingFeatureId(feature.id); setFeatureForm({ title: feature.title, description: feature.description, icon_key: feature.icon_key || 'shield', display_order: feature.display_order, is_active: feature.is_active !== false }); }}>
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="icon" variant="ghost" title={feature.is_active ? 'Deactivate feature' : 'Activate feature'} onClick={() => landingPageApi.admin.updateFeature(feature.id, { is_active: feature.is_active === false }).then(updated => setFeatures(current => sortByDisplayOrder(current.map(item => item.id === updated.id ? updated : item)))).catch((err: any) => showMessage('error', err.message))}>
                                                        {feature.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                    </Button>
                                                    <Button size="icon" variant="ghost" title="Delete feature" onClick={() => deleteFeature(feature)}>
                                                        <Trash2 className="h-4 w-4 text-rose-500" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
            )}

            {activeTab === 'roadmap' && (
                <section className="grid gap-6 xl:grid-cols-[0.9fr_1.5fr]">
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <h2 className="mb-5 text-lg font-semibold text-slate-900 dark:text-white">{editingRoadmapId ? 'Edit Roadmap Item' : 'Add Roadmap Item'}</h2>
                        <div className="space-y-4">
                            <Input label="Title" value={roadmapForm.title} onChange={(event) => setRoadmapForm({ ...roadmapForm, title: event.target.value })} />
                            <Textarea label="Description" value={roadmapForm.description} onChange={(event) => setRoadmapForm({ ...roadmapForm, description: event.target.value })} />
                            <div className="grid gap-4 sm:grid-cols-2">
                                <SelectField label="Status" value={roadmapForm.status} onChange={(value) => setRoadmapForm({ ...roadmapForm, status: value as RoadmapStatus })}>
                                    <option value="planned">Planned</option>
                                    <option value="in_progress">In Progress</option>
                                    <option value="completed">Completed</option>
                                </SelectField>
                                <SelectField label="Priority" value={roadmapForm.priority} onChange={(value) => setRoadmapForm({ ...roadmapForm, priority: value as RoadmapPriority })}>
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                    <option value="critical">Critical</option>
                                </SelectField>
                                <Input label="Target date" type="date" value={toDateInput(roadmapForm.target_date)} onChange={(event) => setRoadmapForm({ ...roadmapForm, target_date: event.target.value || null })} />
                                <Input label="Completion date" type="date" value={toDateInput(roadmapForm.completion_date)} onChange={(event) => setRoadmapForm({ ...roadmapForm, completion_date: event.target.value || null })} />
                                <Input label="Display order" type="number" min={0} value={roadmapForm.display_order} onChange={(event) => setRoadmapForm({ ...roadmapForm, display_order: Number(event.target.value) })} />
                                <Input label="Source reference" value={roadmapForm.source_reference || ''} onChange={(event) => setRoadmapForm({ ...roadmapForm, source_reference: event.target.value })} />
                            </div>
                            <ToggleField label="Public" checked={roadmapForm.is_public !== false} onChange={(checked) => setRoadmapForm({ ...roadmapForm, is_public: checked })} />
                            <div className="flex gap-2">
                                <Button variant="primary" onClick={saveRoadmap} loading={saving}>
                                    <Save className="mr-2 h-4 w-4" />
                                    {editingRoadmapId ? 'Save Item' : 'Add Item'}
                                </Button>
                                {editingRoadmapId && (
                                    <Button variant="outline" onClick={() => { setEditingRoadmapId(null); setRoadmapForm(emptyRoadmap); }}>
                                        Cancel
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Roadmap Items</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                                    <tr>
                                        <th className="px-5 py-3">Item</th>
                                        <th className="px-5 py-3">Status</th>
                                        <th className="px-5 py-3">Priority</th>
                                        <th className="px-5 py-3">Dates</th>
                                        <th className="px-5 py-3">Public</th>
                                        <th className="px-5 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                    {roadmap.length === 0 ? (
                                        <tr><td className="px-5 py-8 text-center text-slate-500" colSpan={6}>No roadmap items configured.</td></tr>
                                    ) : roadmap.map(item => (
                                        <tr key={item.id}>
                                            <td className="max-w-md px-5 py-4">
                                                <div className="font-semibold text-slate-900 dark:text-white">{item.title}</div>
                                                <div className="mt-1 line-clamp-2 text-slate-500 dark:text-slate-400">{item.description}</div>
                                            </td>
                                            <td className="px-5 py-4"><StatusBadge status={item.status} /></td>
                                            <td className="px-5 py-4"><PriorityBadge priority={item.priority} /></td>
                                            <td className="px-5 py-4 text-xs text-slate-500 dark:text-slate-400">
                                                <div>Target: {formatDate(item.target_date)}</div>
                                                <div>Done: {formatDate(item.completion_date)}</div>
                                            </td>
                                            <td className="px-5 py-4">{item.is_public !== false ? <Check className="h-4 w-4 text-emerald-500" /> : <EyeOff className="h-4 w-4 text-slate-400" />}</td>
                                            <td className="px-5 py-4">
                                                <div className="flex justify-end gap-2">
                                                    <Button size="icon" variant="ghost" title="Edit roadmap item" onClick={() => { setEditingRoadmapId(item.id); setRoadmapForm({ title: item.title, description: item.description, status: item.status, priority: item.priority, target_date: item.target_date || null, completion_date: item.completion_date || null, display_order: item.display_order, is_public: item.is_public !== false, source_reference: item.source_reference || null }); }}>
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="icon" variant="ghost" title="Delete roadmap item" onClick={() => deleteRoadmapItem(item)}>
                                                        <Trash2 className="h-4 w-4 text-rose-500" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
            )}

            {activeTab === 'changelog' && (
                <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <h2 className="mb-5 text-lg font-semibold text-slate-900 dark:text-white">{editingChangelogId ? 'Edit Changelog Entry' : 'Add Changelog Entry'}</h2>
                        <div className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Input label="Version number" value={changelogForm.version_number || ''} onChange={(event) => setChangelogForm({ ...changelogForm, version_number: event.target.value })} />
                                <Input label="Title" value={changelogForm.title} onChange={(event) => setChangelogForm({ ...changelogForm, title: event.target.value })} />
                                <Input label="Published at" type="datetime-local" value={toDateTimeInput(changelogForm.published_at)} onChange={(event) => setChangelogForm({ ...changelogForm, published_at: fromDateTimeInput(event.target.value) })} />
                                <SelectField label="Source" value={changelogForm.source} onChange={(value) => setChangelogForm({ ...changelogForm, source: value as ChangelogSource })}>
                                    <option value="manual">Manual</option>
                                    <option value="ai_agent">AI Agent</option>
                                    <option value="github">GitHub</option>
                                    <option value="n8n">n8n</option>
                                    <option value="system">System</option>
                                </SelectField>
                                <Input label="Source reference" value={changelogForm.source_reference || ''} onChange={(event) => setChangelogForm({ ...changelogForm, source_reference: event.target.value })} />
                            </div>
                            <Textarea label="Markdown content" className="min-h-[260px] font-mono" value={changelogForm.content_markdown} onChange={(event) => setChangelogForm({ ...changelogForm, content_markdown: event.target.value })} />
                            <div className="grid gap-3 sm:grid-cols-2">
                                <ToggleField label="Published" checked={changelogForm.is_published === true} onChange={(checked) => setChangelogForm({ ...changelogForm, is_published: checked })} />
                                <ToggleField label="Generated by AI" checked={changelogForm.generated_by_ai} onChange={(checked) => setChangelogForm({ ...changelogForm, generated_by_ai: checked })} />
                            </div>
                            <div className="flex gap-2">
                                <Button variant="primary" onClick={saveChangelog} loading={saving}>
                                    <Save className="mr-2 h-4 w-4" />
                                    {editingChangelogId ? 'Save Entry' : 'Add Entry'}
                                </Button>
                                {editingChangelogId && (
                                    <Button variant="outline" onClick={() => { setEditingChangelogId(null); setChangelogForm(emptyChangelog); }}>
                                        Cancel
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                            <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Markdown Preview</h2>
                            <MarkdownContent content={changelogPreview} />
                        </div>
                        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Changelog Entries</h2>
                            </div>
                            <div className="divide-y divide-slate-200 dark:divide-slate-800">
                                {changelog.length === 0 ? (
                                    <div className="p-8 text-center text-sm text-slate-500">No changelog entries configured.</div>
                                ) : changelog.map(entry => (
                                    <div key={entry.id} className="p-5">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {entry.version_number && <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">{entry.version_number}</span>}
                                                    {entry.is_published ? <Badge variant="success">Published</Badge> : <Badge variant="secondary">Draft</Badge>}
                                                    {entry.generated_by_ai && <Badge variant="info">AI</Badge>}
                                                    <span className="text-xs text-slate-500">{entry.source}</span>
                                                </div>
                                                <h3 className="mt-2 font-semibold text-slate-900 dark:text-white">{entry.title}</h3>
                                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatDate(entry.published_at)}</p>
                                            </div>
                                            <div className="flex shrink-0 gap-2">
                                                <Button size="icon" variant="ghost" title="Edit changelog" onClick={() => { setEditingChangelogId(entry.id); setChangelogForm({ version_number: entry.version_number || '', title: entry.title, content_markdown: entry.content_markdown, published_at: entry.published_at || new Date().toISOString(), is_published: entry.is_published === true, generated_by_ai: entry.generated_by_ai, source: entry.source, source_reference: entry.source_reference || '' }); }}>
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button size="icon" variant="ghost" title="Delete changelog" onClick={() => deleteChangelogEntry(entry)}>
                                                    <Trash2 className="h-4 w-4 text-rose-500" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {activeTab === 'ai' && (
                <section className="space-y-6">
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="mb-5 flex items-center gap-2">
                            <Bot className="h-5 w-5 text-indigo-600" />
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">AI / n8n Content Intake</h2>
                        </div>
                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                                <div className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Changelog webhook</div>
                                <code className="mt-2 block overflow-x-auto rounded bg-slate-950 p-3 text-xs text-slate-100">{publicWebhookUrl}</code>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                                <div className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Roadmap webhook</div>
                                <code className="mt-2 block overflow-x-auto rounded bg-slate-950 p-3 text-xs text-slate-100">{roadmapWebhookUrl}</code>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                                <div className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Required header</div>
                                <code className="mt-2 block rounded bg-slate-950 p-3 text-xs text-slate-100">x-qc-agent-secret: ********</code>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                                <div className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Environment variable</div>
                                <code className="mt-2 block rounded bg-slate-950 p-3 text-xs text-slate-100">QC_AGENT_WEBHOOK_SECRET</code>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                            <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                                <Clipboard className="h-4 w-4 text-indigo-600" />
                                Changelog payload
                            </h3>
                            <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs leading-6 text-slate-100">{`{
  "version_number": "v1.4.0",
  "title": "Release v1.4.0",
  "content_markdown": "### Added\\n- New dashboard widgets\\n\\n### Fixed\\n- Bug sync issue",
  "published_at": "2026-06-13T10:00:00Z",
  "source": "n8n",
  "source_reference": "workflow-id-or-github-release"
}`}</pre>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                            <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                                <BarChart3 className="h-4 w-4 text-indigo-600" />
                                Roadmap payload
                            </h3>
                            <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs leading-6 text-slate-100">{`{
  "title": "Public roadmap item",
  "description": "Short public description",
  "status": "planned",
  "priority": "medium",
  "target_date": "2026-07-31",
  "is_public": true,
  "source": "n8n",
  "source_reference": "roadmap-item-key"
}`}</pre>
                        </div>
                    </div>

                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                        The secret value is never exposed in the browser. Configure it on the API container and in the n8n credential or workflow environment.
                    </div>
                </section>
            )}
        </div>
    );
}
