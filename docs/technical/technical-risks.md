# Technical Risks

> [!WARNING]
> **Needs Validation:** Risk assessments are based on code review and documentation analysis. Implementation status must be confirmed.

## Known Risks

| Risk | Severity | Mitigation | Status |
|------|----------|------------|--------|
| Supabase single point of failure | High | Cloud SLA; no self-hosted production DB fallback currently | Accepted |
| Migration-on-startup pattern | Medium | Idempotent DDL; no rollback mechanism | Accepted |
| n8n as Tuleap sync mediator | Medium | Adds dependency chain: Tuleap → n8n → API; n8n outage stops sync | Accepted |
| Build-time baked env vars | Medium | `NEXT_PUBLIC_*` vars baked into web image; requires rebuild to change | By Design |
| RBAC_UNIFIED kill-switch | Low | Dual-mode authorization; legacy fallback available | Implemented |
| Traefik single proxy | Medium | Single reverse proxy; no HA configuration documented | Accepted |
| Task assignment dual model | Low | Legacy `r1_*`/`r2_*` columns synced via cache during rollout (ADR 0009) | Transitional |
| Soft-delete accumulation | Low | No automated purge; `deleted_at` rows accumulate indefinitely | Needs Review |
| No automated backup documented | High | Supabase has built-in backups; no documented application-level backup strategy | Needs Review |

## Integration Risks

| Integration | Risk | Impact |
|-------------|------|--------|
| Tuleap API | Rate limiting, auth token expiry | Sync failure; artifacts diverge |
| Supabase Auth | Token verification depends on `SUPABASE_JWT_SECRET` | Users cannot authenticate |
| n8n | Workflow engine crash or version upgrade | Reports, sync delayed |
| Docker Hub | Image pull failures during deploy | Deployment blocked |

## Recommended Improvements

- [ ] Add health check monitoring with alerting
- [ ] Document backup and restore procedure for application data
- [ ] Add automated purge policy for soft-deleted records
- [ ] Consider HA Traefik configuration for production
- [ ] Add circuit breaker for Tuleap API calls
- [ ] Document disaster recovery plan
