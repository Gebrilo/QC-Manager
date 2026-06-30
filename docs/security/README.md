# Security Documentation

Authentication, authorization, secrets management, audit logging, and data protection.

## Contents

| Document | Audience | Description |
|----------|----------|-------------|
| [authentication.md](authentication.md) | Engineers, Security | Auth flow: Supabase + JWT |
| [authorization-rbac.md](authorization-rbac.md) | Engineers, Security | Role-based access control model |
| [audit-logging.md](audit-logging.md) | Engineers, Security | Audit trail design |
| [secret-management.md](secret-management.md) | DevOps, Security | Credential and key handling |
| [data-protection.md](data-protection.md) | Security | Data protection and privacy |
| [security-review-checklist.md](security-review-checklist.md) | Security | Security assessment checklist |

> [!IMPORTANT]
> For RBAC architectural decisions, see ADRs [0010](../internal/adr/0010-matrix-as-runtime-source-of-truth-for-rbac.md) and [0011](../internal/adr/0011-rbac-scope-collapse-decorative-prune-and-grant-correction.md).
