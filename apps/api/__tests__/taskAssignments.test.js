'use strict';

// ADR 0009 — unit + query-interaction tests for the task assignment write service.
// External behavior only: the canonical list produced from a payload, the
// assignment rules (one primary, no duplicate/self), and the SQL the service
// emits when replacing/reading assignments. Prior art: bugNormalizer.test.js
// (pure logic) and the mock-query style in tasks.access.test.js.

const {
    AssignmentValidationError,
    assignmentsFromPayload,
    validateAssignments,
    replaceTaskAssignments,
    getTaskAssignments,
    sumActualHrs,
    totalActualHrs,
    primaryOf,
    firstSecondaryOf,
    orderAssignments,
} = require('../src/services/assignments/taskAssignments');

describe('assignmentsFromPayload', () => {
    it('uses the explicit assignments array when present', () => {
        const list = assignmentsFromPayload({
            assignments: [
                { resource_id: 'ry', assignment_type: 'PRIMARY', estimate_hrs: 16, actual_hrs: 8 },
                { resource_id: 'rz', assignment_type: 'SECONDARY', estimate_hrs: 8, actual_hrs: 16 },
            ],
        });
        expect(list).toHaveLength(2);
        expect(primaryOf(list).resource_id).toBe('ry');
        expect(firstSecondaryOf(list).resource_id).toBe('rz');
        expect(totalActualHrs(list)).toBe(24);
    });

    it('derives a primary + secondary from the legacy two-slot fields', () => {
        const list = assignmentsFromPayload({
            resource1_uuid: 'rA', resource2_uuid: 'rB',
            r1_estimate_hrs: 10, r1_actual_hrs: 3, r2_estimate_hrs: 4, r2_actual_hrs: 0,
        });
        expect(list.map(a => [a.assignment_type, a.resource_id, a.estimate_hrs, a.actual_hrs])).toEqual([
            ['PRIMARY', 'rA', 10, 3],
            ['SECONDARY', 'rB', 4, 0],
        ]);
    });

    it('returns null when the payload does not touch assignments', () => {
        expect(assignmentsFromPayload({ status: 'Done', task_name: 'x' })).toBeNull();
    });

    it('merges legacy slots onto the original row (fallbackTo) for partial patches', () => {
        // patch only logs primary hours; secondary slot preserved from original
        const list = assignmentsFromPayload(
            { r1_actual_hrs: 5 },
            { fallbackTo: { resource1_id: 'rA', resource2_id: 'rB', r1_estimate_hrs: 10, r2_estimate_hrs: 4, r2_actual_hrs: 1 } }
        );
        expect(list).toEqual([
            expect.objectContaining({ assignment_type: 'PRIMARY', resource_id: 'rA', estimate_hrs: 10, actual_hrs: 5 }),
            expect.objectContaining({ assignment_type: 'SECONDARY', resource_id: 'rB', estimate_hrs: 4, actual_hrs: 1 }),
        ]);
    });

    it('drops the secondary slot when the patch clears resource2_uuid', () => {
        const list = assignmentsFromPayload(
            { resource2_uuid: null },
            { fallbackTo: { resource1_id: 'rA', resource2_id: 'rB' } }
        );
        expect(list).toEqual([expect.objectContaining({ assignment_type: 'PRIMARY', resource_id: 'rA' })]);
    });
});

describe('validateAssignments', () => {
    const mk = (over) => ({ resource_id: 'r', assignment_type: 'PRIMARY', estimate_hrs: 0, actual_hrs: 0, ...over });

    it('allows an empty list (unassigned task)', () => {
        expect(validateAssignments([])).toEqual([]);
    });

    it('accepts one primary + multiple secondaries', () => {
        const list = [
            mk({ resource_id: 'p', assignment_type: 'PRIMARY' }),
            mk({ resource_id: 's1', assignment_type: 'SECONDARY' }),
            mk({ resource_id: 's2', assignment_type: 'SECONDARY' }),
        ];
        expect(validateAssignments(list)).toBe(list);
    });

    it('rejects a set with no primary (400)', () => {
        expect(() => validateAssignments([mk({ resource_id: 's', assignment_type: 'SECONDARY' })]))
            .toThrow(AssignmentValidationError);
        try { validateAssignments([mk({ assignment_type: 'SECONDARY' })]); } catch (e) { expect(e.statusCode).toBe(400); }
    });

    it('rejects more than one primary (400)', () => {
        expect(() => validateAssignments([
            mk({ resource_id: 'a', assignment_type: 'PRIMARY' }),
            mk({ resource_id: 'b', assignment_type: 'PRIMARY' }),
        ])).toThrow(/only one primary/i);
    });

    it('rejects the same resource twice — primary and secondary (400)', () => {
        expect(() => validateAssignments([
            mk({ resource_id: 'x', assignment_type: 'PRIMARY' }),
            mk({ resource_id: 'x', assignment_type: 'SECONDARY' }),
        ])).toThrow(/more than once/i);
    });

    it('rejects negative effort (400)', () => {
        expect(() => validateAssignments([mk({ resource_id: 'p', assignment_type: 'PRIMARY', actual_hrs: -1 })]))
            .toThrow(/negative/i);
    });
});

