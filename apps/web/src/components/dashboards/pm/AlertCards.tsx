export default function AlertCards({ blocked, overdue }: { blocked: number; overdue: number }) {
    return (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className={`rounded-xl p-4 ${blocked > 0 ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-300' : 'bg-slate-50 text-slate-700 dark:bg-slate-900/50 dark:text-slate-300'}`}>
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">Blocked tests</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">{blocked}</div>
            </div>
            <div className={`rounded-xl p-4 ${overdue > 0 ? 'bg-rose-50 text-rose-900 dark:bg-rose-950/30 dark:text-rose-300' : 'bg-slate-50 text-slate-700 dark:bg-slate-900/50 dark:text-slate-300'}`}>
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">Overdue tasks</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">{overdue}</div>
            </div>
        </div>
    );
}
