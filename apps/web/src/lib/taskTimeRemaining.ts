import type { Task } from '@/types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type TaskTimeRemainingTone = 'green' | 'amber' | 'orange' | 'red' | 'neutral';

export interface TaskTimeRemainingState {
    percentage: number | null;
    label: string;
    note?: string;
    tone: TaskTimeRemainingTone;
    barClassName: string;
    textClassName: string;
}

type TaskTimeRemainingInput = Pick<
    Task,
    'deadline' | 'expected_start_date' | 'actual_start_date' | 'completed_date' | 'created_at'
> & {
    status?: Task['status'] | string;
    completed_at?: string | null;
};

const TONE_CLASSES: Record<TaskTimeRemainingTone, Pick<TaskTimeRemainingState, 'barClassName' | 'textClassName'>> = {
    green: {
        barClassName: 'bg-emerald-500',
        textClassName: 'text-emerald-600 dark:text-emerald-400',
    },
    amber: {
        barClassName: 'bg-amber-500',
        textClassName: 'text-amber-600 dark:text-amber-400',
    },
    orange: {
        barClassName: 'bg-orange-500',
        textClassName: 'text-orange-600 dark:text-orange-400',
    },
    red: {
        barClassName: 'bg-rose-600',
        textClassName: 'text-rose-600 dark:text-rose-400',
    },
    neutral: {
        barClassName: 'bg-slate-300 dark:bg-slate-600',
        textClassName: 'text-slate-400',
    },
};

function state(
    percentage: number | null,
    label: string,
    tone: TaskTimeRemainingTone,
    note?: string,
): TaskTimeRemainingState {
    return {
        percentage,
        label,
        ...(note ? { note } : {}),
        tone,
        ...TONE_CLASSES[tone],
    };
}

function parseCalendarDay(value?: string | Date | null): number | null {
    if (!value) return null;

    if (value instanceof Date) {
        const time = value.getTime();
        if (Number.isNaN(time)) return null;
        return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()) / MS_PER_DAY;
    }

    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (dateOnly) {
        const [, year, month, day] = dateOnly;
        const utc = Date.UTC(Number(year), Number(month) - 1, Number(day));
        if (Number.isNaN(utc)) return null;
        const parsed = new Date(utc);
        if (
            parsed.getUTCFullYear() !== Number(year) ||
            parsed.getUTCMonth() !== Number(month) - 1 ||
            parsed.getUTCDate() !== Number(day)
        ) {
            return null;
        }
        return utc / MS_PER_DAY;
    }

    const parsed = new Date(value);
    return parseCalendarDay(parsed);
}

function clampPercentage(value: number): number {
    return Math.min(100, Math.max(0, value));
}

function getToneForRemaining(percentage: number): TaskTimeRemainingTone {
    if (percentage > 50) return 'green';
    if (percentage >= 20) return 'amber';
    return 'orange';
}

export function getTaskTimeRemainingState(
    task: TaskTimeRemainingInput,
    today: Date = new Date(),
): TaskTimeRemainingState {
    const deadlineDay = parseCalendarDay(task.deadline);

    if (task.status === 'Done') {
        const completedDay = parseCalendarDay(task.completed_date ?? task.completed_at);
        const daysLate = completedDay !== null && deadlineDay !== null ? completedDay - deadlineDay : 0;
        const note = daysLate > 0 ? `completed ${daysLate} ${daysLate === 1 ? 'day' : 'days'} late` : undefined;

        return state(100, 'Completed', 'green', note);
    }

    if (deadlineDay === null) {
        return state(null, 'No due date set', 'neutral');
    }

    const todayDay = parseCalendarDay(today);
    if (todayDay === null) {
        return state(null, 'No due date set', 'neutral');
    }

    if (todayDay > deadlineDay) {
        return state(100, 'Overdue', 'red');
    }

    if (todayDay === deadlineDay) {
        return state(0, 'Due today', 'amber');
    }

    const startDay =
        parseCalendarDay(task.expected_start_date) ??
        parseCalendarDay(task.actual_start_date) ??
        parseCalendarDay(task.created_at);

    if (startDay === null || startDay >= deadlineDay) {
        return state(100, '100% remaining', 'green');
    }

    const percentage = clampPercentage(Math.round(((deadlineDay - todayDay) / (deadlineDay - startDay)) * 100));
    return state(percentage, `${percentage}% remaining`, getToneForRemaining(percentage));
}
