'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowRight,
    BarChart3,
    Bug,
    Check,
    ClipboardList,
    FileText,
    FolderKanban,
    Gauge,
    GitBranch,
    LayoutDashboard,
    LogIn,
    Lock,
    Map,
    Play,
    ShieldCheck,
    Sparkles,
    TestTube2,
    Users2,
    Workflow,
} from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { getLandingPage } from '@/config/routes';
import { landingPageApi, type ChangelogEntry, type LandingPageFeature, type PublicLandingPageResponse, type RoadmapItem, type RoadmapPriority, type RoadmapStatus } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { getFeatureIcon } from './iconRegistry';
import { MarkdownContent } from './MarkdownContent';

// ---- Static marketing content (presentational, not backend-driven) ----
const VALUE_PROPS: Array<{ label: string; Icon: typeof BarChart3 }> = [
    { label: 'Centralized QC visibility', Icon: BarChart3 },
    { label: 'Better defect control', Icon: ShieldCheck },
    { label: 'Smarter resource tracking', Icon: Users2 },
    { label: 'Integrated delivery workflow', Icon: Workflow },
    { label: 'AI-ready roadmap & changelog', Icon: Sparkles },
    { label: 'Full story-to-bug traceability', Icon: GitBranch },
];

const PIPELINE: Array<{ label: string; Icon: typeof BarChart3 }> = [
    { label: 'Project', Icon: FolderKanban },
    { label: 'User Stories', Icon: FileText },
    { label: 'Tasks', Icon: ClipboardList },
    { label: 'Test Cases', Icon: TestTube2 },
    { label: 'Bugs', Icon: Bug },
    { label: 'Reports', Icon: BarChart3 },
    { label: 'Governance', Icon: ShieldCheck },
];

const WORKFLOW_TRIO = [
    { kicker: 'Traceability', title: 'Nothing gets orphaned', body: 'Bidirectional links between stories, tasks, test cases and bugs mean coverage gaps surface instantly.' },
    { kicker: 'Visibility', title: 'One source of health', body: 'Project health rolls up from real test and defect data — not a manually updated status field.' },
    { kicker: 'Control', title: 'Governance by default', body: 'Quality gates and metrics are enforced as part of the flow, not bolted on at release time.' },
];

const AI_POINTS = [
    { title: 'Generate release notes', body: 'Draft clear, structured changelog entries from merged tasks and resolved bugs.' },
    { title: 'Summarize completed work', body: 'Roll up what shipped this cycle into a stakeholder-ready narrative.' },
    { title: 'Support roadmap updates', body: 'Suggest and reprioritize roadmap items from real activity patterns.' },
    { title: 'Activity → changelog content', body: 'Turn test runs, defects and merges into readable, publishable updates.' },
];

const roadmapLabels: Record<RoadmapStatus, string> = {
    planned: 'Planned',
    in_progress: 'In Progress',
    completed: 'Completed',
};

const roadmapDot: Record<RoadmapStatus, string> = {
    planned: '#818cf8',
    in_progress: '#f59e0b',
    completed: '#10b981',
};

const priorityPill: Record<RoadmapPriority, { label: string; cls: string }> = {
    critical: { label: 'Critical', cls: 'bg-rose-100 text-rose-700' },
    high: { label: 'High', cls: 'bg-rose-100 text-rose-700' },
    medium: { label: 'Medium', cls: 'bg-amber-100 text-amber-700' },
    low: { label: 'Low', cls: 'bg-slate-100 text-slate-600' },
};

const PILL = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide';
const EYEBROW = 'text-[11px] font-bold uppercase tracking-[0.12em] text-indigo-500';

function formatDate(value?: string | null) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function roadmapDateLabel(item: RoadmapItem): string | null {
    if (item.status === 'completed') {
        const date = formatDate(item.completion_date) || formatDate(item.target_date);
        return date ? `Shipped ${date}` : null;
    }
    const date = formatDate(item.target_date);
    return date ? `Target ${date}` : null;
}

