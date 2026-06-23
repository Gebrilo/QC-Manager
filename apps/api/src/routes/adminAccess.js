'use strict';

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');
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
const {
    ARTIFACT_TABS,
    SCOPE_VALUES,
    applyScopeToSet,
    permissionsForArtifact,
    resolveScope,
} = require('../../../shared/rbac/permissionMatrix.ts');

function permissionsForArtifactType(artifactType) {
    return permissionsForArtifact(ALL_PERMISSIONS, artifactType);
}

router.get('/matrix', requireAuth, requirePermission('qc.admin.roles.view'), async (req, res, next) => {
    try {
        const artifactType = req.query.artifact_type || 'task';
        const permissions = permissionsForArtifactType(artifactType);
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
                permissions: Object.fromEntries(
                    permissions
                        .filter(permission => permission.mode !== 'scope')
                        .map(permission => [permission.key, granted.has(permission.key)])
                ),
                scoped_permissions: Object.fromEntries(
                    permissions
                        .filter(permission => permission.mode === 'scope')
                        .map(permission => [permission.key, resolveScope(granted, permission)])
                ),
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

router.patch('/matrix', requireAuth, requirePermission('qc.admin.manage_permissions'), async (req, res, next) => {
    try {
        const roleName = normalizeRoleName(req.body.role_identifier);
        const permissionKey = req.body.permission_key;
        const granted = req.body.granted;
        const permissionGroup = req.body.permission_group;
        const scope = req.body.scope;

        if (!roleName) {
            return res.status(400).json({ error: 'role_identifier is required' });
        }
        if (!await roleExists(db, roleName)) {
            return res.status(404).json({ error: `Role '${roleName}' not found` });
        }

        const current = await getRolePermissionSet(db, roleName);
        const next = new Set(current);
        const audits = [];
        let responseKey = permissionKey;
        let responseGranted = granted;
        let beforeGranted = false;

        if (typeof permissionGroup === 'string') {
            if (!SCOPE_VALUES.includes(scope)) {
                return res.status(400).json({ error: 'scope must be one of none, own, team, any' });
            }
            const scopedPermission = Object.values(ARTIFACT_TABS)
                .flatMap((_tab, index) => {
                    const artifactType = Object.keys(ARTIFACT_TABS)[index];
                    return permissionsForArtifactType(artifactType) || [];
                })
                .find(permission => permission.mode === 'scope' && permission.key === permissionGroup);
            if (!scopedPermission) {
                return res.status(400).json({ error: `Unknown permission_group '${permissionGroup}'` });
            }
            if (roleName === 'admin' && scope === 'none') {
                return res.status(403).json({ error: 'The admin role cannot have permissions revoked' });
            }
            const updated = applyScopeToSet(next, scopedPermission, scope);
            for (const key of [scopedPermission.keys.own, scopedPermission.keys.team, scopedPermission.keys.any].filter(Boolean)) {
                const before = roleName === 'admin' ? true : next.has(key);
                const after = roleName === 'admin' ? true : updated.has(key);
                if (before !== after) {
                    audits.push({ permissionKey: key, beforeGranted: before, afterGranted: after });
                }
            }
            next.clear();
            for (const key of updated) next.add(key);
            responseKey = permissionGroup;
            responseGranted = scope !== 'none';
            beforeGranted = resolveScope(current, scopedPermission) !== 'none';
        } else {
            if (typeof permissionKey !== 'string' || typeof granted !== 'boolean') {
                return res.status(400).json({ error: 'permission_key and granted are required' });
            }
            if (!ALL_PERMISSIONS.includes(permissionKey)) {
                return res.status(400).json({ error: `Unknown permission_key '${permissionKey}'` });
            }
            if (roleName === 'admin' && granted === false) {
                return res.status(403).json({ error: 'The admin role cannot have permissions revoked' });
            }
            beforeGranted = roleName === 'admin' ? true : current.has(permissionKey);
            if (granted) next.add(permissionKey);
            else next.delete(permissionKey);
            if (beforeGranted !== granted) {
                audits.push({ permissionKey, beforeGranted, afterGranted: granted });
            }
        }

        let affectedRoleNames = [roleName];
        if (roleName !== 'admin') {
            const syncResult = await syncRolePermissions(db, roleName, [...next], req.user?.email || 'system');
            affectedRoleNames = syncResult.affectedRoleNames;
        }

        for (const audit of audits) {
            await auditRolePermissionChange(db, {
                roleName,
                permissionKey: audit.permissionKey,
                beforeGranted: audit.beforeGranted,
                afterGranted: audit.afterGranted,
                actorEmail: req.user?.email || 'system',
            });
        }

        res.json({
            role_identifier: roleName,
            permission_key: responseKey,
            granted: responseGranted,
            scope: typeof permissionGroup === 'string' ? scope : undefined,
            before_granted: beforeGranted,
            affected_role_names: affectedRoleNames,
        });
    } catch (err) {
        next(err);
    }
});

router.get('/roles', requireAuth, requirePermission('qc.admin.roles.view'), async (_req, res, next) => {
    try {
        res.json(await listRoles(db));
    } catch (err) {
        next(err);
    }
});

router.post('/roles', requireAuth, requirePermission('qc.admin.manage_roles'), async (req, res, next) => {
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
            'INSERT INTO custom_roles (name, created_by) VALUES ($1, $2)',
            [roleName, req.user?.email || 'system']
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

router.patch('/roles/:name', requireAuth, requirePermission('qc.admin.manage_roles'), async (req, res, next) => {
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

router.delete('/roles/:name', requireAuth, requirePermission('qc.admin.manage_roles'), async (req, res, next) => {
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

        const beforeState = (await db.query('SELECT name, created_at, created_by FROM custom_roles WHERE name = $1', [roleName])).rows[0] || { name: roleName };
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
module.exports.permissionsForArtifact = permissionsForArtifactType;
