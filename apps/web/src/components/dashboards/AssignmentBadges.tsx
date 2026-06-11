import type { EstimateAccuracy } from '@/lib/api';

function cx(...parts: Array<string | false | null | undefined>) {
    return parts.filter(Boolean).join(' ');
}

export function formatHours(value: number | string | null | undefined) {
    const number = Number(value || 0);
    return `${number.toFixed(1)}h`;
}

export function AssignmentRoleBadge({ role }: { role?: string | null }) {
    const normalized = String(role || '').toLowerCase();
    const primary = normalized === 'primary' || normalized === 'owning';
    const label = normalized === 'owning'
        ? 'Owned'
        : normalized === 'supporting'
            ? 'Supporting'
            : primary
                ? 'Primary'
                : 'Secondary';
    return (
        <span
            className={cx(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                primary
                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                    : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
            )}
        >
            {label}
        </span>
    );
}

export function EstimateAccuracyBadge({ accuracy }: { accuracy?: EstimateAccuracy | null }) {
    if (!accuracy?.verdict) {
        return <span className="text-xs text-slate-400 dark:text-slate-500">—</span>;
    }

    const tone = accuracy.verdict === 'padded'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
        : accuracy.verdict === 'blew_past'
            ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
    const label = accuracy.verdict === 'padded'
        ? 'Padded'
        : accuracy.verdict === 'blew_past'
            ? 'Blew past'
            : 'Accurate';
    const ratio = accuracy.ratio === null || accuracy.ratio === undefined
        ? null
        : `${Math.round(accuracy.ratio * 100)}%`;

    return (
        <span
            className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', tone)}
            title={accuracy.label || undefined}
        >
            {label}
            {ratio && <span className="font-mono opacity-80">{ratio}</span>}
        </span>
    );
}
