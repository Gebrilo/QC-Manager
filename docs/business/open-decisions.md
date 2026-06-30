# Open Decisions

> [!WARNING]
> **Needs Validation:** These decisions are inferred from documentation and implementation state. Confirm with the product owner.

## Unresolved

| Decision | Context | Impact | Owner |
|----------|---------|--------|-------|
| Full defect lifecycle management | PRD marked as "Phase 1-4 out of scope" | Would expand bug tracking features significantly | PM |
| Predictive/ML analytics | Mentioned as future capability | Requires data pipeline and ML infrastructure | Architect |
| Deep CI/CD integration | PRD marks as out of scope | Would enable automated quality gates in CI | DevOps |
| Performance/load testing analytics | Not currently supported | Would add new data collection and metrics | QA Lead |
| Legacy role removal timeline | `manager`, `user`, `member` aliases still canonicalized | Breaking change for existing users | Admin |

## Recently Resolved

| Decision | Resolution | Date |
|----------|------------|------|
| Role consolidation 9→6 | admin, pm, team_manager, tester, viewer, contributor | 2026-06-09 |
| RBAC unified access engine | Matrix-based runtime authorization (ADR 0010, amended by 0011) | 2026-06 |
| Task assignment normalization | `task_resource_assignment` junction replaces legacy columns (ADR 0009) | 2026-04 |