// ============================================================================
// Hero dashboard mockup (static design chrome)
// ============================================================================
function HeroMockup() {
    return (
        <div className="lp-reveal relative">
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_40px_80px_-24px_rgba(49,46,129,0.35),0_12px_28px_-12px_rgba(15,23,42,0.18)]">
                {/* window top bar */}
                <div className="flex h-11 items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4">
                    <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-rose-400" />
                        <span className="h-3 w-3 rounded-full bg-amber-400" />
                        <span className="h-3 w-3 rounded-full bg-emerald-400" />
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
                        <Lock className="h-3 w-3" />
                        app.qc-manager.io/dashboard
                    </div>
                    <span className="w-12" />
                </div>
                {/* app body */}
                <div className="flex" style={{ height: 392 }}>
                    {/* mini sidebar */}
                    <div className="flex w-[52px] shrink-0 flex-col items-center gap-1 border-r border-slate-200 bg-slate-50/70 py-3">
                        <span className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-[10px] font-extrabold text-white">QC</span>
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg border-l-2 border-indigo-500 bg-indigo-50 text-indigo-600"><LayoutDashboard className="h-[15px] w-[15px]" /></span>
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400"><ClipboardList className="h-[15px] w-[15px]" /></span>
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400"><TestTube2 className="h-[15px] w-[15px]" /></span>
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400"><BarChart3 className="h-[15px] w-[15px]" /></span>
                    </div>
                    {/* main */}
                    <div className="flex-1 overflow-hidden p-4">
                        <div className="mb-1 flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Quality Control</span>
                            <span className={`${PILL} bg-blue-100 text-blue-700`}><span className="h-1.5 w-1.5 rounded-full bg-blue-500" />Live</span>
                        </div>
                        <div className="mb-3 text-[19px] font-extrabold tracking-tight text-slate-900">Quality overview</div>
                        {/* stat row */}
                        <div className="mb-3 grid grid-cols-4 gap-2">
                            {[
                                { label: 'Projects', value: '5', note: '↑ +1 wk', noteCls: 'text-emerald-600' },
                                { label: 'Test cases', value: '368', note: '74% tgt', noteCls: 'text-slate-400' },
                                { label: 'Open bugs', value: '12', note: '↓ −3', noteCls: 'text-emerald-600' },
                                { label: 'At risk', value: '7', note: '2 esc.', noteCls: 'text-rose-500' },
                            ].map(stat => (
                                <div key={stat.label} className="rounded-xl border border-white/50 bg-white/60 p-2.5 shadow-[0_4px_30px_rgba(0,0,0,0.05)] backdrop-blur">
                                    <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">{stat.label}</div>
                                    <div className="text-[20px] font-bold leading-none text-slate-900">{stat.value}</div>
                                    <div className={`mt-1 text-[10px] font-semibold ${stat.noteCls}`}>{stat.note}</div>
                                </div>
                            ))}
                        </div>
                        {/* table */}
                        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                            <div className="grid grid-cols-[58px_1fr_88px] gap-2 border-b border-slate-100 px-3 py-2">
                                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Key</span>
                                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Project</span>
                                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Health</span>
                            </div>
                            {[
                                { key: 'ERP-Q1', name: 'Acme ERP', pct: 74, bar: 'bg-blue-500', badge: 'On track', badgeCls: 'bg-blue-100 text-blue-700' },
                                { key: 'MOB-3', name: 'Mobile Banking', pct: 100, bar: 'bg-emerald-500', badge: 'Complete', badgeCls: 'bg-emerald-100 text-emerald-700' },
                                { key: 'PAY-7', name: 'Payments API', pct: 38, bar: 'bg-rose-500', badge: 'At risk', badgeCls: 'bg-rose-100 text-rose-700' },
                            ].map((row, i, arr) => (
                                <div key={row.key} className={`grid grid-cols-[58px_1fr_88px] items-center gap-2 px-3 py-2.5 ${i < arr.length - 1 ? 'border-b border-slate-50' : ''}`}>
                                    <span className="font-mono text-[11px] font-semibold text-indigo-600">{row.key}</span>
                                    <div>
                                        <div className="text-[12px] font-semibold leading-tight text-slate-800">{row.name}</div>
                                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${row.bar}`} style={{ width: `${row.pct}%` }} /></div>
                                    </div>
                                    <span className={`${PILL} px-2 text-[9px] ${row.badgeCls}`}>{row.badge}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            {/* floating chip */}
            <div className="absolute hidden items-center gap-2.5 rounded-xl border border-white/50 bg-white/60 px-3.5 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur sm:flex" style={{ right: -8, bottom: 36 }}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-white"><Sparkles className="h-4 w-4" /></span>
                <div>
                    <div className="text-[11px] font-bold leading-tight text-slate-900">Release notes ready</div>
                    <div className="text-[10px] text-slate-500">AI summarized 18 merged tasks</div>
                </div>
            </div>
        </div>
    );
}

function FeatureCard({ feature }: { feature: LandingPageFeature }) {
    const Icon = getFeatureIcon(feature.icon_key);
    return (
        <div className="lp-reveal group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-[0_12px_28px_-8px_rgba(15,23,42,0.14)]">
            <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600 transition-colors group-hover:border-transparent group-hover:bg-gradient-to-br group-hover:from-indigo-600 group-hover:to-violet-600 group-hover:text-white">
                <Icon className="h-5 w-5" />
            </span>
            <h3 className="mb-1.5 text-[16px] font-bold leading-snug text-slate-900">{feature.title}</h3>
            <p className="text-[13.5px] leading-relaxed text-slate-600">{feature.description}</p>
        </div>
    );
}

function RoadmapCard({ item }: { item: RoadmapItem }) {
    const prio = priorityPill[item.priority] || priorityPill.medium;
    const date = roadmapDateLabel(item);
    return (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-2.5 flex items-center justify-between">
                <span className={`${PILL} ${prio.cls}`}>{prio.label}</span>
                {date && <span className="font-mono text-[11px] text-slate-400">{date}</span>}
            </div>
            <h3 className="mb-1 text-[15px] font-bold leading-snug text-slate-900">{item.title}</h3>
            <p className="text-[13px] leading-relaxed text-slate-600">{item.description}</p>
        </div>
    );
}

function RoadmapColumn({ status, items }: { status: RoadmapStatus; items: RoadmapItem[] }) {
    return (
        <div>
            <div className="mb-4 flex items-center gap-2 px-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: roadmapDot[status] }} />
                <span className="text-[13px] font-bold text-slate-800">{roadmapLabels[status]}</span>
                <span className={`${PILL} ml-auto bg-slate-100 text-slate-600`}>{items.length}</span>
            </div>
            {items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">No public items.</div>
            ) : (
                items.map(item => <RoadmapCard key={item.id} item={item} />)
            )}
        </div>
    );
}

function RoadmapShowcase({ groups }: { groups: Record<RoadmapStatus, RoadmapItem[]> }) {
    const [tab, setTab] = useState<RoadmapStatus>('planned');
    const tabs: RoadmapStatus[] = ['planned', 'in_progress', 'completed'];
    return (
        <>
            <div className="lp-reveal flex shrink-0 items-center gap-1 self-start rounded-xl border border-slate-200 bg-slate-100 p-1 md:self-auto">
                {tabs.map(key => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setTab(key)}
                        className={`rounded-lg px-4 py-2 text-[13px] font-semibold transition-all ${tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        {roadmapLabels[key]}
                    </button>
                ))}
            </div>
            <div className="mt-8 grid gap-5 lg:grid-cols-3">
                {tabs.map(key => (
                    <div key={key} className={`${tab === key ? 'block' : 'hidden'} lg:block`}>
                        <RoadmapColumn status={key} items={groups[key]} />
                    </div>
                ))}
            </div>
        </>
    );
}

