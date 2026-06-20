import { describe, expect, it } from 'vitest';
import { getTaskTimeRemainingState } from './taskTimeRemaining';

const today = new Date(Date.UTC(2026, 5, 20));

describe('getTaskTimeRemainingState', () => {
    it('returns a battery-style percentage for future deadlines', () => {
        const result = getTaskTimeRemainingState({
            deadline: '2026-06-30',
            expected_start_date: '2026-06-10',
            actual_start_date: '2026-06-12',
            created_at: '2026-06-01T10:00:00Z',
        }, today);

        expect(result).toMatchObject({
            percentage: 50,
            label: '50% remaining',
            tone: 'amber',
        });
    });

    it('uses the actual start date when expected start is missing', () => {
        const result = getTaskTimeRemainingState({
            deadline: '2026-07-10',
            actual_start_date: '2026-06-10',
            created_at: '2026-06-01',
        }, today);

        expect(result).toMatchObject({
            percentage: 67,
            label: '67% remaining',
            tone: 'green',
        });
    });

    it('shows due today as amber and not overdue', () => {
        const result = getTaskTimeRemainingState({
            deadline: '2026-06-20T23:59:59Z',
            expected_start_date: '2026-06-10',
        }, today);

        expect(result).toMatchObject({
            percentage: 0,
            label: 'Due today',
            tone: 'amber',
        });
    });

    it('shows overdue as a full red bar', () => {
        const result = getTaskTimeRemainingState({
            deadline: '2026-06-19',
            expected_start_date: '2026-06-10',
        }, today);

        expect(result).toMatchObject({
            percentage: 100,
            label: 'Overdue',
            tone: 'red',
        });
    });

    it('shows a neutral empty state when the deadline is missing', () => {
        const result = getTaskTimeRemainingState({
            expected_start_date: '2026-06-10',
        }, today);

        expect(result).toMatchObject({
            percentage: null,
            label: 'No due date set',
            tone: 'neutral',
        });
    });

    it('shows a neutral empty state when the deadline is invalid', () => {
        const result = getTaskTimeRemainingState({
            deadline: '2026-02-31',
            expected_start_date: '2026-06-10',
        }, today);

        expect(result).toMatchObject({
            percentage: null,
            label: 'No due date set',
            tone: 'neutral',
        });
    });

    it('treats inverted future windows as fully remaining', () => {
        const result = getTaskTimeRemainingState({
            deadline: '2026-06-30',
            expected_start_date: '2026-07-01',
        }, today);

        expect(result).toMatchObject({
            percentage: 100,
            label: '100% remaining',
            tone: 'green',
        });
    });

    it('uses created_at when no start dates are present', () => {
        const result = getTaskTimeRemainingState({
            deadline: '2026-06-30',
            created_at: '2026-06-15T18:30:00Z',
        }, today);

        expect(result).toMatchObject({
            percentage: 67,
            label: '67% remaining',
            tone: 'green',
        });
    });

    it('shows completed without a late note when completed before the deadline', () => {
        const result = getTaskTimeRemainingState({
            status: 'Done',
            deadline: '2026-06-30',
            completed_date: '2026-06-29',
        }, today);

        expect(result).toMatchObject({
            percentage: 100,
            label: 'Completed',
            tone: 'green',
        });
        expect(result.note).toBeUndefined();
    });

    it('shows completed without a late note when completed on the deadline', () => {
        const result = getTaskTimeRemainingState({
            status: 'Done',
            deadline: '2026-06-30',
            completed_date: '2026-06-30T23:59:59Z',
        }, today);

        expect(result).toMatchObject({
            percentage: 100,
            label: 'Completed',
            tone: 'green',
        });
        expect(result.note).toBeUndefined();
    });

    it('shows a neutral late note when completed after the deadline', () => {
        const result = getTaskTimeRemainingState({
            status: 'Done',
            deadline: '2026-06-30',
            completed_date: '2026-07-03',
        }, today);

        expect(result).toMatchObject({
            percentage: 100,
            label: 'Completed',
            note: 'completed 3 days late',
            tone: 'green',
        });
    });

    it('uses completed_at as the fallback completion date for done tasks', () => {
        const result = getTaskTimeRemainingState({
            status: 'Done',
            deadline: '2026-06-30',
            completed_at: '2026-07-01',
        }, today);

        expect(result).toMatchObject({
            percentage: 100,
            label: 'Completed',
            note: 'completed 1 day late',
            tone: 'green',
        });
    });

    it('shows completed without a late note when completion date is missing', () => {
        const result = getTaskTimeRemainingState({
            status: 'Done',
            deadline: '2026-06-19',
        }, today);

        expect(result).toMatchObject({
            percentage: 100,
            label: 'Completed',
            tone: 'green',
        });
        expect(result.note).toBeUndefined();
    });
});
