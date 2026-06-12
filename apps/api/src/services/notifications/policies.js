'use strict';

// Task fields whose change is worth a notification. NOTE: the column is
// `estimate_days` (not `estimate`), and assignee changes live in the
// task_resource_assignment junction (handled separately via dispatchTaskAssignment).
const TASK_SIGNIFICANT_FIELDS = ['status', 'estimate_days', 'completed_date'];

// Bug fields whose change is worth a notification. The bug is a flat record
// (no junction for assignment), so assignee/severity/status are all just
// columns on the bug row. `assigned_to` is a text field (Tuleap username)
// and is matched against resources.resource_name to resolve the user.
const BUG_SIGNIFICANT_FIELDS = ['status', 'severity', 'assigned_to'];

// User-story fields whose change is worth a notification. Stories are a flat
// record with no junction and no `assigned_to` text field — status is the
// only column on the story row that meaningfully changes ownership/attention.
const STORY_SIGNIFICANT_FIELDS = ['status'];

// Test-case fields whose change is worth a notification. The test_case row
// is flat (no junction for assignment), and `title` is the displayed label
// (the human-meaningful "name" of the case — the route URL uses the id).
const TEST_CASE_SIGNIFICANT_FIELDS = ['status', 'title'];

// Test-suite fields whose change is worth a notification. Suites have a
// `name` column (not `title`) — that's the only "what is this?" surface
// the user sees, so a rename is worth a notification alongside status.
const TEST_SUITE_SIGNIFICANT_FIELDS = ['status', 'name'];

// Test-execution fields whose change is worth a notification. The status
// column is the ENUM (pass/fail/not_run/blocked/skipped) — the only
// field on the execution row that meaningfully changes ownership/attention.
const TEST_EXECUTION_SIGNIFICANT_FIELDS = ['status'];

// Project fields whose change is worth a notification. Projects are
// non-artifact entities (no junction for assignment, no access engine
// coverage) — the only ownership surface is status, which drives who
// pays attention to the project. Other field edits (description, dates)
// are not significant on their own.
const PROJECT_SIGNIFICANT_FIELDS = ['status'];

// Resource fields whose change is worth a notification. The capacity /
// active flag drive who is "available" — both are the only meaningful
// attention surfaces on a resource row.
const RESOURCE_SIGNIFICANT_FIELDS = ['is_active', 'weekly_capacity_hrs'];

// Team fields whose change is worth a notification. Teams have no `is_active`
// column (they use a `deleted_at` soft-delete instead) — the only meaningful
// surfaces are the team name and the assigned manager.
const TEAM_SIGNIFICANT_FIELDS = ['name', 'manager_id'];

// Role fields whose change is worth a notification. This is keyed to the
// `role` column on app_user (a user being assigned a new role) — it lives
// on a users PATCH, so the policy is wired up with `auditTriggers: ['users']`
// and fires when `role` is in the changed fields. The `role` value itself
// is the only thing that changes ownership/attention.
const ROLE_SIGNIFICANT_FIELDS = ['role'];

// recipients: returns an array of app_user ids related to the task.
// The acting user is removed later by the dispatcher.
async function taskRecipients({ entityId, after, db }) {
    const row = after || {};
    const out = [];

    if (row.created_by_user_id) out.push(row.created_by_user_id);

    const assignees = await db.query(
        `SELECT r.user_id
           FROM task_resource_assignment tra
           JOIN resources r ON r.id = tra.resource_id
          WHERE tra.task_id = $1 AND r.user_id IS NOT NULL AND r.deleted_at IS NULL`,
        [entityId]
    );
    for (const a of assignees.rows) out.push(a.user_id);

    if (row.project_id) {
        const pms = await db.query(
            'SELECT user_id FROM project_managers WHERE project_id = $1',
            [row.project_id]
        );
        for (const p of pms.rows) out.push(p.user_id);
    }

    return out;
}