describe('orderAssignments', () => {
    it('places the primary first, secondaries in input order', () => {
        const out = orderAssignments([
            { resource_id: 's1', assignment_type: 'SECONDARY' },
            { resource_id: 'p', assignment_type: 'PRIMARY' },
            { resource_id: 's2', assignment_type: 'SECONDARY' },
        ]);
        expect(out.map(a => a.resource_id)).toEqual(['p', 's1', 's2']);
    });
});

describe('replaceTaskAssignments', () => {
    it('validates before mutating — a bad set never issues a DELETE', async () => {
        const query = jest.fn();
        await expect(replaceTaskAssignments({
            query, taskId: 't1',
            assignments: [{ resource_id: 'a', assignment_type: 'SECONDARY', estimate_hrs: 0, actual_hrs: 0 }],
        })).rejects.toThrow(AssignmentValidationError);
        expect(query).not.toHaveBeenCalled();
    });

    it('deletes existing rows then inserts the ordered set', async () => {
        const query = jest.fn()
            .mockResolvedValueOnce({ rows: [] })                       // DELETE
            .mockResolvedValueOnce({ rows: [{ id: 'a1' }] })           // INSERT primary
            .mockResolvedValueOnce({ rows: [{ id: 'a2' }] });          // INSERT secondary
        const inserted = await replaceTaskAssignments({
            query, taskId: 't1',
            assignments: [
                { resource_id: 'rz', assignment_type: 'SECONDARY', estimate_hrs: 8, actual_hrs: 16 },
                { resource_id: 'ry', assignment_type: 'PRIMARY', estimate_hrs: 16, actual_hrs: 8 },
            ],
        });
        expect(inserted).toHaveLength(2);
        const [del, insP, insS] = query.mock.calls;
        expect(del[0]).toMatch(/DELETE FROM task_resource_assignment WHERE task_id = \$1/);
        expect(del[1]).toEqual(['t1']);
        // primary inserted first (ordered), with its resource + type
        expect(insP[0]).toMatch(/INSERT INTO task_resource_assignment/);
        expect(insP[1].slice(0, 3)).toEqual(['t1', 'ry', 'PRIMARY']);
        expect(insS[1].slice(0, 3)).toEqual(['t1', 'rz', 'SECONDARY']);
        // created_at is strictly increasing so the first secondary is the earliest
        const primaryCreatedAt = new Date(insP[1][10]).getTime();
        const secondaryCreatedAt = new Date(insS[1][10]).getTime();
        expect(secondaryCreatedAt).toBeGreaterThan(primaryCreatedAt);
    });
});

describe('sumActualHrs / getTaskAssignments', () => {
    it('sums actual_hrs across the task', async () => {
        const query = jest.fn().mockResolvedValueOnce({ rows: [{ total: 24 }] });
        await expect(sumActualHrs(query, 't1')).resolves.toBe(24);
        expect(query.mock.calls[0][0]).toMatch(/SUM\(actual_hrs\)/);
        expect(query.mock.calls[0][1]).toEqual(['t1']);
    });

    it('reads assignments primary-first joined to resource names', async () => {
        const query = jest.fn().mockResolvedValueOnce({ rows: [{ id: 'a1', assignment_type: 'PRIMARY' }] });
        await getTaskAssignments(query, 't1');
        expect(query.mock.calls[0][0]).toMatch(/JOIN resources res/);
        expect(query.mock.calls[0][0]).toMatch(/assignment_type = 'PRIMARY'\) DESC/);
        expect(query.mock.calls[0][1]).toEqual(['t1']);
    });
});
