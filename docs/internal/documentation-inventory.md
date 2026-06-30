# Documentation Inventory

> Generated: 2026-06-30 | Branch: docs/restructure-knowledge-base

## Summary

| Metric | Count |
|--------|-------|
| Total MD files tracked | 174 |
| Root-level docs | 6 |
| docs/ tree files | 118 |
| specs/ files | 39 |
| App-level docs | 4 |
| n8n docs | 1 |
| Other (style, tuleap plan) | 2 |

## Inventory Table

### Root-Level Files

| Current File | Proposed Destination | Audience | Type | Action | Reason | Risk | Notes |
|---|---|---|---|---|---|---|---|
| README.md | README.md | Everyone | Overview | Rewrite | Solid but too long; needs DOCUMENTATION_INDEX.md link and shorter structure | Low | Keep short, link out |
| AGENTS.md | AGENTS.md | AI Agents / Devs | Agent guidance | Keep | Used by AI agents for repo context | Low | Good; update stale auth roles |
| CLAUDE.md | AGENTS.md (merge) | AI Agents / Devs | Agent guidance | Merge | Duplicate of AGENTS.md with minor variation | Low | Redundant |
| CONTEXT.md | docs/technical/domain-language.md | Engineers, BAs | Domain glossary | Move + Rewrite | Domain language belongs in technical docs; needs slight restructuring | Low | Excellent reference |
| SESSION-NOTES.md | docs/internal/session-notes.md or Delete | Internal | Scratch notes | Delete Candidate | Session scratch, no lasting value | Low | Contains temporary notes |
| style.md | docs/technical/frontend-style-guide.md | Frontend devs | Style guide | Move | Design system lives in technical docs | Low | Keep as reference |

### docs/ Tree

