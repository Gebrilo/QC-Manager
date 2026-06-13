'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    BarChart3,
    Bug,
    CheckCircle2,
    ClipboardList,
    FileText,
    Gauge,
    GitBranch,
    LogIn,
    Map,
    ShieldCheck,
    Sparkles,
    TestTube2,
    Users2,
    Workflow,
} from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { getLandingPage } from '@/config/routes';
import { landingPageApi, type ChangelogEntry, type LandingPageFeature, type PublicLandingPageResponse, type RoadmapItem, type RoadmapStatus } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { MarkdownContent } from './MarkdownContent';

const iconMap = {
    'bar-chart': BarChart3,
    bug: Bug,
    'clipboard-list': ClipboardList,
    file: FileText,
    gauge: Gauge,
    git: GitBranch,
    map: Map,
    shield: ShieldCheck,
    sparkles: Sparkles,
    'test-tube': TestTube2,
    users: Users2,
    workflow: Workflow,
};

const roadmapLabels: Record<RoadmapStatus, string> = {
    planned: 'Planned',
    in_progress: 'In Progress',
    completed: 'Completed',
};

function formatDate(value?: string | null) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function ProductScene() {
    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-slate-50 to-transparent dark:from-slate-950" />
            <div className="absolute right-[-8rem] top-24 hidden w-[46rem] rotate-[-6deg] rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-2xl shadow-slate-900/10 backdrop-blur md:block dark:border-slate-700/70 dark:bg-slate-900/80">
                <div className="grid grid-cols-[1.1fr_0.8fr] gap-3">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
                            <div>
                                <div className="h-2 w-24 rounded bg-cyan-500" />
                                <div className="mt-3 h-2 w-48 rounded bg-slate-300 dark:bg-slate-700" />
                            </div>
                            <div className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-bold uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Ready</div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                ['83%', 'Pass rate', 'bg-emerald-500'],
                                ['12', 'Open bugs', 'bg-amber-500'],
                                ['4', 'At risk', 'bg-rose-500'],
                            ].map(([value, label, color]) => (
                                <div key={label} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                                    <div className={`h-1.5 w-10 rounded ${color}`} />
                                    <div className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
                                </div>
                            ))}
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                            <div className="flex items-center justify-between text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                                <span>Release gate</span>
                                <span>Quality</span>
                            </div>
                            <div className="mt-4 space-y-3">
                                {[82, 64, 91].map((width, index) => (
                                    <div key={index} className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                                        <div className="h-2 rounded-full bg-cyan-500" style={{ width: `${width}%` }} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="space-y-3">
                        {['Tuleap sync', 'Roadmap', 'AI changelog', 'Reports'].map((label, index) => (
                            <div key={label} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                                <div className={`h-8 w-8 rounded-lg ${index % 2 === 0 ? 'bg-cyan-100 dark:bg-cyan-900/40' : 'bg-amber-100 dark:bg-amber-900/40'}`} />
                                <div className="min-w-0 flex-1">
                                    <div className="h-2 w-24 rounded bg-slate-300 dark:bg-slate-700" />
                                    <div className="mt-2 h-2 w-16 rounded bg-slate-200 dark:bg-slate-800" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function FeatureCard({ feature }: { feature: LandingPageFeature }) {
    const Icon = iconMap[(feature.icon_key || '') as keyof typeof iconMap] || ShieldCheck;
    return (
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">
                <Icon className="h-5 w-5" />
            </div>
            <h3 className="mt-5 text-base font-semibold text-slate-950 dark:text-white">{feature.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{feature.description}</p>
        </article>
    );
}

function RoadmapColumn({ status, items }: { status: RoadmapStatus; items: RoadmapItem[] }) {
    return (
        <section className="min-w-0">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{roadmapLabels[status]}</h3>
                <Badge variant="default">{items.length}</Badge>
            </div>
            <div className="space-y-3">
                {items.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        No public items.
                    </div>
                ) : items.map(item => (
                    <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-start justify-between gap-3">
                            <h4 className="text-sm font-semibold text-slate-950 dark:text-white">{item.title}</h4>
                            <Badge variant={item.priority === 'critical' ? 'danger' : item.priority === 'high' ? 'warning' : item.priority === 'medium' ? 'info' : 'secondary'}>
                                {item.priority}
                            </Badge>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.description}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                            {formatDate(item.target_date) && <span>Target {formatDate(item.target_date)}</span>}
                            {formatDate(item.completion_date) && <span>Completed {formatDate(item.completion_date)}</span>}
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}

function ChangelogCard({ entry }: { entry: ChangelogEntry }) {
    return (
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                {entry.version_number && <span className="font-semibold text-cyan-700 dark:text-cyan-300">{entry.version_number}</span>}
                {formatDate(entry.published_at) && <span>{formatDate(entry.published_at)}</span>}
                {entry.generated_by_ai && <Badge variant="info">AI assisted</Badge>}
                <Badge variant="secondary">{entry.source}</Badge>
            </div>
            <h3 className="mt-3 text-base font-semibold text-slate-950 dark:text-white">{entry.title}</h3>
            <div className="mt-3">
                <MarkdownContent content={entry.content_markdown} compact />
            </div>
        </article>
    );
}

export function PublicLandingPage() {
    const router = useRouter();
    const { user, permissions, loading: authLoading } = useAuth();
    const [data, setData] = useState<PublicLandingPageResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (authLoading) return;
        if (user) {
            router.replace(getLandingPage(user, permissions));
            return;
        }

        let active = true;
        setLoading(true);
        setError(null);
        landingPageApi.getPublic()
            .then(result => {
                if (active) setData(result);
            })
            .catch(err => {
                if (active) setError(err.message || 'Landing page is unavailable');
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => { active = false; };
    }, [authLoading, permissions, router, user]);

    const roadmapByStatus = useMemo(() => {
        const groups: Record<RoadmapStatus, RoadmapItem[]> = {
            planned: [],
            in_progress: [],
            completed: [],
        };
        for (const item of data?.roadmap_items || []) groups[item.status]?.push(item);
        return groups;
    }, [data]);

    if (authLoading || (user && loading)) {
        return (
            <main className="flex h-screen items-center justify-center overflow-y-auto bg-slate-50 text-slate-600 dark:bg-slate-950 dark:text-slate-300">
                <Spinner size="lg" />
            </main>
        );
    }

    if (loading) {
        return (
            <main className="h-screen overflow-y-auto bg-slate-50 dark:bg-slate-950">
                <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6">
                    <div className="flex items-center gap-3 text-sm font-medium text-slate-500 dark:text-slate-400">
                        <Spinner size="md" />
                        Loading QC Manager...
                    </div>
                </div>
            </main>
        );
    }

    if (error || !data) {
        return (
            <main className="flex h-screen items-center justify-center overflow-y-auto bg-slate-50 px-6 dark:bg-slate-950">
                <div className="max-w-md text-center">
                    <h1 className="text-2xl font-bold text-slate-950 dark:text-white">QC Manager</h1>
                    <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{error || 'Landing page content is unavailable.'}</p>
                    <div className="mt-6 flex justify-center gap-3">
                        <a href="/login"><Button variant="primary"><LogIn className="h-4 w-4" /> Sign in</Button></a>
                    </div>
                </div>
            </main>
        );
    }

    const { config, features, changelog_entries } = data;

    return (
        <main className="h-screen overflow-y-auto bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-white">
            <header className="absolute inset-x-0 top-0 z-20">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
                    <a href="/" className="flex items-center gap-3 text-sm font-bold tracking-tight text-slate-950 dark:text-white">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">QC</span>
                        QC Manager
                    </a>
                    <a href="/login"><Button variant="outline" size="sm"><LogIn className="h-4 w-4" /> Sign in</Button></a>
                </div>
            </header>

            <section className="relative min-h-[78vh] overflow-hidden border-b border-slate-200 bg-[radial-gradient(circle_at_20%_20%,rgba(6,182,212,0.14),transparent_28%)] bg-gradient-to-br from-slate-50 via-cyan-50/40 to-amber-50/30 pt-28 dark:border-slate-800 dark:bg-[radial-gradient(circle_at_20%_20%,rgba(6,182,212,0.10),transparent_28%)] dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
                <ProductScene />
                <div className="relative z-10 mx-auto max-w-7xl px-5 pb-16 pt-10 sm:px-8 lg:pt-20">
                    <div className="max-w-3xl">
                        <Badge variant="info" className="mb-6 gap-2 border border-cyan-200/50 bg-white/80 backdrop-blur dark:border-cyan-800/50 dark:bg-slate-900/80">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Public quality workspace
                        </Badge>
                        <h1 className="max-w-3xl text-5xl font-bold leading-tight text-slate-950 sm:text-6xl dark:text-white">
                            {config.hero_title}
                        </h1>
                        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-700 dark:text-slate-300">
                            {config.hero_subtitle}
                        </p>
                        <div className="mt-8 flex flex-wrap gap-3">
                            <a href={config.hero_cta_url || '/login'}><Button variant="primary" size="lg"><LogIn className="h-4 w-4" /> {config.hero_cta_label}</Button></a>
                            <a href={config.hero_secondary_cta_url || '/register'}><Button variant="outline" size="lg">{config.hero_secondary_cta_label}</Button></a>
                        </div>
                    </div>
                </div>
            </section>

            <section className="border-b border-slate-200 bg-white py-14 dark:border-slate-800 dark:bg-slate-950">
                <div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
                    <div>
                        <p className="text-sm font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">Product Overview</p>
                        <h2 className="mt-3 text-3xl font-bold text-slate-950 dark:text-white">{config.marketing_intro_title}</h2>
                    </div>
                    <p className="text-base leading-8 text-slate-600 dark:text-slate-300">{config.marketing_intro_description}</p>
                </div>
            </section>

            {config.show_features && (
                <section className="py-16">
                    <div className="mx-auto max-w-7xl px-5 sm:px-8">
                        <div className="mb-8 flex items-end justify-between gap-4">
                            <div>
                                <p className="text-sm font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">Features</p>
                                <h2 className="mt-3 text-3xl font-bold text-slate-950 dark:text-white">What QC Manager offers</h2>
                            </div>
                        </div>
                        {features.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                                No public features have been published yet.
                            </div>
                        ) : (
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                {features.map(feature => <FeatureCard key={feature.id} feature={feature} />)}
                            </div>
                        )}
                    </div>
                </section>
            )}

            {config.show_roadmap && (
                <section className="border-y border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-slate-950">
                    <div className="mx-auto max-w-7xl px-5 sm:px-8">
                        <div className="mb-8">
                            <p className="text-sm font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">Roadmap</p>
                            <h2 className="mt-3 text-3xl font-bold text-slate-950 dark:text-white">Public delivery outlook</h2>
                        </div>
                        <div className="grid gap-5 lg:grid-cols-3">
                            <RoadmapColumn status="planned" items={roadmapByStatus.planned} />
                            <RoadmapColumn status="in_progress" items={roadmapByStatus.in_progress} />
                            <RoadmapColumn status="completed" items={roadmapByStatus.completed} />
                        </div>
                    </div>
                </section>
            )}

            {config.show_changelog && (
                <section className="py-16">
                    <div className="mx-auto max-w-7xl px-5 sm:px-8">
                        <div className="mb-8">
                            <p className="text-sm font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">Changelog</p>
                            <h2 className="mt-3 text-3xl font-bold text-slate-950 dark:text-white">Latest published updates</h2>
                        </div>
                        {changelog_entries.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                                No public changelog entries have been published yet.
                            </div>
                        ) : (
                            <div className="grid gap-4 lg:grid-cols-2">
                                {changelog_entries.map(entry => <ChangelogCard key={entry.id} entry={entry} />)}
                            </div>
                        )}
                    </div>
                </section>
            )}

            {config.show_footer_cta && (
                <section className="border-t border-slate-200 bg-slate-950 py-14 text-white dark:border-slate-800">
                    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
                        <div className="max-w-2xl">
                            <h2 className="text-3xl font-bold">{config.footer_cta_title}</h2>
                            <p className="mt-3 text-sm leading-6 text-slate-300">{config.footer_cta_description}</p>
                        </div>
                        <a href={config.footer_cta_url || '/login'}><Button variant="outline" size="lg">{config.footer_cta_label}</Button></a>
                    </div>
                </section>
            )}
        </main>
    );
}
