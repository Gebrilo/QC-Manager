import {
    UserPlus,
    UserCheck,
    UserX,
    UserMinus,
    ShieldCheck,
    AlertTriangle,
    PartyPopper,
    Info,
    ListPlus,
    PencilLine,
    RefreshCw,
    Trash2,
    Bug,
    BookOpen,
    FlaskConical,
    Layers,
    PlayCircle,
    FolderKanban,
    Users,
    KeyRound,
    CheckCircle2,
    XCircle,
    Bell,
    type LucideIcon,
} from 'lucide-react';

/**
 * Notification type registry — one source of truth for the icon + colour
 * tint used to represent every notification type. Replaces the ad-hoc emoji
 * set: each type renders as a 1.75-stroke line icon inside a tinted chip,
 * grouped by domain (Task = indigo, Bug = rose, Sync = emerald/rose, …).
 */

export type TintKey =
    | 'indigo'
    | 'violet'
    | 'emerald'
    | 'sky'
    | 'rose'
    | 'amber'
    | 'blue'
    | 'teal'
    | 'slate';

export interface NotifTypeMeta {
    Icon: LucideIcon;
    tint: TintKey;
    label: string;
}

/** Chip styling (with ring) for the rounded icon badge. */
export const TINTS: Record<TintKey, string> = {
    indigo: 'bg-indigo-500/10 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 ring-indigo-500/20 dark:ring-indigo-500/25',
    violet: 'bg-violet-500/10 dark:bg-violet-500/15 text-violet-600 dark:text-violet-300 ring-violet-500/20 dark:ring-violet-500/25',
    emerald: 'bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 ring-emerald-500/20 dark:ring-emerald-500/25',
    sky: 'bg-sky-500/10 dark:bg-sky-500/15 text-sky-600 dark:text-sky-300 ring-sky-500/20 dark:ring-sky-500/25',
    rose: 'bg-rose-500/10 dark:bg-rose-500/15 text-rose-600 dark:text-rose-300 ring-rose-500/20 dark:ring-rose-500/25',
    amber: 'bg-amber-500/10 dark:bg-amber-500/15 text-amber-600 dark:text-amber-300 ring-amber-500/20 dark:ring-amber-500/25',
    blue: 'bg-blue-500/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300 ring-blue-500/20 dark:ring-blue-500/25',
    teal: 'bg-teal-500/10 dark:bg-teal-500/15 text-teal-600 dark:text-teal-300 ring-teal-500/20 dark:ring-teal-500/25',
    slate: 'bg-slate-500/10 dark:bg-slate-500/15 text-slate-600 dark:text-slate-300 ring-slate-500/20 dark:ring-slate-500/25',
};

/** Pill styling (no ring) for the uppercase type label next to a title. */
export const TINT_PILL: Record<TintKey, string> = {
    indigo: 'bg-indigo-500/10 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300',
    violet: 'bg-violet-500/10 dark:bg-violet-500/15 text-violet-600 dark:text-violet-300',
    emerald: 'bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
    sky: 'bg-sky-500/10 dark:bg-sky-500/15 text-sky-600 dark:text-sky-300',
    rose: 'bg-rose-500/10 dark:bg-rose-500/15 text-rose-600 dark:text-rose-300',
    amber: 'bg-amber-500/10 dark:bg-amber-500/15 text-amber-600 dark:text-amber-300',
    blue: 'bg-blue-500/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300',
    teal: 'bg-teal-500/10 dark:bg-teal-500/15 text-teal-600 dark:text-teal-300',
    slate: 'bg-slate-500/10 dark:bg-slate-500/15 text-slate-600 dark:text-slate-300',
};

const DEFAULT_TYPE: NotifTypeMeta = { Icon: Bell, tint: 'slate', label: 'Update' };

