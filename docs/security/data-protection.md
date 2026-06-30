# Data Protection

## Data Classification

| Category | Examples | Protection Level |
|----------|----------|-----------------|
| Public | Landing page content, public API docs | None |
| Internal | Project names, task descriptions, test cases | Auth required |
| Confidential | User emails, resource assignments, audit logs | Auth + RBAC |
| Restricted | Secrets, API keys, passwords | Never stored in DB; env vars only |

## Data at Rest

- **PostgreSQL (Supabase)**: Encrypted at rest by Supabase
- **Docker volumes**: Application files on VPS disk
- **Backups**: Stored in Supabase (managed) and staging volume

## Data in Transit

- **All external traffic**: HTTPS via Traefik (auto TLS)
- **Internal Docker traffic**: HTTP (containers on shared network)
- **Supabase connection**: TLS (SSL connection from API to Supabase)

## Soft Delete Strategy

Data is never hard-deleted in application logic:

| Entity | Soft Delete Mechanism |
|--------|----------------------|
| Projects | `deleted_at` timestamp |
| Tasks | `deleted_at` timestamp |
| Bugs | `deleted_at` timestamp |
| Test cases | Soft delete via status |

## Access Control

- All data access gated by RBAC (role + scope)
- Row-level access via Access Engine (own/team/any)
- Audit log captures who accessed what
- User status (`SUSPENDED`/`ARCHIVED`) blocks all access

## Data Retention

> [!WARNING]
> **Needs Validation:** No documented data retention policy exists.

### Current State

- Soft-deleted records accumulate indefinitely
- No automated purge mechanism
- Audit logs grow unbounded

### Recommendations

- [ ] Define data retention policy per entity type
- [ ] Implement automated purge for soft-deleted records > N days
- [ ] Add audit log archiving/rotation
- [ ] Document GDPR/data subject request procedure