function taskRender({ action, before, after, changedFields }) {
    const name = (after && after.task_name) || (before && before.task_name) || 'a task';
    if (action === 'CREATE') {
        return { type: 'task_created', title: 'New task created', message: `Task "${name}" was created.` };
    }
    if (action === 'DELETE') {
        return { type: 'task_deleted', title: 'Task deleted', message: `Task "${name}" was deleted.` };
    }
    const changed = (changedFields || []).filter(f => TASK_SIGNIFICANT_FIELDS.includes(f));
    if (changed.includes('status')) {
        return {
            type: 'task_status_changed',
            title: 'Task status changed',
            message: `Task "${name}" is now ${after && after.status}.`,
        };
    }
    return {
        type: 'task_updated',
        title: 'Task updated',
        message: `Task "${name}" was updated (${changed.join(', ') || 'changes'}).`,
    };
}

// Bug recipients:
//   - reporter (immutable, stored as created_by_user_id on the bug row)
//   - current assignee: matched by `assigned_to` text → resources.resource_name
//   - project PMs
//   - all active team_managers, but ONLY when severity changed TO "Critical Impact"
// `changedFields` is provided by the dispatcher; the Critical rule is the
// only place it's inspected by a recipient function (tasks filter via
// significantFields in the dispatcher instead).
async function bugRecipients({ entityId, after, before, changedFields, db }) {
    const row = after || before || {};
    const out = [];

    if (row.created_by_user_id) out.push(row.created_by_user_id);

    if (row.assigned_to) {
        const a = await db.query(
            `SELECT user_id
               FROM resources
              WHERE resource_name = $1
                AND user_id IS NOT NULL
                AND deleted_at IS NULL
              LIMIT 1`,
            [row.assigned_to]
        );
        if (a.rows[0] && a.rows[0].user_id) out.push(a.rows[0].user_id);
    }

    if (row.project_id) {
        const pms = await db.query(
            'SELECT user_id FROM project_managers WHERE project_id = $1',
            [row.project_id]
        );
        for (const p of pms.rows) out.push(p.user_id);
    }

    const severityChangedToCritical =
        Array.isArray(changedFields) &&
        changedFields.includes('severity') &&
        row.severity === 'Critical Impact';
    if (severityChangedToCritical) {
        const tms = await db.query(
            `SELECT id FROM app_user WHERE role = 'team_manager' AND active = true`
        );
        for (const t of tms.rows) out.push(t.id);
    }

    return out;
}

function bugRender({ action, before, after, changedFields }) {
    const name = (after && after.title) || (before && before.title) || 'a bug';
    if (action === 'CREATE') {
        return { type: 'bug_created', title: 'New bug reported', message: `Bug "${name}" was reported.` };
    }
    if (action === 'DELETE') {
        return { type: 'bug_deleted', title: 'Bug deleted', message: `Bug "${name}" was deleted.` };
    }
    const changed = (changedFields || []).filter(f => BUG_SIGNIFICANT_FIELDS.includes(f));
    if (changed.includes('status')) {
        return {
            type: 'bug_status_changed',
            title: 'Bug status changed',
            message: `Bug "${name}" is now ${after && after.status}.`,
        };
    }
    if (changed.includes('severity')) {
        return {
            type: 'bug_severity_changed',
            title: 'Bug severity changed',
            message: `Bug "${name}" severity changed to ${after && after.severity}.`,
        };
    }
    if (changed.includes('assigned_to')) {
        return {
            type: 'bug_reassigned',
            title: 'Bug reassigned',
            message: `Bug "${name}" was reassigned.`,
        };
    }
    return {
        type: 'bug_updated',
        title: 'Bug updated',
        message: `Bug "${name}" was updated.`,
    };
}

