'use strict';

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const {
    ALL_PERMISSIONS,
    getRolePermissionSet,
    isBuiltInRole,
    listRoles,
    normalizeRoleName,
    roleExists,
    syncRolePermissions,
    auditRolePermissionChange,
    validateRoleName,
} = require('../services/rolePermissions');

const ARTIFACT_TABS = Object.freeze({
    task: Object.freeze({ label: 'Tasks', domains: Object.freeze(['qc.tasks']) }),
    bug: Object.freeze({ label: 'Bugs', domains: Object.freeze(['qc.bugs']) }),
    test_case: Object.freeze({ label: 'Test Cases', domains: Object.freeze(['qc.testcases']) }),
    test_suite: Object.freeze({ label: 'Test Suites', domains: Object.freeze(['qc.testsuites']) }),
    test_execution: Object.freeze({ label: 'Test Executions', domains: Object.freeze(['qc.testexecutions', 'qc.testresults']) }),
    user_story: Object.freeze({ label: 'User Stories', domains: Object.freeze(['qc.user_stories']) }),
    reports: Object.freeze({ label: 'Reports', domains: Object.freeze(['qc.reports']) }),
    admin: Object.freeze({ label: 'Admin', domains: Object.freeze(['qc.admin']) }),
});

function permissionAction(permissionKey) {
    return permissionKey.split('.').pop();
}

function formatPermissionLabel(permissionKey) {
    return permissionAction(permissionKey)
        .replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
}

function permissionBelongsToTab(permissionKey, tab) {
    return tab.domains.some(domain => permissionKey === domain || permissionKey.startsWith(`${domain}.`));
}

function permissionsForArtifact(artifactType) {
    const tab = ARTIFACT_TABS[artifactType];
    if (!tab) return null;
    return ALL_PERMISSIONS
        .filter(permission => permissionBelongsToTab(permission, tab))
        .sort((a, b) => permissionAction(a).localeCompare(permissionAction(b)))
        .map(permission => ({
            key: permission,
            action: permissionAction(permission),
            label: formatPermissionLabel(permission),
            project_scope_warning: permission.endsWith('_project')
                ? 'Grants cross-team visibility within projects this role is project-scoped to'
                : null,
        }));
}

router.get('/matrix', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const artifactType = req.query.artifact_type || 'task';
        const permissions = permissionsForArtifact(artifactType);
        const tab = ARTIFACT_TABS[artifactType];
        if (!permissions || !tab) {
            return res.status(400).json({
                error: `Unknown artifact_type '${artifactType}'`,
                artifact_types: Object.keys(ARTIFACT_TABS),
            });
        }

        const roles = await listRoles(db);
        const roleRows = roles.map(role => {
            const granted = new Set(role.permissions);
            return {
                ...role,
                permissions: Object.fromEntries(permissions.map(permission => [permission.key, granted.has(permission.key)])),
            };
        });

        res.json({
            artifact_type: artifactType,
            artifact_label: tab.label,
            artifact_types: Object.entries(ARTIFACT_TABS).map(([key, value]) => ({ key, label: value.label })),
            permission_keys: permissions,
            roles: roleRows,
        });
    } catch (err) {
        next(err);
    }
});

router.patch('/matrix', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const roleName = normalizeRoleName(req.body.role_identifier);
        const permissionKey = req.body.permission_key;
        const granted = req.body.granted;

        if (!roleName || typeof permissionKey !== 'string' || typeof granted !== 'boolean') {
            return res.status(400).json({ error: 'role_identifier, permission_key, and granted are required' });
        }
        if (!ALL_PERMISSIONS.includes(permissionKey)) {
            return res.status(400).json({ error: `Unknown permission_key '${permissionKey}'` });
        }
        if (!await roleExists(db, roleName)) {
            return res.status(404).json({ error: `Role '${roleName}' not found` });
        }
        if (roleName === 'admin' && granted === false) {
            return res.status(403).json({ error: 'The admin role cannot have permissions revoked' });
        }

        const current = await getRolePermissionSet(db, roleName);
        const beforeGranted = roleName === 'admin' ? true : current.has(permissionKey);
        if (granted) current.add(permissionKey);
        else current.delete(permissionKey);

        let affectedRoleNames = [roleName];
        if (roleName !== 'admin') {
            const syncResult = await syncRolePermissions(db, roleName, [...current], req.user?.email || 'system');
            affectedRoleNames = syncResult.affectedRoleNames;
        }

        await auditRolePermissionChange(db, {
            roleName,
            permissionKey,
            beforeGranted,
            afterGranted: granted,
            actorEmail: req.user?.email || 'system',
        });

        res.json({
            role_identifier: roleName,
            permission_key: permissionKey,
            granted,
            before_granted: beforeGranted,
            affected_role_names: affectedRoleNames,
        });
    } catch (err) {
        next(err);
    }
});

