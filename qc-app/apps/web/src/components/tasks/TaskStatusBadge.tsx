import { Badge } from '@/components/ui/Badge';

interface TaskStatusBadgeProps {
    status: string;
}

export function TaskStatusBadge({ status }: TaskStatusBadgeProps) {
    let variant: 'default' | 'complete' | 'inprogress' | 'cancelled' | 'backlog' | 'ontrack' | 'atrisk' | 'notasks' = 'default';

    // Normalize: in_progress -> In Progress, pending -> Pending, etc.
    const normalizedStatus = status ? status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Unknown';

    switch (normalizedStatus) {
        case 'Done':
        case 'Completed':
            variant = 'complete';
            break;
        case 'In Progress':
        case 'Running':
            variant = 'inprogress';
            break;
        case 'Cancelled':
        case 'Failed':
            variant = 'cancelled';
            break;
        case 'Backlog':
        case 'Pending':
        case 'Todo':
            variant = 'backlog';
            break;
        default:
            variant = 'default';
    }

    return <Badge variant={variant}>{normalizedStatus}</Badge>;
}