// User-story recipients:
//   - story creator (created_by_user_id)
//   - project PMs
// Stories have no `assigned_to` text field, so there is no assignee lookup.
// Dedup + actor exclusion is handled by the dispatcher.
async function storyRecipients({ entityId, after, before, db }) {
    const row = after || before || {};
    const out = [];

    if (row.created_by_user_id) out.push(row.created_by_user_id);

    if (row.project_id) {
        const pms = await db.query(
            'SELECT user_id FROM project_managers WHERE project_id = $1',
            [row.project_id]
        );
        for (const p of pms.rows) out.push(p.user_id);
    }

    return out;
}

function storyRender({ action, before, after, changedFields }) {
    const name = (after && after.title) || (before && before.title) || 'a user story';
    if (action === 'CREATE') {
        return { type: 'story_created', title: 'New user story created', message: `Story "${name}" was created.` };
    }
    if (action === 'DELETE') {
        return { type: 'story_deleted', title: 'User story deleted', message: `Story "${name}" was deleted.` };
    }
    const changed = (changedFields || []).filter(f => STORY_SIGNIFICANT_FIELDS.includes(f));
    if (changed.includes('status')) {
        return {
            type: 'story_status_changed',
            title: 'Story status changed',
            message: `Story "${name}" is now ${after && after.status}.`,
        };
    }
    return {
        type: 'story_updated',
        title: 'Story updated',
        message: `Story "${name}" was updated.`,
    };
}

// Test-case recipients:
//   - creator (created_by_user_id on the test_case row)
//   - project PMs
// test_case has no `assigned_to` text field, so no assignee lookup.
async function testCaseRecipients({ entityId, after, before, db }) {
    const row = after || before || {};
    const out = [];

    if (row.created_by_user_id) out.push(row.created_by_user_id);

    if (row.project_id) {
        const pms = await db.query(
            'SELECT user_id FROM project_managers WHERE project_id = $1',
            [row.project_id]
        );
        for (const p of pms.rows) out.push(p.user_id);
    }

    return out;
}

function testCaseRender({ action, before, after, changedFields }) {
    const name = (after && after.title) || (before && before.title) || 'a test case';
    if (action === 'CREATE') {
        return { type: 'test_case_created', title: 'New test case created', message: `Test case "${name}" was created.` };
    }
    if (action === 'DELETE') {
        return { type: 'test_case_deleted', title: 'Test case deleted', message: `Test case "${name}" was deleted.` };
    }
    const changed = (changedFields || []).filter(f => TEST_CASE_SIGNIFICANT_FIELDS.includes(f));
    if (changed.includes('status')) {
        return {
            type: 'test_case_status_changed',
            title: 'Test case status changed',
            message: `Test case "${name}" is now ${after && after.status}.`,
        };
    }
    if (changed.includes('title')) {
        return {
            type: 'test_case_updated',
            title: 'Test case updated',
            message: `Test case was renamed to "${name}".`,
        };
    }
    return {
        type: 'test_case_updated',
        title: 'Test case updated',
        message: `Test case "${name}" was updated.`,
    };
}

// Test-suite recipients:
//   - suite creator (created_by_user_id on the test_suites row)
//   - project PMs
// Suites have no junction and no `assigned_to` text field. Reusing the
// `created_by_user_id` column that's set by the route on INSERT.
async function testSuiteRecipients({ entityId, after, before, db }) {
    const row = after || before || {};
    const out = [];

    if (row.created_by_user_id) out.push(row.created_by_user_id);

    if (row.project_id) {
        const pms = await db.query(
            'SELECT user_id FROM project_managers WHERE project_id = $1',
            [row.project_id]
        );
        for (const p of pms.rows) out.push(p.user_id);
    }

    return out;
}