export const NOTIF_TYPES: Record<string, NotifTypeMeta> = {
    // ---- Generic ----
    info: { Icon: Info, tint: 'slate', label: 'Info' },
    success: { Icon: PartyPopper, tint: 'emerald', label: 'Success' },
    warning: { Icon: AlertTriangle, tint: 'amber', label: 'Alert' },

    // ---- Account / user lifecycle ----
    user_registered: { Icon: UserPlus, tint: 'blue', label: 'Account' },
    user_activated: { Icon: ShieldCheck, tint: 'emerald', label: 'Account' },
    user_deactivated: { Icon: UserX, tint: 'amber', label: 'Account' },
    user_deleted: { Icon: UserMinus, tint: 'rose', label: 'Account' },
    role_changed: { Icon: KeyRound, tint: 'violet', label: 'Role' },

    // ---- Tasks ----
    task_created: { Icon: ListPlus, tint: 'indigo', label: 'Task' },
    task_updated: { Icon: PencilLine, tint: 'slate', label: 'Task' },
    task_status_changed: { Icon: RefreshCw, tint: 'amber', label: 'Task' },
    task_assigned: { Icon: UserCheck, tint: 'indigo', label: 'Task' },
    task_deleted: { Icon: Trash2, tint: 'rose', label: 'Task' },

    // ---- Bugs ----
    bug_created: { Icon: Bug, tint: 'rose', label: 'Bug' },
    bug_updated: { Icon: Bug, tint: 'slate', label: 'Bug' },
    bug_status_changed: { Icon: RefreshCw, tint: 'amber', label: 'Bug' },
    bug_severity_changed: { Icon: AlertTriangle, tint: 'rose', label: 'Bug' },
    bug_reassigned: { Icon: UserCheck, tint: 'blue', label: 'Bug' },
    bug_deleted: { Icon: Trash2, tint: 'slate', label: 'Bug' },

    // ---- Stories ----
    story_created: { Icon: BookOpen, tint: 'indigo', label: 'Story' },
    story_updated: { Icon: BookOpen, tint: 'slate', label: 'Story' },
    story_status_changed: { Icon: RefreshCw, tint: 'amber', label: 'Story' },
    story_deleted: { Icon: Trash2, tint: 'slate', label: 'Story' },

    // ---- Test cases ----
    test_case_created: { Icon: FlaskConical, tint: 'indigo', label: 'Case' },
    test_case_updated: { Icon: FlaskConical, tint: 'slate', label: 'Case' },
    test_case_status_changed: { Icon: RefreshCw, tint: 'amber', label: 'Case' },
    test_case_deleted: { Icon: Trash2, tint: 'slate', label: 'Case' },

    // ---- Test suites ----
    test_suite_created: { Icon: Layers, tint: 'indigo', label: 'Suite' },
    test_suite_updated: { Icon: Layers, tint: 'slate', label: 'Suite' },
    test_suite_status_changed: { Icon: RefreshCw, tint: 'amber', label: 'Suite' },
    test_suite_deleted: { Icon: Trash2, tint: 'slate', label: 'Suite' },

    // ---- Test runs ----
    test_execution_created: { Icon: PlayCircle, tint: 'emerald', label: 'Run' },
    test_execution_updated: { Icon: PlayCircle, tint: 'slate', label: 'Run' },
    test_execution_status_changed: { Icon: RefreshCw, tint: 'amber', label: 'Run' },
    test_execution_deleted: { Icon: Trash2, tint: 'slate', label: 'Run' },

    // ---- Projects ----
    project_created: { Icon: FolderKanban, tint: 'indigo', label: 'Project' },
    project_updated: { Icon: FolderKanban, tint: 'slate', label: 'Project' },
    project_status_changed: { Icon: RefreshCw, tint: 'amber', label: 'Project' },
    project_deleted: { Icon: Trash2, tint: 'slate', label: 'Project' },

    // ---- Resources ----
    resource_created: { Icon: Users, tint: 'indigo', label: 'Resource' },
    resource_updated: { Icon: Users, tint: 'slate', label: 'Resource' },
    resource_deleted: { Icon: Trash2, tint: 'slate', label: 'Resource' },

    // ---- Teams ----
    team_created: { Icon: Users, tint: 'teal', label: 'Team' },
    team_updated: { Icon: Users, tint: 'slate', label: 'Team' },
    team_deleted: { Icon: Trash2, tint: 'slate', label: 'Team' },

    // ---- Tuleap sync ----
    tuleap_sync_succeeded: { Icon: CheckCircle2, tint: 'emerald', label: 'Sync' },
    tuleap_sync_failed: { Icon: XCircle, tint: 'rose', label: 'Sync' },
};

export function getNotifType(type: string): NotifTypeMeta {
    return NOTIF_TYPES[type] || DEFAULT_TYPE;
}

/**
 * Tinted rounded chip housing a notification type's line icon.
 * `sm` is used in the bell dropdown, `md` on the full notifications page.
 */
export function NotifTypeIcon({ type, size = 'md' }: { type: string; size?: 'sm' | 'md' }) {
    const meta = getNotifType(type);
    const Icon = meta.Icon;
    const dim = size === 'sm' ? 'h-9 w-9' : 'h-11 w-11';
    const iconSize = size === 'sm' ? 16 : 19;
    return (
        <div
            className={`flex-shrink-0 rounded-xl flex items-center justify-center ring-1 ${dim} ${TINTS[meta.tint]}`}
        >
            <Icon size={iconSize} strokeWidth={1.75} />
        </div>
    );
}
