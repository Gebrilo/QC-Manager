# Audit Logging

## Overview

Every mutation in QC-Manager is logged with before/after state in the `audit_log` table.

## Audit Log Schema

| Column | Description |
|--------|-------------|
| `id` | UUID primary key |
| `user_id` | User who performed the action |
| `action` | Operation type: CREATE, UPDATE, DELETE |
| `entity_type` | Affected table/entity (e.g., `projects`, `tasks`) |
| `entity_id` | UUID of affected row |
| `before_state` | JSONB snapshot before mutation |
| `after_state` | JSONB snapshot after mutation |
| `timestamp` | When the action occurred |

## What Is Audited

- All CUD operations (Create, Update, Delete) on core artifacts
- Project, task, bug, user story mutations
- User role changes
- Permission changes
- Tuleap sync operations

## Implementation

Audit logging is implemented as Express middleware. Every mutating request:
1. Captures pre-state (existing row if update/delete)
2. Executes the mutation
3. Captures post-state
4. Inserts audit_log row with before/after JSON

## Viewing Audit Logs

Audit logs are accessible via:
- Admin UI: `/admin/audit-log` page
- API: Audit log endpoints

## Retention

> [!WARNING]
> **Needs Validation:** No documented audit log retention or purge policy exists.

## Security Considerations

- Audit logs are append-only (no update/delete on `audit_log` table)
- Audit logs should be retained per compliance requirements
- Audit log access restricted to admin role
- Before/after state may contain sensitive data — handle with care