function testSuiteRender({ action, before, after, changedFields }) {
    const name = (after && after.name) || (before && before.name) || 'a test suite';
    if (action === 'CREATE') {
        return { type: 'test_suite_created', title: 'New test suite created', message: `Test suite "${name}" was created.` };
    }
    if (action === 'DELETE') {
        return { type: 'test_suite_deleted', title: 'Test suite deleted', message: `Test suite "${name}" was deleted.` };
    }
    const changed = (changedFields || []).filter(f => TEST_SUITE_SIGNIFICANT_FIELDS.includes(f));
    if (changed.includes('status')) {
        return {
            type: 'test_suite_status_changed',
            title: 'Test suite status changed',
            message: `Test suite "${name}" is now ${after && after.status}.`,
        };
    }
    if (changed.includes('name')) {
        return {
            type: 'test_suite_updated',
            title: 'Test suite updated',
            message: `Test suite was renamed to "${name}".`,
        };
    }
    return {
        type: 'test_suite_updated',
        title: 'Test suite updated',
        message: `Test suite "${name}" was updated.`,
    };
}

// Test-execution recipients:
//   - executor (executed_by on the test_execution row, when set)
//   - test run owner (test_run.created_by)
//   - project PMs (project_id comes from the joined test_run row)
// The test_execution row itself has no `project_id`/`created_by` — those
// live on the parent test_run, so we look them up here.
async function testExecutionRecipients({ entityId, after, before, db }) {
    const row = after || before || {};
    const out = [];

    if (row.executed_by) out.push(row.executed_by);

    if (row.test_run_id) {
        const run = await db.query(
            'SELECT created_by, project_id FROM test_run WHERE id = $1',
            [row.test_run_id]
        );
        if (run.rows[0]) {
            if (run.rows[0].created_by) out.push(run.rows[0].created_by);
            if (run.rows[0].project_id) {
                const pms = await db.query(
                    'SELECT user_id FROM project_managers WHERE project_id = $1',
                    [run.rows[0].project_id]
                );
                for (const p of pms.rows) out.push(p.user_id);
            }
        }
    }

    return out;
}

function testExecutionRender({ action, before, after, changedFields }) {
    const status = (after && after.status) || (before && before.status) || 'not_run';
    const label = `a test execution (${status})`;
    if (action === 'CREATE') {
        return { type: 'test_execution_created', title: 'New test execution logged', message: `Test execution was logged with status ${status}.` };
    }
    if (action === 'DELETE') {
        return { type: 'test_execution_deleted', title: 'Test execution deleted', message: `Test execution was deleted.` };
    }
    const changed = (changedFields || []).filter(f => TEST_EXECUTION_SIGNIFICANT_FIELDS.includes(f));
    if (changed.includes('status')) {
        return {
            type: 'test_execution_status_changed',
            title: 'Test execution result changed',
            message: `Test execution is now ${status}.`,
        };
    }
    return {
        type: 'test_execution_updated',
        title: 'Test execution updated',
        message: `${label} was updated.`,
    };
}

// Project recipients:
//   - on CREATE: all active admins
//   - on UPDATE/DELETE: project PMs (project_managers) ∪ leads of every
//     team in project_teams (team.manager_id)
// The actor is excluded by the dispatcher. CREATE special-cases admins
// because a fresh project has no PMs/teams assigned yet — there is no
// "owner" surface for it.
async function projectRecipients({ entityId, after, before, changedFields, action, db }) {
    const row = after || before || {};
    const out = [];

    if (action === 'CREATE') {
        const admins = await db.query(
            `SELECT id FROM app_user WHERE role = 'admin' AND active = true`
        );
        for (const a of admins.rows) out.push(a.id);
        return out;
    }

    if (row.id || entityId) {
        const pid = row.id || entityId;
        const pms = await db.query(
            'SELECT user_id FROM project_managers WHERE project_id = $1',
            [pid]
        );
        for (const p of pms.rows) out.push(p.user_id);

        // member-team leads: managers of teams linked via project_teams
        const leads = await db.query(
            `SELECT t.manager_id
               FROM project_teams pt
               JOIN teams t ON t.id = pt.team_id
              WHERE pt.project_id = $1 AND t.manager_id IS NOT NULL`,
            [pid]
        );
        for (const l of leads.rows) out.push(l.manager_id);
    }

    return out;
}

