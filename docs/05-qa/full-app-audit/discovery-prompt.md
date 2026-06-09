# Phase 2 Discovery Prompt

This is the canonical prompt the operator gives to an agent to **draft** per-page specs from the live app. Phase 2 runs once after Phase 1 (pack scaffolding) is complete.

## Prerequisites

- Phase 1 complete (this pack scaffolded).
- Admin user provisioned per `setup.md`.
- Target environment is **staging** (never run discovery against production).
- GitHub labels exist.

## The prompt

```
You are running Phase 2 of the QC-Manager full-app audit: drafting per-page specs from the live application.

Read first:
  - docs/05-qa/full-app-audit/README.md
  - docs/05-qa/full-app-audit/setup.md (log in as admin on staging)
  - docs/05-qa/full-app-audit/pages/_template.md (the spec format you will produce)
  - docs/05-qa/full-app-audit/ux-heuristics.md
  - docs/05-qa/full-app-audit/inventory.md (the route list and slug mapping)
  - CLAUDE.md (root) — mine this for "Known traps"

For each route in inventory.md with status `not drafted`:
  1. Copy pages/_template.md to pages/<slug>.md.
  2. Navigate to the route via Playwright.
  3. Populate the spec:
     - Identity, Purpose, Prerequisites, Control Inventory, Happy Path Scenarios, Negative/Edge Cases, Known traps, UX Checks
  4. Update inventory.md: flip status to `drafted`.
  5. Commit: `git add ... && git commit -m "docs(audit): draft spec for <slug>"`

DO NOT file GitHub issues during Phase 2. Phase 2 only drafts specs.
```
