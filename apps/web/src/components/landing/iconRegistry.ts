import {
    BarChart3,
    Bug,
    ClipboardList,
    FileText,
    Gauge,
    GitBranch,
    type LucideIcon,
    Map,
    ShieldCheck,
    Sparkles,
    TestTube2,
    Users2,
    Workflow,
} from 'lucide-react';

export const FEATURE_ICON_REGISTRY = {
    'bar-chart': { Icon: BarChart3, label: 'Chart' },
    bug: { Icon: Bug, label: 'Bug' },
    'clipboard-list': { Icon: ClipboardList, label: 'Clipboard' },
    file: { Icon: FileText, label: 'File' },
    gauge: { Icon: Gauge, label: 'Gauge' },
    git: { Icon: GitBranch, label: 'Git' },
    map: { Icon: Map, label: 'Map' },
    shield: { Icon: ShieldCheck, label: 'Shield' },
    sparkles: { Icon: Sparkles, label: 'Sparkles' },
    'test-tube': { Icon: TestTube2, label: 'Test Tube' },
    users: { Icon: Users2, label: 'Users' },
    workflow: { Icon: Workflow, label: 'Workflow' },
} as const satisfies Record<string, { Icon: LucideIcon; label: string }>;

export type FeatureIconKey = keyof typeof FEATURE_ICON_REGISTRY;

export const FEATURE_ICON_OPTIONS: Array<{ value: FeatureIconKey; label: string }> = (
    Object.keys(FEATURE_ICON_REGISTRY) as FeatureIconKey[]
).map(key => ({ value: key, label: FEATURE_ICON_REGISTRY[key].label }));

export function getFeatureIcon(key: string | null | undefined): LucideIcon {
    return FEATURE_ICON_REGISTRY[(key || '') as FeatureIconKey]?.Icon ?? ShieldCheck;
}