function projectRender({ action, before, after, changedFields }) {
    const name = (after && after.project_name) || (before && before.project_name) || 'a project';
    if (action === 'CREATE') {
        return { type: 'project_created', title: 'New project created', message: `Project "${name}" was created.` };
    }
    if (action === 'DELETE') {
        return { type: 'project_deleted', title: 'Project deleted', message: `Project "${name}" was deleted.` };
    }
    const changed = (changedFields || []).filter(f => PROJECT_SIGNIFICANT_FIELDS.includes(f));
    if (changed.includes('status')) {
        return {
            type: 'project_status_changed',
            title: 'Project status changed',
            message: `Project "${name}" is now ${after && after.status}.`,
        };
    }
    return {
        type: 'project_updated',
        title: 'Project updated',
        message: `Project "${name}" was updated.`,
    };
}

// Resource recipients:
//   - the linked user (resources.user_id)
//   - their manager (app_user.manager_id on the linked user)
//   - all active admins
// On DELETE we still notify — the resource row has no `created_by_user_id`,
// so the only ownership surfaces are user_id and manager_id.
async function resourceRecipients({ entityId, after, before, db }) {
    const row = after || before || {};
    const out = [];

    if (row.user_id) {
        out.push(row.user_id);
        const m = await db.query(
            'SELECT manager_id FROM app_user WHERE id = $1',
            [row.user_id]
        );
        if (m.rows[0] && m.rows[0].manager_id) out.push(m.rows[0].manager_id);
    }

    const admins = await db.query(
        `SELECT id FROM app_user WHERE role = 'admin' AND active = true`
    );
    for (const a of admins.rows) out.push(a.id);

    return out;
}

function resourceRender({ action, before, after, changedFields }) {
    const name = (after && after.resource_name) || (before && before.resource_name) || 'a resource';
    if (action === 'CREATE') {
        return { type: 'resource_created', title: 'New resource added', message: `Resource "${name}" was added.` };
    }
    if (action === 'DELETE') {
        return { type: 'resource_deleted', title: 'Resource removed', message: `Resource "${name}" was removed.` };
    }
    const changed = (changedFields || []).filter(f => RESOURCE_SIGNIFICANT_FIELDS.includes(f));
    if (changed.includes('is_active')) {
        const nowActive = after && after.is_active;
        return {
            type: 'resource_updated',
            title: nowActive ? 'Resource activated' : 'Resource deactivated',
            message: `Resource "${name}" is now ${nowActive ? 'active' : 'inactive'}.`,
        };
    }
    if (changed.includes('weekly_capacity_hrs')) {
        return {
            type: 'resource_updated',
            title: 'Resource capacity changed',
            message: `Resource "${name}" weekly capacity is now ${after && after.weekly_capacity_hrs}h.`,
        };
    }
    return {
        type: 'resource_updated',
        title: 'Resource updated',
        message: `Resource "${name}" was updated.`,
    };
}

// Team recipients:
//   - all active admins
//   - the team's manager (after.manager_id), if set
// On DELETE the manager is unlinked by the route, so the manager_id lookup
// is best-effort against the `before` snapshot.
async function teamRecipients({ entityId, after, before, db }) {
    const row = after || before || {};
    const out = [];

    const admins = await db.query(
        `SELECT id FROM app_user WHERE role = 'admin' AND active = true`
    );
    for (const a of admins.rows) out.push(a.id);

    if (row.manager_id) out.push(row.manager_id);

    return out;
}

function teamRender({ action, before, after }) {
    const name = (after && after.name) || (before && before.name) || 'a team';
    if (action === 'CREATE') {
        return { type: 'team_created', title: 'New team created', message: `Team "${name}" was created.` };
    }
    if (action === 'DELETE') {
        return { type: 'team_deleted', title: 'Team deleted', message: `Team "${name}" was deleted.` };
    }
    return {
        type: 'team_updated',
        title: 'Team updated',
        message: `Team "${name}" was updated.`,
    };
}

