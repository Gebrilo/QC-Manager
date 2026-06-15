import { taskStatusRegistry } from '@/lib/statusRegistry';

interface TaskStatusBadgeProps {
    status: string;
}

export function TaskStatusBadge({ status }: TaskStatusBadgeProps) {
    const option = taskStatusRegistry.getOption(status);

    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap ${option.pillClass}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${option.dotClass}`} aria-hidden />
            {option.label}
        </span>
    );
}