| Current File | Proposed Destination | Audience | Type | Action | Reason | Risk | Notes |
|---|---|---|---|---|---|---|---|
| docs/README.md | docs/README.md | Everyone | Index | Rewrite | Good structure but must align with new target structure | Low | Will become new index hub |
| docs/01-requirements/PRD.md | docs/business/product-overview.md | Everyone | Product | Move + Rewrite | Old PRD, needs feature-template format | Medium | Outdated; early-phase PRD |
| docs/01-requirements/SRS-master.md | docs/technical/architecture-overview.md (merge) | Engineers | Architecture | Merge | SRS content overlaps with architecture docs | Medium | Contains useful tables |
| docs/02-architecture/api-specification.md | docs/technical/api-overview.md | Engineers | API | Move + Rewrite | Needs update for current API surface | Medium | 18 routes now documented in README |
| docs/02-architecture/database-design.md | docs/technical/database-overview.md | Engineers | Database | Move | Good reference; 2000 lines | Low | Comprehensive |
| docs/02-architecture/frontend-design.md | docs/technical/frontend-architecture.md | Frontend devs | Architecture | Move | Good reference | Low | Solid |
| docs/02-architecture/workflow-design.md | docs/technical/n8n-workflow-architecture.md | DevOps, Engineers | Architecture | Move | n8n workflow design document | Low | Good |
| docs/03-guides/DEPLOYMENT.md | docs/operations/deployment.md | DevOps | Operations | Move + Rewrite | Duplicate of deployment info | Medium | Consolidate with deployment-guide |
| docs/03-guides/HOSTINGER-DOCKER-MANAGER.md | docs/operations/hostinger-setup.md | DevOps | Operations | Move | Hostinger-specific ops | Low | Historical ref |
| docs/03-guides/VPS-DEPLOYMENT.md | docs/operations/vps-deployment.md | DevOps | Operations | Move + Merge | Duplicate deployment info | Medium | Consolidate |
| docs/03-guides/access-control-rollout.md | docs/security/authorization-rbac.md (merge) | Engineers | Security | Merge | RBAC rollout summary belongs with RBAC docs | Low | Useful for RBAC context |
| docs/03-guides/api-usage-guide.md | docs/technical/api-usage-examples.md | Engineers | API | Move | API examples | Low | Practical |
| docs/03-guides/deployment-guide.md | docs/operations/deployment.md (merge) | DevOps | Operations | Merge + Rewrite | Consolidate all deployment docs | Medium | Main deployment guide |
| docs/03-guides/development-guide.md | docs/operations/local-setup.md | Developers | Operations | Move + Rewrite | Developer onboarding | Low | Good |
| docs/03-guides/quick-start.md | docs/operations/local-setup.md (merge) | Developers | Operations | Merge | Redundant with development guide and README | Low | Consolidate |
| docs/04-integrations/apps-script-integration.md | docs/technical/integrations.md (merge) | Engineers | Integrations | Merge + Archive | Phase 1 integration, may be deprecated | Medium | Check current status |
| docs/04-integrations/n8n-workflows.md | docs/technical/n8n-workflow-architecture.md (merge) | Engineers, DevOps | Integrations | Merge | n8n integration docs | Low | Good |
| docs/04-integrations/testsprite-integration.md | docs/technical/integrations.md (merge) | Engineers, QA | Integrations | Merge | TestSprite integration | Low | Good |
| docs/05-qa/full-app-audit/README.md | docs/qa/audit-pack-overview.md | QA Engineers | QA | Move | Full-app audit pack | Low | Well-structured |
| docs/05-qa/full-app-audit/bug-reporting.md | docs/qa/bug-reporting-conventions.md | QA Engineers | QA | Move | Bug reporting conventions | Low | Good |
| docs/05-qa/full-app-audit/discovery-prompt.md | docs/qa/audit-discovery-prompt.md | QA Engineers, AI | QA | Move | Agent discovery prompt | Low | Internal |
| docs/05-qa/full-app-audit/inventory.md | docs/qa/audit-page-inventory.md | QA Engineers | QA | Move | Page inventory for audit | Low | Internal |
| docs/05-qa/full-app-audit/pages/_template.md | docs/qa/page-audit-template.md | QA Engineers | QA | Move | Per-page audit template | Low | Good |
| docs/05-qa/full-app-audit/plans/role-consolidation-test-plan.md | docs/qa/test-plans/role-consolidation.md | QA Engineers | QA | Move | Role consolidation test plan | Low | Specific plan |
| docs/05-qa/full-app-audit/runs/2026-06-09-production-run.md | docs/qa/audit-runs/2026-06-09-production-run.md | QA Engineers | QA | Move | Past audit run | Low | Historical |
| docs/05-qa/full-app-audit/runs/_template.md | docs/qa/audit-runs/_template.md | QA Engineers | QA | Move | Run template | Low | Good |
| docs/05-qa/full-app-audit/setup.md | docs/qa/audit-setup.md | QA Engineers | QA | Move | Audit environment setup | Low | Good |
| docs/05-qa/full-app-audit/ux-heuristics.md | docs/qa/ux-heuristics-checklist.md | QA Engineers, Designers | QA | Move | UX heuristics checklist | Low | Good |
| docs/05-qa/ui-role-scenarios/README.md | docs/qa/role-scenarios-overview.md | QA Engineers | QA | Move | RBAC role scenario index | Low | Good |
| docs/05-qa/ui-role-scenarios/roles/admin.md | docs/qa/role-scenarios/admin.md | QA Engineers | QA | Move | Admin role scenarios | Low | Good |
| docs/05-qa/ui-role-scenarios/roles/contributor.md | docs/qa/role-scenarios/contributor.md | QA Engineers | QA | Move | Contributor role scenarios | Low | Good |
| docs/05-qa/ui-role-scenarios/roles/manager-legacy-alias.md | docs/qa/role-scenarios/legacy/manager-legacy-alias.md | QA Engineers | QA | Move + Archive | Legacy alias docs | Low | Archive candidate |
| docs/05-qa/ui-role-scenarios/roles/member.md | docs/qa/role-scenarios/legacy/member.md | QA Engineers | QA | Move + Archive | Legacy member role | Low | Archive candidate |
| docs/05-qa/ui-role-scenarios/roles/pm.md | docs/qa/role-scenarios/pm.md | QA Engineers | QA | Move | PM role scenarios | Low | Good |
| docs/05-qa/ui-role-scenarios/roles/team-manager.md | docs/qa/role-scenarios/team-manager.md | QA Engineers | QA | Move | Team manager scenarios | Low | Good |
| docs/05-qa/ui-role-scenarios/roles/tester.md | docs/qa/role-scenarios/tester.md | QA Engineers | QA | Move | Tester scenarios | Low | Good |
| docs/05-qa/ui-role-scenarios/roles/user-legacy-alias.md | docs/qa/role-scenarios/legacy/user-legacy-alias.md | QA Engineers | QA | Move + Archive | Legacy user role | Low | Archive candidate |
| docs/05-qa/ui-role-scenarios/roles/viewer.md | docs/qa/role-scenarios/viewer.md | QA Engineers | QA | Move | Viewer role scenarios | Low | Good |
| docs/05-qa/ui-role-scenarios/setup.md | docs/qa/role-scenario-setup.md | QA Engineers | QA | Move | RBAC test setup | Low | Good |
| docs/05-qa/user-stories/README.md | docs/qa/user-stories-overview.md | QA, BAs | QA | Move | User story index | Low | Good |
| docs/05-qa/user-stories/manager.md | docs/qa/user-stories/manager.md | QA, BAs | QA | Move | Manager stories | Low | Good |
| docs/05-qa/user-stories/pm.md | docs/qa/user-stories/pm.md | QA, BAs | QA | Move | PM stories | Low | Good |
| docs/05-qa/user-stories/team-manager.md | docs/qa/user-stories/team-manager.md | QA, BAs | QA | Move | Team manager stories | Low | Good |
| docs/05-qa/user-stories/tester.md | docs/qa/user-stories/tester.md | QA, BAs | QA | Move | Tester stories | Low | Good |
| docs/05-qa/user-stories/user.md | docs/qa/user-stories/user.md | QA, BAs | QA | Move + Archive | Legacy user stories | Low | Archive candidate |

