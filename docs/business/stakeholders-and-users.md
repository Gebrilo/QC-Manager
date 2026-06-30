# Stakeholders and Users

## User Roles

| Role | Type | Permissions Scope | Key Capabilities |
|------|------|-------------------|------------------|
| **Admin** | System | Full system access | User management, RBAC config, system settings, landing page administration |
| **PM** | Project | Project-scoped | Project oversight, quality gates, release approvals, dashboards |
| **Team Manager** | Team | Team-scoped | Resource management, IDPs, team dashboards, workload views |
| **Tester** | Member | Own + team-scoped | Test execution, bug reporting, personal tasks, test case authoring |
| **Viewer** | Read-only | Team-scoped | Read dashboards, reports, artifacts |
| **Contributor** | Limited | Team-scoped | Limited data entry, view within project/team scope |

## Legacy Role Aliases

| Legacy Role | Canonical Role | Status |
|-------------|---------------|--------|
| `manager` | `team_manager` | Deprecated alias |
| `user` | `tester` | Deprecated alias |
| `member` | `tester` | Deprecated alias |

> [!IMPORTANT]  
> The legacy `manager`, `user`, and `member` roles are canonicalized to `team_manager` and `tester` respectively during permission checks. Use canonical role names in all new code and documentation.

## User Statuses

| Status | Description |
|--------|-------------|
| `ACTIVE` | Normal user access |
| `PREPARATION` | Account being set up; limited access |
| `SUSPENDED` | Temporarily disabled |
| `ARCHIVED` | Permanently deactivated; historical data retained |

## Stakeholders

| Stakeholder | Interest |
|-------------|----------|
| QA Lead / Test Lead | Release readiness, quality governance, team productivity |
| Engineering Manager | Quality visibility, resource planning |
| Product Manager | Release confidence, quality trends |
| DevOps / SRE | Deployment health, infrastructure stability |
| Tuleap Administrator | Integration health, artifact sync status |
