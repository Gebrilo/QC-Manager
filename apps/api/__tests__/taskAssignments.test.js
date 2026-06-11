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
    getTaskAssignmentSummary,
    sumActualHrs,
    totalActualHrs,
    primaryOf,
    firstSecondaryOf,
    orderAssignments,
    applyTuleapPrimary,
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

    it('returns null when the payload does not touch assignments', () => {
        expect(assignmentsFromPayload({ status: 'Done', task_name: 'x' })).toBeNull();
    });

    it('ignores legacy two-slot fields — only assignments[] is canonical', () => {
        const list = assignmentsFromPayload({
            resource1_uuid: 'rA', resource2_uuid: 'rB',
            r1_estimate_hrs: 10, r1_actual_hrs: 3, r2_estimate_hrs: 4, r2_actual_hrs: 0,
        });
        expect(list).toBeNull();
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

    // The Tuleap assigned_to bind expects the username (e.g. 'belal.z'), not the
    // display name. getTaskAssignments must surface tuleap_username so the emit
    // path can send it. Regression for: "Bind value 'Belal Abdalaziz' not found".
    it('selects the resource tuleap_username for outbound assignee mapping', async () => {
        const query = jest.fn().mockResolvedValueOnce({ rows: [] });
        await getTaskAssignments(query, 't1');
        expect(query.mock.calls[0][0]).toMatch(/tuleap_username/);
    });
});

describe('getTaskAssignmentSummary — outbound assignee mapping', () => {
    it('exposes the primary resource tuleap_username (not the display name) for Tuleap emit', async () => {
        const query = jest.fn().mockResolvedValueOnce({
            rows: [
                { resource_id: 'rB', assignment_type: 'PRIMARY', resource_name: 'Belal Abdalaziz', tuleap_username: 'belal.z', actual_hrs: 4, final_estimate: 3 },
                { resource_id: 'rH', assignment_type: 'SECONDARY', resource_name: 'Hany El-Taweel', tuleap_username: 'hany.t', actual_hrs: 2, final_estimate: null },
            ],
        });
        const summary = await getTaskAssignmentSummary(query, 't1');
        expect(summary.primary_tuleap_username).toBe('belal.z');
        expect(summary.primary_resource_name).toBe('Belal Abdalaziz');
        expect(summary.primary_resource_id).toBe('rB');
    });

    it('returns a null tuleap_username when the primary resource has no Tuleap mapping', async () => {
        const query = jest.fn().mockResolvedValueOnce({
            rows: [
                { resource_id: 'rX', assignment_type: 'PRIMARY', resource_name: 'No Tuleap', tuleap_username: null, actual_hrs: 0 },
            ],
        });
        const summary = await getTaskAssignmentSummary(query, 't1');
        expect(summary.primary_tuleap_username).toBeNull();
    });
});