router.get('/roles', requireAuth, requireRole('admin'), async (_req, res, next) => {
    try {
        res.json(await listRoles(db));
    } catch (err) {
        next(err);
    }
});

router.post('/roles', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const validation = validateRoleName(req.body.name);
        if (!validation.ok) return res.status(400).json({ error: validation.error });

        const roleName = validation.name;
        if (isBuiltInRole(roleName)) {
            return res.status(409).json({ error: `'${roleName}' is a built-in role and cannot be recreated` });
        }
        if (await roleExists(db, roleName)) {
            return res.status(409).json({ error: `Role '${roleName}' already exists` });
        }

        await db.query(
            'INSERT INTO custom_roles (name, permissions, created_by) VALUES ($1, $2, $3)',
            [roleName, [], req.user?.email || 'system']
        );

        res.status(201).json({
            name: roleName,
            role_identifier: roleName,
            permissions: [],
            is_builtin: false,
            is_protected: false,
        });
    } catch (err) {
        next(err);
    }
});

router.patch('/roles/:name', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const oldName = normalizeRoleName(req.params.name);
        const validation = validateRoleName(req.body.name);
        if (!validation.ok) return res.status(400).json({ error: validation.error });

        const newName = validation.name;
        if (isBuiltInRole(oldName)) {
            return res.status(403).json({ error: `Built-in role '${oldName}' cannot be renamed` });
        }
        if (!await roleExists(db, oldName)) {
            return res.status(404).json({ error: `Role '${oldName}' not found` });
        }
        if (isBuiltInRole(newName) || (newName !== oldName && await roleExists(db, newName))) {
            return res.status(409).json({ error: `Role '${newName}' already exists` });
        }

        await db.query('UPDATE custom_roles SET name = $1 WHERE name = $2', [newName, oldName]);
        await db.query('UPDATE role_permissions SET role_identifier = $1 WHERE role_identifier = $2', [newName, oldName]);
        await db.query('UPDATE app_user SET role = $1 WHERE role = $2', [newName, oldName]);
        await db.query(
            `INSERT INTO audit_log (entity_type, action, before_state, after_state, changed_fields, change_summary, user_email)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                'custom_role',
                'UPDATE',
                JSON.stringify({ name: oldName }),
                JSON.stringify({ name: newName }),
                ['name'],
                `Renamed role ${oldName} to ${newName}`,
                req.user?.email || 'system',
            ]
        );

        res.json({ name: newName, role_identifier: newName });
    } catch (err) {
        next(err);
    }
});

router.delete('/roles/:name', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const roleName = normalizeRoleName(req.params.name);
        if (isBuiltInRole(roleName)) {
            return res.status(403).json({ error: `Built-in role '${roleName}' cannot be deleted` });
        }
        if (!await roleExists(db, roleName)) {
            return res.status(404).json({ error: `Role '${roleName}' not found` });
        }

        const usersResult = await db.query('SELECT COUNT(*) AS count FROM app_user WHERE role = $1', [roleName]);
        const assignedCount = Number(usersResult.rows[0]?.count || 0);
        if (assignedCount > 0) {
            return res.status(409).json({
                error: `Cannot delete role '${roleName}' because ${assignedCount} user(s) are assigned to it`,
            });
        }

        const beforeState = (await db.query('SELECT name, permissions FROM custom_roles WHERE name = $1', [roleName])).rows[0] || { name: roleName };
        await db.query('DELETE FROM role_permissions WHERE role_identifier = $1', [roleName]);
        await db.query('DELETE FROM custom_roles WHERE name = $1', [roleName]);
        await db.query(
            `INSERT INTO audit_log (entity_type, action, before_state, after_state, changed_fields, change_summary, user_email)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                'custom_role',
                'DELETE',
                JSON.stringify(beforeState),
                null,
                ['name'],
                `Deleted role ${roleName}`,
                req.user?.email || 'system',
            ]
        );

        res.json({ success: true, name: roleName });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
module.exports.ARTIFACT_TABS = ARTIFACT_TABS;
module.exports.permissionsForArtifact = permissionsForArtifact;