### docs/adr/

| Current File | Proposed Destination | Audience | Type | Action | Reason | Risk | Notes |
|---|---|---|---|---|---|---|---|
| docs/adr/README.md | docs/internal/adr/README.md | Engineers | ADR Index | Move | ADR index | Low | Excellent |
| docs/adr/0001-0011 (11 files) | docs/internal/adr/0001-0011.md | Engineers | ADR | Move | Architecture decision records | Low | Critical historical decisions |

### docs/superpowers/ (57 files)

| Current File | Proposed Destination | Audience | Type | Action | Reason | Risk | Notes |
|---|---|---|---|---|---|---|---|
| docs/superpowers/plans/* (35 files) | docs/internal/implementation-plans/ or Archive | Engineers, AI agents | Plans | Move or Archive | Historical implementation plans; most completed | Low | 35 dated plan files |
| docs/superpowers/prds/* (1 file) | docs/internal/implementation-plans/ | Engineers | PRD | Move | Unified Tuleap payload PRD | Low | Historical |
| docs/superpowers/specs/* (15 files) | docs/internal/implementation-plans/ | Engineers | Spec | Move | Design specs for past features | Low | Historical |

### specs/ Tree (Feature Specifications)

| Current File | Proposed Destination | Audience | Type | Action | Reason | Risk | Notes |
|---|---|---|---|---|---|---|---|
| specs/001-liquid-glass-ui/* (8 files) | docs/features/ui-design-system.md (merge) or Archive | Engineers, Designers | Spec | Move + Merge | UI spec; implement or archive | Low | Check implementation status |
| specs/001-playwright-test-cycle/* (3 files) | docs/qa/test-automation-strategy.md (merge) | QA, Engineers | Spec | Move | Playwright test cycle spec | Low | Good |
| specs/002-tasks-kanban-view/* (8 files) | docs/features/kanban-view.md or Archive | Engineers | Spec | Needs Review | Check if implemented | Medium | Kanban feature |
| specs/003-fix-tooltip-layering/* (7 files) | Archive | Engineers | Spec | Archive | Bug fix spec; completed | Low | Fixed |
| specs/004-n8n-workflow-validation/* (8 files) | docs/technical/n8n-workflow-architecture.md (merge) | Engineers | Spec | Move + Merge | n8n validation spec | Low | Good |
| specs/005-supabase-multi-auth/* (5 files) | docs/security/authentication.md (merge) | Engineers | Security Spec | Move + Merge | Auth migration spec | Low | Good |
| specs/006-parent-story-picker/* (8 files) | docs/features/parent-story-picker.md or Archive | Engineers | Spec | Needs Review | Check implementation status | Medium | Feature spec |

### App-Level Docs

| Current File | Proposed Destination | Audience | Type | Action | Reason | Risk | Notes |
|---|---|---|---|---|---|---|---|
| apps/web/DESIGN_SYSTEM.md | docs/technical/frontend-design-system.md | Frontend devs | Design System | Move | Design system reference | Low | Good |
| apps/web/COMPONENT_GUIDE.md | docs/technical/frontend-component-guide.md | Frontend devs | Guide | Move | Component guide | Low | Good |
| apps/web/public/fonts/README.md | docs/technical/frontend-fonts.md | Frontend devs | Reference | Move | Font info | Low | Small |
| apps/api/src/services/access/README.md | docs/security/authorization-rbac.md (merge) | Engineers | Security | Move + Merge | Access engine internals | Low | Good technical doc |
| database/migrations/README.md | docs/technical/database-migrations.md | Engineers | Database | Move | Migration guide | Low | Good |
| n8n/README.md | docs/technical/n8n-workflow-architecture.md (merge) | DevOps | Automation | Merge | n8n overview | Low | Good |

### Other Docs

| Current File | Proposed Destination | Audience | Type | Action | Reason | Risk | Notes |
|---|---|---|---|---|---|---|---|
| docs/tuleap-integration-user-manual.md | docs/features/tuleap-integration.md | Users, Engineers | Feature Manual | Move + Rewrite | Tuleap integration user-facing manual | Low | Good material |
| docs/bug-webhook-uuid-fix-plan.md | docs/internal/implementation-plans/ | Engineers | Plan | Move | Historical fix plan | Low | Archive |
| docs/runbooks/2026-06-20-human-id-duplicate-audit.md | docs/operations/runbooks/ | DevOps | Runbook | Move | Operational runbook | Low | Good |
| docs/agents/domain.md | docs/internal/agent-config/ | Engineers | Agent config | Keep or Move | Agent domain config | Low | Internal |
| docs/agents/issue-tracker.md | docs/internal/agent-config/ | Engineers | Agent config | Keep or Move | Agent issue tracker config | Low | Internal |
| docs/agents/triage-labels.md | docs/internal/agent-config/ | Engineers | Agent config | Keep or Move | Agent triage labels | Low | Internal |
| tuleap-bug-source-classification-and-dashboard-plan.md | docs/internal/implementation-plans/ | Engineers | Plan | Move + Archive | Historical plan | Low | Done |
| style.md | docs/technical/frontend-style-guide.md | Frontend devs | Style guide | Move | In root, belongs in docs/ | Low | Good reference |

## Action Summary

| Action | Count |
|--------|-------|
| Keep | 3 |
| Move | 90 |
| Rewrite | 8 |
| Merge | 25 |
| Split | 0 |
| Needs Review | 5 |
| Delete Candidate | 2 |
| Archive | 10 |