function ChangelogShowcase({ entries }: { entries: ChangelogEntry[] }) {
    const [active, setActive] = useState(0);
    const current = entries[active] || entries[0];
    const railLabel = (entry: ChangelogEntry, index: number) => entry.version_number ? `v${entry.version_number.replace(/^v/i, '')}` : `Update ${index + 1}`;

    return (
        <div className="grid items-start gap-8 lg:grid-cols-[200px_1fr]">
            {/* version rail */}
            <div className="lp-reveal sticky top-24 hidden flex-col gap-1 lg:flex">
                {entries.map((entry, index) => (
                    <button
                        key={entry.id}
                        type="button"
                        onClick={() => setActive(index)}
                        className={`rounded-lg px-3 py-2.5 text-left font-mono text-[13px] font-bold transition-all ${index === active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}
                    >
                        {railLabel(entry, index)}
                    </button>
                ))}
            </div>
            {/* active panel */}
            <article className="lp-reveal rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
                <div className="mb-1 flex flex-wrap items-center gap-3">
                    {current.version_number && (
                        <span className="rounded-md bg-indigo-50 px-2.5 py-1 font-mono text-[13px] font-bold text-indigo-600">v{current.version_number.replace(/^v/i, '')}</span>
                    )}
                    {current.generated_by_ai && (
                        <span className={`${PILL} border border-violet-200 bg-violet-50 text-violet-700`}>✦ AI-generated</span>
                    )}
                    <span className={`${PILL} bg-slate-100 text-slate-500`}>{current.source}</span>
                    {formatDate(current.published_at) && (
                        <span className="ml-auto font-mono text-[12px] text-slate-400">{formatDate(current.published_at)}</span>
                    )}
                </div>
                <h3 className="mb-5 text-[22px] font-extrabold tracking-tight text-slate-900">{current.title}</h3>
                <MarkdownContent content={current.content_markdown} />
            </article>
        </div>
    );
}

export function PublicLandingPage() {
    const router = useRouter();
    const { user, permissions, loading: authLoading } = useAuth();
    const [data, setData] = useState<PublicLandingPageResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [scrolled, setScrolled] = useState(false);
    const scrollRef = useRef<HTMLElement>(null);

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

    // Nav background + scroll-reveal. Bound to the scroll container because the
    // document itself does not scroll (html is overflow:hidden app-wide).
    useEffect(() => {
        const root = scrollRef.current;
        if (!root || !data) return;

        root.classList.add('lp-js');
        const onScroll = () => setScrolled(root.scrollTop > 12);
        onScroll();
        root.addEventListener('scroll', onScroll, { passive: true });

        const items = Array.from(root.querySelectorAll<HTMLElement>('.lp-reveal'));
        const observer = new IntersectionObserver(
            entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-in');
                        observer.unobserve(entry.target);
                    }
                });
            },
            { root, threshold: 0.05, rootMargin: '0px 0px -8% 0px' },
        );
        items.forEach(el => observer.observe(el));
        const failsafe = window.setTimeout(() => items.forEach(el => el.classList.add('is-in')), 1400);

        return () => {
            root.removeEventListener('scroll', onScroll);
            observer.disconnect();
            window.clearTimeout(failsafe);
        };
    }, [data]);

    const roadmapByStatus = useMemo(() => {
        const groups: Record<RoadmapStatus, RoadmapItem[]> = { planned: [], in_progress: [], completed: [] };
        for (const item of data?.roadmap_items || []) groups[item.status]?.push(item);
        return groups;
    }, [data]);

    if (authLoading || (user && loading)) {
        return (
            <main className="flex h-screen items-center justify-center bg-slate-50 text-slate-600">
                <Spinner size="lg" />
            </main>
        );
    }

    if (loading) {
        return (
            <main className="h-screen bg-slate-50">
                <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6">
                    <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
                        <Spinner size="md" />
                        Loading QC-Manager...
                    </div>
                </div>
            </main>
        );
    }

    if (error || !data) {
        return (
            <main className="flex h-screen items-center justify-center bg-slate-50 px-6">
                <div className="max-w-md text-center">
                    <h1 className="text-2xl font-bold text-slate-900">QC-Manager</h1>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{error || 'Landing page content is unavailable.'}</p>
                    <div className="mt-6 flex justify-center">
                        <a href="/login"><Button variant="primary"><LogIn className="h-4 w-4" /> Sign in</Button></a>
                    </div>
                </div>
            </main>
        );
    }

    const { config, features, changelog_entries } = data;
    const primaryCtaUrl = config.hero_cta_url || '/login';
    const primaryCtaLabel = config.hero_cta_label || 'Open QC-Manager';
    const secondaryCtaLabel = config.hero_secondary_cta_label || 'See how it works';
    const secondaryCtaUrl = config.hero_secondary_cta_url || '#workflow';
    const year = new Date().getFullYear();
    const marqueeRun = (
        <div className="lp-marquee-track flex shrink-0 items-center gap-12 pr-12">
            {VALUE_PROPS.map(({ label, Icon }, i) => (
                <span key={`${label}-${i}`} className="flex shrink-0 items-center gap-2.5 text-[14px] font-semibold text-slate-700">
                    <Icon className="h-[17px] w-[17px] text-indigo-500" />
                    {label}
                </span>
            ))}
        </div>
    );

    return (
        <main ref={scrollRef} className="h-screen overflow-y-auto scroll-smooth bg-slate-50 text-slate-900">
            {/* ===================== NAV ===================== */}
            <header className={`fixed inset-x-0 top-0 z-50 border-b transition-all duration-300 ${scrolled ? 'border-slate-200 bg-white/[0.78] shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur-xl' : 'border-transparent'}`}>
                <div className="mx-auto w-full max-w-[1200px] px-8">
                    <div className="flex h-16 items-center justify-between">
                        <a href="#top" className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-[13px] font-extrabold tracking-tight text-white shadow-md">QC</span>
                            <span className="text-[15px] font-bold tracking-tight text-slate-900">QC-Manager</span>
                        </a>
                        <nav className="hidden items-center gap-1 md:flex">
                            {config.show_features && <a href="#features" className="rounded-lg px-3.5 py-2 text-[14px] font-medium text-slate-600 transition-colors hover:bg-slate-100/70 hover:text-slate-900">Features</a>}
                            {config.show_roadmap && <a href="#roadmap" className="rounded-lg px-3.5 py-2 text-[14px] font-medium text-slate-600 transition-colors hover:bg-slate-100/70 hover:text-slate-900">Roadmap</a>}
                            {config.show_changelog && <a href="#changelog" className="rounded-lg px-3.5 py-2 text-[14px] font-medium text-slate-600 transition-colors hover:bg-slate-100/70 hover:text-slate-900">Changelog</a>}
                            <a href="#about" className="rounded-lg px-3.5 py-2 text-[14px] font-medium text-slate-600 transition-colors hover:bg-slate-100/70 hover:text-slate-900">About</a>
                        </nav>
                        <div className="flex items-center gap-2">
                            <a href="/login" className="hidden h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-slate-600 transition-colors hover:bg-slate-100/70 hover:text-slate-900 sm:inline-flex">Login</a>
                            <a href="https://gebrils.cloud/register" className="inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-[18px] text-[14px] font-semibold text-white shadow-[0_10px_15px_-3px_rgba(99,102,241,0.30)] transition-all hover:from-indigo-700 hover:to-violet-700 hover:shadow-[0_10px_25px_-5px_rgba(99,102,241,0.40)]">
                                Sign up
                                <ArrowRight className="h-[15px] w-[15px]" />
                            </a>
                        </div>
                    </div>
                </div>
            </header>

            {/* ===================== HERO ===================== */}
            <section id="top" className="relative overflow-hidden scroll-mt-24">
                <div
                    className="absolute inset-0 -z-10"
                    style={{
                        background:
                            'radial-gradient(900px 500px at 78% -8%, rgba(124,58,237,.14), transparent 60%), radial-gradient(760px 460px at 8% 8%, rgba(99,102,241,.12), transparent 58%), linear-gradient(180deg, #ffffff 0%, #f8fafc 60%, #f1f5f9 100%)',
                    }}
                />
                <div className="absolute inset-0 -z-10 opacity-60" style={{ backgroundImage: 'radial-gradient(rgba(15,23,42,.05) 1px, transparent 1px)', backgroundSize: '26px 26px' }} />

                <div className="mx-auto w-full max-w-[1200px] px-8 pb-24 pt-32 sm:pt-36">
                    <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1.25fr]">
                        {/* copy */}
                        <div>
                            <div className="lp-reveal mb-7 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1.5 pl-1.5 pr-3 shadow-sm">
                                <span className={`${PILL} bg-indigo-100 text-indigo-700`}>AI-Ready</span>
                                <span className="text-[13px] font-medium text-slate-600">Roadmap &amp; changelog, generated from real activity</span>
                            </div>
                            <h1 className="lp-reveal text-[44px] font-extrabold leading-[1.04] tracking-[-0.025em] text-slate-900 sm:text-[56px]">
                                {config.hero_title}
                            </h1>
                            <p className="lp-reveal mt-6 max-w-[34rem] text-[18px] leading-relaxed text-slate-600">
                                {config.hero_subtitle}
                            </p>
                            <div className="lp-reveal mt-8 flex flex-wrap items-center gap-3">
                                <a href={primaryCtaUrl} className="inline-flex h-12 items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-6 text-[15px] font-semibold text-white shadow-[0_10px_15px_-3px_rgba(99,102,241,0.30)] transition-all hover:-translate-y-px hover:from-indigo-700 hover:to-violet-700 hover:shadow-[0_10px_25px_-5px_rgba(99,102,241,0.40)]">
                                    {primaryCtaLabel}
                                    <ArrowRight className="h-4 w-4" />
                                </a>
                                <a href={secondaryCtaUrl} className="inline-flex h-12 items-center gap-2 rounded-lg border border-slate-300 bg-white/70 px-6 text-[15px] font-semibold text-slate-700 backdrop-blur transition-colors hover:border-slate-400 hover:bg-white">
                                    <Play className="h-4 w-4" />
                                    {secondaryCtaLabel}
                                </a>
                            </div>
                            <div className="lp-reveal mt-9 flex items-center gap-6 text-slate-500">
                                <div className="flex items-center gap-2 text-[13px] font-medium">
                                    <Check className="h-4 w-4 text-emerald-500" /> Tuleap integration
                                </div>
                                <div className="flex items-center gap-2 text-[13px] font-medium">
                                    <Check className="h-4 w-4 text-emerald-500" /> Governance built in
                                </div>
                            </div>
                        </div>
                        {/* mockup */}
                        <HeroMockup />
                    </div>
                </div>
            </section>

            {/* ===================== VALUE MARQUEE ===================== */}
            <section className="border-y border-slate-200 bg-white/70 py-7">
                <div className="mx-auto flex w-full max-w-[1200px] items-center gap-8 px-8">
                    <span className="hidden shrink-0 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 md:block">Why teams choose it</span>
                    <div className="lp-marquee flex flex-1 overflow-hidden">
                        {marqueeRun}
                        {marqueeRun}
                    </div>
                </div>
            </section>

            {/* ===================== FEATURES ===================== */}
            {config.show_features && (
                <section id="features" className="scroll-mt-24 py-24">
                    <div className="mx-auto w-full max-w-[1200px] px-8">
                        <div className="mb-14 max-w-2xl">
                            <div className={`lp-reveal mb-3 ${EYEBROW}`}>Features</div>
                            <h2 className="lp-reveal text-[36px] font-extrabold leading-[1.08] tracking-[-0.025em] text-slate-900 sm:text-[42px]">{config.marketing_intro_title}</h2>
                            <p className="lp-reveal mt-4 text-[17px] leading-relaxed text-slate-600">{config.marketing_intro_description}</p>
                        </div>
                        {features.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">No public features have been published yet.</div>
                        ) : (
                            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                                {features.map(feature => <FeatureCard key={feature.id} feature={feature} />)}
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* ===================== WORKFLOW ===================== */}
            <section id="workflow" className="relative scroll-mt-24 overflow-hidden border-y border-slate-200 bg-white py-24">
                <div className="absolute inset-0 -z-10 opacity-50" style={{ backgroundImage: 'radial-gradient(rgba(15,23,42,.05) 1px, transparent 1px)', backgroundSize: '26px 26px' }} />
                <div className="mx-auto w-full max-w-[1200px] px-8">
                    <div className="mb-14 max-w-2xl">
                        <div className={`lp-reveal mb-3 ${EYEBROW}`}>How it works</div>
                        <h2 className="lp-reveal text-[36px] font-extrabold leading-[1.08] tracking-[-0.025em] text-slate-900 sm:text-[42px]">A clear path from project to governance</h2>
                        <p className="lp-reveal mt-4 text-[17px] leading-relaxed text-slate-600">Every artifact traces up and down the chain — so a failing test case always links back to a story, and a governance metric is never a black box.</p>
                    </div>

                    {/* pipeline */}
                    <div className="lp-reveal relative">
                        <div className="absolute left-0 right-0 top-[34px] hidden h-[2px] bg-gradient-to-r from-indigo-200 to-violet-200 lg:block" />
                        <div className="relative grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-4 lg:grid-cols-7">
                            {PIPELINE.map(({ label, Icon }, i) => (
                                <div key={label} className="flex flex-col items-center gap-3 text-center">
                                    <span className="relative z-10 flex h-[68px] w-[68px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-indigo-600 shadow-sm">
                                        <Icon className="h-[26px] w-[26px]" />
                                        <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 text-[10px] font-bold text-white">{i + 1}</span>
                                    </span>
                                    <span className="text-[13px] font-semibold leading-tight text-slate-700">{label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* supporting trio */}
                    <div className="mt-16 grid gap-5 md:grid-cols-3">
                        {WORKFLOW_TRIO.map(card => (
                            <div key={card.kicker} className="lp-reveal rounded-2xl border border-white/50 bg-white/60 p-6 shadow-[0_4px_30px_rgba(0,0,0,0.05)] backdrop-blur">
                                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-indigo-500">{card.kicker}</div>
                                <div className="mb-1.5 text-[17px] font-bold text-slate-900">{card.title}</div>
                                <p className="text-[14px] leading-relaxed text-slate-600">{card.body}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ===================== ROADMAP ===================== */}
            {config.show_roadmap && (
                <section id="roadmap" className="scroll-mt-24 py-24">
                    <div className="mx-auto w-full max-w-[1200px] px-8">
                        <div className="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                            <div className="max-w-2xl">
                                <div className={`lp-reveal mb-3 ${EYEBROW}`}>Public roadmap</div>
                                <h2 className="lp-reveal text-[36px] font-extrabold leading-[1.08] tracking-[-0.025em] text-slate-900 sm:text-[42px]">Where QC-Manager is headed</h2>
                                <p className="lp-reveal mt-4 text-[17px] leading-relaxed text-slate-600">Grouped by status, priority and target date — straight from the team&apos;s live delivery plan.</p>
                            </div>
                        </div>
                        <RoadmapShowcase groups={roadmapByStatus} />
                    </div>
                </section>
            )}

            {/* ===================== CHANGELOG ===================== */}
            {config.show_changelog && (
                <section id="changelog" className="scroll-mt-24 border-y border-slate-200 bg-white py-24">
                    <div className="mx-auto w-full max-w-[1200px] px-8">
                        <div className="mb-12 max-w-2xl">
                            <div className={`lp-reveal mb-3 ${EYEBROW}`}>Changelog</div>
                            <h2 className="lp-reveal text-[36px] font-extrabold leading-[1.08] tracking-[-0.025em] text-slate-900 sm:text-[42px]">Release notes, kept human</h2>
                            <p className="lp-reveal mt-4 text-[17px] leading-relaxed text-slate-600">Clean, readable updates — many drafted automatically from merged work and reviewed before publish.</p>
                        </div>
                        {changelog_entries.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">No public changelog entries have been published yet.</div>
                        ) : (
                            <ChangelogShowcase entries={changelog_entries} />
                        )}
                    </div>
                </section>
            )}

            {/* ===================== AI ASSISTANT (dark) ===================== */}
            <section id="ai" className="relative overflow-hidden bg-slate-950 text-white">
                <div className="absolute inset-0 opacity-80" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
                <div className="absolute inset-0" style={{ background: 'radial-gradient(700px 420px at 85% 12%, rgba(124,58,237,.28), transparent 60%), radial-gradient(620px 420px at 5% 95%, rgba(79,70,229,.22), transparent 60%)' }} />
                <div className="relative mx-auto w-full max-w-[1200px] px-8 py-28">
                    <div className="grid items-center gap-16 lg:grid-cols-[1fr_1.05fr]">
                        <div>
                            <div className="lp-reveal mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] py-1.5 pl-1.5 pr-3">
                                <span className={`${PILL} bg-gradient-to-r from-indigo-500 to-violet-600 text-white`}>AI</span>
                                <span className="text-[13px] font-medium text-slate-300">A premium capability, not a gimmick</span>
                            </div>
                            <h2 className="lp-reveal text-[36px] font-extrabold leading-[1.08] tracking-[-0.025em] text-white sm:text-[44px]">
                                Turn raw activity into{' '}
                                <span className="bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">clear quality updates</span>
                            </h2>
                            <p className="lp-reveal mt-5 max-w-xl text-[17px] leading-relaxed text-slate-300">
                                QC-Manager reads what actually happened across your test runs, bugs and merged tasks — then drafts the narrative your stakeholders need. You stay in control: review, edit, publish.
                            </p>
                            <div className="mt-8 space-y-3.5">
                                {AI_POINTS.map(point => (
                                    <div key={point.title} className="lp-reveal flex items-start gap-3.5">
                                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-indigo-300"><Check className="h-[15px] w-[15px]" /></span>
                                        <div>
                                            <div className="text-[15px] font-bold leading-snug text-white">{point.title}</div>
                                            <div className="mt-0.5 text-[13.5px] leading-relaxed text-slate-400">{point.body}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <a href={config.show_changelog ? '#changelog' : primaryCtaUrl} className="lp-reveal mt-9 inline-flex h-12 items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-6 text-[15px] font-semibold text-white shadow-[0_10px_15px_-3px_rgba(99,102,241,0.30)] transition-all hover:-translate-y-px hover:from-indigo-700 hover:to-violet-700 hover:shadow-[0_10px_25px_-5px_rgba(99,102,241,0.40)]">
                                Explore AI updates
                                <ArrowRight className="h-4 w-4" />
                            </a>
                        </div>

                        {/* AI drafting card */}
                        <div className="lp-reveal">
                            <div className="rounded-2xl border border-white/[0.12] bg-white/[0.04] p-5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl">
                                <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-4">
                                    <div className="flex items-center gap-2.5">
                                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-white"><Sparkles className="h-4 w-4" /></span>
                                        <div>
                                            <div className="text-[13px] font-bold leading-tight text-white">Changelog assistant</div>
                                            <div className="font-mono text-[11px] text-slate-400">drafting v2.4.0</div>
                                        </div>
                                    </div>
                                    <span className={`${PILL} bg-violet-500/20 text-violet-300`}>Generating</span>
                                </div>
                                <div className="space-y-3 font-mono text-[12px]">
                                    <div className="flex items-start gap-2 text-slate-300"><span className="shrink-0 text-emerald-400">+</span><span>Summarized <b className="text-white">18 merged tasks</b> across Payments API</span></div>
                                    <div className="flex items-start gap-2 text-slate-300"><span className="shrink-0 text-emerald-400">+</span><span>Grouped <b className="text-white">9 resolved bugs</b> by severity</span></div>
                                    <div className="flex items-start gap-2 text-slate-300"><span className="shrink-0 text-emerald-400">+</span><span>Linked <b className="text-white">test run #482</b> — 96% pass rate</span></div>
                                </div>
                                <div className="mt-4 rounded-xl border border-white/[0.08] bg-slate-900/60 p-4">
                                    <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Draft preview</div>
                                    <p className="text-[13px] leading-relaxed text-slate-200"><b className="text-white">Payments API hardening.</b> This release closes 9 defects raised during regression and lifts test coverage to 96%. Resource utilization stabilized after rebalancing the QA pod.<span className="ml-0.5 inline-block h-[14px] w-[2px] animate-pulse bg-indigo-400 align-middle" /></p>
                                </div>
                                <div className="mt-4 flex items-center gap-2">
                                    <span className="flex h-10 flex-1 items-center justify-center rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-[14px] font-semibold text-white">Publish</span>
                                    <span className="flex h-10 flex-1 items-center justify-center rounded-lg border border-white/15 bg-white/[0.08] text-[14px] font-semibold text-slate-200">Edit draft</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ===================== FINAL CTA (dark) ===================== */}
            {config.show_footer_cta && (
                <section className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#312e81 0%,#4c1d95 55%,#1e1b4b 100%)' }}>
                    <div className="absolute inset-0 opacity-60" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
                    <div className="absolute -top-24 right-10 h-80 w-80 rounded-full blur-3xl" style={{ background: 'rgba(139,92,246,.35)' }} />
                    <div className="absolute -bottom-24 left-10 h-80 w-80 rounded-full blur-3xl" style={{ background: 'rgba(99,102,241,.30)' }} />
                    <div className="relative mx-auto w-full max-w-[1200px] px-8 py-28 text-center">
                        <h2 className="lp-reveal mx-auto max-w-3xl text-[38px] font-extrabold leading-[1.05] tracking-[-0.03em] text-white sm:text-[52px]">{config.footer_cta_title || 'Start managing quality with better visibility.'}</h2>
                        {config.footer_cta_description && (
                            <p className="lp-reveal mx-auto mt-5 max-w-xl text-[18px] leading-relaxed text-indigo-200">{config.footer_cta_description}</p>
                        )}
                        <div className="lp-reveal mt-9 flex flex-wrap items-center justify-center gap-3">
                            <a href={config.footer_cta_url || primaryCtaUrl} className="inline-flex h-12 items-center gap-2 rounded-lg bg-white px-6 text-[15px] font-semibold text-indigo-700 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.4)] transition-colors hover:bg-indigo-50">
                                {config.footer_cta_label || primaryCtaLabel}
                                <ArrowRight className="h-4 w-4" />
                            </a>
                            {config.show_roadmap && (
                                <a href="#roadmap" className="inline-flex h-12 items-center gap-2 rounded-lg border border-white/15 bg-white/[0.08] px-6 text-[15px] font-semibold text-slate-100 transition-colors hover:bg-white/[0.14]">View Roadmap</a>
                            )}
                        </div>
                    </div>
                </section>
            )}

            {/* ===================== FOOTER ===================== */}
            <footer id="about" className="scroll-mt-24 bg-slate-950 text-slate-400" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px)', backgroundSize: '28px 28px' }}>
                <div className="mx-auto w-full max-w-[1200px] px-8 py-16">
                    <div className="grid gap-10 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
                        <div>
                            <div className="mb-4 flex items-center gap-2.5">
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-[13px] font-extrabold text-white">QC</span>
                                <span className="text-[15px] font-bold text-white">QC-Manager</span>
                            </div>
                            <p className="max-w-xs text-[14px] leading-relaxed text-slate-400">One structured workspace for quality control — tasks, bugs, test cases, resources, reports and governance, with AI-assisted roadmap and changelog updates.</p>
                        </div>
                        <div>
                            <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Product</div>
                            <ul className="space-y-2.5 text-[14px]">
                                {config.show_features && <li><a href="#features" className="transition-colors hover:text-white">Features</a></li>}
                                <li><a href="#workflow" className="transition-colors hover:text-white">How it works</a></li>
                                {config.show_roadmap && <li><a href="#roadmap" className="transition-colors hover:text-white">Roadmap</a></li>}
                                {config.show_changelog && <li><a href="#changelog" className="transition-colors hover:text-white">Changelog</a></li>}
                            </ul>
                        </div>
                        <div>
                            <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Platform</div>
                            <ul className="space-y-2.5 text-[14px]">
                                <li><span className="text-slate-400">Tuleap integration</span></li>
                                <li><span className="text-slate-400">Governance</span></li>
                                <li><a href="#ai" className="transition-colors hover:text-white">AI assistant</a></li>
                                <li><span className="text-slate-400">Reports</span></li>
                            </ul>
                        </div>
                        <div>
                            <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Company</div>
                            <ul className="space-y-2.5 text-[14px]">
                                <li><a href="#about" className="transition-colors hover:text-white">About</a></li>
                                <li><a href="/login" className="transition-colors hover:text-white">Login</a></li>
                            </ul>
                        </div>
                    </div>
                    <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-800 pt-7 sm:flex-row">
                        <p className="text-[13px] text-slate-500">© {year} QC-Manager. All rights reserved.</p>
                        <div className="flex items-center gap-6 text-[13px] text-slate-500">
                            <span>Privacy</span>
                            <span>Terms</span>
                            <span>Status</span>
                        </div>
                    </div>
                </div>
            </footer>
        </main>
    );
}