// Role recipients:
//   - all active admins
//   - the affected user (the user whose role changed — i.e. the audit entityId)
//
// Render is a no-recipient distinction here: both groups get the same payload
// shape. The dispatcher is responsible for stripping entity_id for the
// affected user (per spec: "no entity_id, non-clickable" for the user-facing
// "your permissions changed" notification).
async function roleRecipients({ entityId, db }) {
    const out = [];

    if (entityId) out.push(entityId);

    const admins = await db.query(
        `SELECT id FROM app_user WHERE role = 'admin' AND active = true`
    );
    for (const a of admins.rows) out.push(a.id);

    return out;
}

function roleRender({ action, before, after }) {
    const oldRole = before && before.role;
    const newRole = after && after.role;
    const userName = (after && after.name) || (before && before.name) || 'a user';
    if (action === 'DELETE') {
        return { type: 'role_changed', title: 'Role changed', message: `Role for ${userName} was cleared.` };
    }
    if (oldRole && newRole && oldRole !== newRole) {
        return {
            type: 'role_changed',
            title: 'Role changed',
            message: `${userName}'s role changed from ${oldRole} to ${newRole}.`,
        };
    }
    return {
        type: 'role_changed',
        title: 'Role changed',
        message: `${userName}'s role is now ${newRole || oldRole || 'unset'}.`,
    };
}

// Keyed by the audit entity_type string (the table name passed to auditLog).
const NOTIFICATION_POLICIES = {
    tasks: {
        entityType: 'task', // stored on the notification row + used for links/gating
        significantFields: TASK_SIGNIFICANT_FIELDS,
        recipients: taskRecipients,
        render: taskRender,
    },
    bugs: {
        entityType: 'bug',
        significantFields: BUG_SIGNIFICANT_FIELDS,
        recipients: bugRecipients,
        render: bugRender,
    },
    user_stories: {
        entityType: 'user_story',
        significantFields: STORY_SIGNIFICANT_FIELDS,
        recipients: storyRecipients,
        render: storyRender,
    },
    test_case: {
        entityType: 'test_case',
        significantFields: TEST_CASE_SIGNIFICANT_FIELDS,
        recipients: testCaseRecipients,
        render: testCaseRender,
    },
    test_suites: {
        entityType: 'test_suite',
        significantFields: TEST_SUITE_SIGNIFICANT_FIELDS,
        recipients: testSuiteRecipients,
        render: testSuiteRender,
    },
    test_execution: {
        entityType: 'test_execution',
        significantFields: TEST_EXECUTION_SIGNIFICANT_FIELDS,
        recipients: testExecutionRecipients,
        render: testExecutionRender,
    },
    projects: {
        entityType: 'project',
        significantFields: PROJECT_SIGNIFICANT_FIELDS,
        recipients: projectRecipients,
        render: projectRender,
    },
    resources: {
        entityType: 'resource',
        significantFields: RESOURCE_SIGNIFICANT_FIELDS,
        recipients: resourceRecipients,
        render: resourceRender,
    },
    teams: {
        entityType: 'team',
        significantFields: TEAM_SIGNIFICANT_FIELDS,
        recipients: teamRecipients,
        render: teamRender,
    },
    users: {
        entityType: 'user',
        significantFields: ROLE_SIGNIFICANT_FIELDS,
        recipients: roleRecipients,
        render: roleRender,
    },
};

module.exports = {
    NOTIFICATION_POLICIES,
    TASK_SIGNIFICANT_FIELDS,
    BUG_SIGNIFICANT_FIELDS,
    STORY_SIGNIFICANT_FIELDS,
    TEST_CASE_SIGNIFICANT_FIELDS,
    TEST_SUITE_SIGNIFICANT_FIELDS,
    TEST_EXECUTION_SIGNIFICANT_FIELDS,
    PROJECT_SIGNIFICANT_FIELDS,
    RESOURCE_SIGNIFICANT_FIELDS,
    TEAM_SIGNIFICANT_FIELDS,
    ROLE_SIGNIFICANT_FIELDS,
};