describe('applyTuleapPrimary — inbound Tuleap assigned_to → PRIMARY', () => {
    // #199 / ADR 0009 §3. The first query is always the SELECT of the task's
    // current assignment rows; later calls are the demote/remove/promote/insert.
    const mkRow = (over) => ({ id: 'a-x', resource_id: 'rX', assignment_type: 'SECONDARY', actual_hrs: 0, ...over });
    const hasCall = (query, re, idArg) =>
        query.mock.calls.some(c => re.test(c[0]) && (idArg === undefined || (c[1] || [])[0] === idArg));

    it('no-ops (and issues no query) when there is no assigned resource', async () => {
        const query = jest.fn();
        const res = await applyTuleapPrimary({ query, taskId: 't1', resourceId: null });
        expect(res.action).toBe('noop');
        expect(query).not.toHaveBeenCalled();
    });

    it('inserts a fresh PRIMARY when the task has no assignments', async () => {
        const query = jest.fn().mockResolvedValueOnce({ rows: [] });
        const res = await applyTuleapPrimary({ query, taskId: 't1', resourceId: 'rW' });
        const insert = query.mock.calls.find(c => /INSERT INTO task_resource_assignment/.test(c[0]));
        expect(insert).toBeDefined();
        expect(insert[0]).toMatch(/'PRIMARY'/);
        expect(insert[1]).toEqual(['t1', 'rW']);
        expect(res.action).toBe('created');
    });

    it('does nothing when the resource is already the primary', async () => {
        const query = jest.fn().mockResolvedValueOnce({
            rows: [mkRow({ id: 'p', resource_id: 'rW', assignment_type: 'PRIMARY' })],
        });
        const res = await applyTuleapPrimary({ query, taskId: 't1', resourceId: 'rW' });
        expect(res.action).toBe('unchanged');
        expect(query).toHaveBeenCalledTimes(1); // only the SELECT
    });

    it('reassign Y→W: demotes Y to SECONDARY when Y logged effort, never deletes Y', async () => {
        const query = jest.fn().mockResolvedValueOnce({
            rows: [mkRow({ id: 'pY', resource_id: 'rY', assignment_type: 'PRIMARY', actual_hrs: 5 })],
        });
        const res = await applyTuleapPrimary({ query, taskId: 't1', resourceId: 'rW', demoteWhenEffort: true });
        expect(hasCall(query, /UPDATE task_resource_assignment SET assignment_type = 'SECONDARY'/, 'pY')).toBe(true);
        expect(hasCall(query, /DELETE/)).toBe(false);
        const insert = query.mock.calls.find(c => /INSERT INTO task_resource_assignment/.test(c[0]));
        expect(insert[1]).toEqual(['t1', 'rW']);
        expect(res.action).toBe('reassigned');
    });

    it('reassign Y→W: removes Y when it logged no effort', async () => {
        const query = jest.fn().mockResolvedValueOnce({
            rows: [mkRow({ id: 'pY', resource_id: 'rY', assignment_type: 'PRIMARY', actual_hrs: 0 })],
        });
        await applyTuleapPrimary({ query, taskId: 't1', resourceId: 'rW' });
        expect(hasCall(query, /DELETE FROM task_resource_assignment WHERE id = \$1/, 'pY')).toBe(true);
    });

    it('reassign Y→W: promotes W\'s existing SECONDARY instead of inserting a duplicate', async () => {
        const query = jest.fn().mockResolvedValueOnce({
            rows: [
                mkRow({ id: 'pY', resource_id: 'rY', assignment_type: 'PRIMARY', actual_hrs: 3 }),
                mkRow({ id: 'sW', resource_id: 'rW', assignment_type: 'SECONDARY', actual_hrs: 2 }),
            ],
        });
        await applyTuleapPrimary({ query, taskId: 't1', resourceId: 'rW' });
        expect(hasCall(query, /UPDATE task_resource_assignment SET assignment_type = 'PRIMARY'/, 'sW')).toBe(true);
        expect(hasCall(query, /INSERT/)).toBe(false);
    });

    it('removes Y even with effort when demote-on-reassign is disabled', async () => {
        const query = jest.fn().mockResolvedValueOnce({
            rows: [mkRow({ id: 'pY', resource_id: 'rY', assignment_type: 'PRIMARY', actual_hrs: 9 })],
        });
        await applyTuleapPrimary({ query, taskId: 't1', resourceId: 'rW', demoteWhenEffort: false });
        expect(hasCall(query, /DELETE/, 'pY')).toBe(true);
        expect(hasCall(query, /SET assignment_type = 'SECONDARY'/)).toBe(false);
    });

    it('leaves locally-managed secondaries (neither Y nor W) untouched', async () => {
        const query = jest.fn().mockResolvedValueOnce({
            rows: [
                mkRow({ id: 'pY', resource_id: 'rY', assignment_type: 'PRIMARY', actual_hrs: 1 }),
                mkRow({ id: 'sZ', resource_id: 'rZ', assignment_type: 'SECONDARY', actual_hrs: 4 }),
            ],
        });
        await applyTuleapPrimary({ query, taskId: 't1', resourceId: 'rW' });
        expect(query.mock.calls.some(c => (c[1] || []).includes('sZ'))).toBe(false);
    });
});
