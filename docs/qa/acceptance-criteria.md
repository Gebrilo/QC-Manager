# Acceptance Criteria

> [!IMPORTANT]
> This is a catalog of global acceptance criteria. Feature-specific ACs are documented in each feature file under [docs/features/](../features/).

## Global Acceptance Criteria

### Authentication

| ID | Acceptance Criteria | Priority |
|----|--------------------|----------|
| AC-AUTH-001 | User can log in via Supabase Auth | Critical |
| AC-AUTH-002 | Invalid credentials show clear error message | Critical |
| AC-AUTH-003 | Expired session redirects to login | High |
| AC-AUTH-004 | JWT fallback works when Supabase is unavailable | Low |

### RBAC

| ID | Acceptance Criteria | Priority |
|----|--------------------|----------|
| AC-RBAC-001 | Admin can access all routes and perform all actions | Critical |
| AC-RBAC-002 | Viewer cannot create, edit, or delete any artifact | Critical |
| AC-RBAC-003 | Legacy role aliases canonicalize correctly | Medium |
| AC-RBAC-004 | Per-user permission overrides take effect | Medium |

### Data Integrity

| ID | Acceptance Criteria | Priority |
|----|--------------------|----------|
| AC-DATA-001 | Soft-deleted items do not appear in queries | Critical |
| AC-DATA-002 | Audit log records before/after state for every mutation | High |
| AC-DATA-003 | Concurrent updates do not corrupt data | High |
| AC-DATA-004 | UUIDs are unique and immutable | Critical |

### UI/UX

| ID | Acceptance Criteria | Priority |
|----|--------------------|----------|
| AC-UX-001 | All forms show validation errors inline | High |
| AC-UX-002 | Success/failure toast notifications after every action | High |
| AC-UX-003 | Loading states shown during API calls | Medium |
| AC-UX-004 | Empty states have helpful messages, not blank screens | Medium |
| AC-UX-005 | Error boundaries catch and display React errors gracefully | Medium |

### Tuleap Integration

| ID | Acceptance Criteria | Priority |
|----|--------------------|----------|
| AC-TUL-001 | Tuleap bug creation syncs to QC within 60 seconds | Critical |
| AC-TUL-002 | QC artifact creation pushes to Tuleap correctly | High |
| AC-TUL-003 | Duplicate webhook payloads are idempotent | High |

> [!NOTE]
> For feature-specific acceptance criteria, see each feature's documentation in [docs/features/](../features/).
