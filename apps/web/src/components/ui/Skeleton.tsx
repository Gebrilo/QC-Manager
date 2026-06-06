export function Skeleton({ className = '' }: { className?: string }) {
    return <div className={`animate-pulse rounded-md bg-slate-200/60 dark:bg-slate-700/40 ${className}`} />;
}
