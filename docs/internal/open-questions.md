# Open Questions

> [!WARNING]
> **Needs Validation:** These questions are identified from documentation analysis. Confirm and assign owners.

## Product & Business

| Question | Owner | Impact |
|----------|-------|--------|
| Full defect lifecycle management timeline? | PM | Currently out of scope per PRD |
| Predictive/ML analytics roadmap? | PM | Requires data pipeline investment |
| Deep CI/CD integration priority? | PM + DevOps | Would automate quality gates in CI |
| Legacy role removal timeline? | Admin | `manager`, `user`, `member` still canonicalized |
| Performance/load testing analytics? | QA Lead | New data types needed |

## Architecture & Technical

| Question | Owner | Impact |
|----------|-------|--------|
| RBAC_UNIFIED default to 'on' timeline? | Architect | Currently defaults to 'off' |
| Traefik HA configuration? | DevOps | Single reverse proxy in production |
| Soft-delete purge policy? | Architect | Records accumulate indefinitely |
| Disaster recovery RTO/RPO? | DevOps | No documented DR plan |
| Audit log retention policy? | Architect + Compliance | No retention policy defined |
| Task assignment legacy column removal? | Architect | `r1_*`/`r2_*` synced during rollout (ADR 0009) |

## Testing & QA

| Question | Owner | Impact |
|----------|-------|--------|
| Frontend unit test strategy? | QA Lead | Currently no FE unit tests |
| E2E test coverage expansion? | QA Lead | Limited E2E coverage |
| Accessibility compliance target? | QA Lead | No A11y testing |
| Performance testing benchmarks? | QA Lead | No perf testing |

## Operations

| Question | Owner | Impact |
|----------|-------|--------|
| Application-level backup strategy? | DevOps | Relies on Supabase built-in backups |
| Production monitoring setup? | DevOps | No documented monitoring beyond health checks |
| n8n HA/resilience plan? | DevOps | Single point of failure for Tuleap sync |
| Log aggregation strategy? | DevOps | Docker logs only; no central aggregation |

## Security

| Question | Owner | Impact |
|----------|-------|--------|
| Penetration testing performed? | Security | No evidence of pen testing |
| GDPR/data subject request procedure? | Compliance | Not documented |
| Dependency vulnerability scanning? | DevOps | No automated scanning documented |

## Documentation

| Question | Owner | Impact |
|----------|-------|--------|
| API OpenAPI spec maintenance? | Engineers | Generated but may be stale |
| Feature spec template adoption? | Team | New template defined; existing specs need migration |
| Docs/superpowers archive timeline? | Team | 57 files to review and archive |
