---
name: triaging-issues
description: Use when adding implementation plans, labels, or specs to open GitHub issues in QC-Manager so a coding agent (GLM, Claude, etc.) can implement them. Triggers on requests like "walk through the open issues", "add what the agent needs", "make these ready for an agent", "do the same for new issues", or batch-processing via `gh issue` commands.
---

# Triaging GitHub Issues for Agent Implementation

## Overview

Convert vague bug reports into implementation-ready specs by **grounding every claim in the actual codebase** before drafting the plan. Then post a structured comment and apply labels. The reporter's "Suggested Fix" is wrong about half the time — verify with `grep` before transcribing it.

## When to Use

- "Walk through the open issues and add what GLM needs"
- "Do the same for the new issues"
- "Add a label for every issue"
- Any batch processing of GitHub issues with `gh issue` for agent hand-off

**Do NOT use for:** single ad-hoc bug fixes where you'll do the work yourself.

## The Workflow

1. **List open issues**
   ```bash
   gh issue list --state open --limit 50 --json number,title,labels,createdAt,body
   ```

2. **Read each issue (and any referenced issues)**
   ```bash
   gh issue view N --json title,body
   # If "REGRESSION of #X" or "Related to #Y":
   gh issue view X --json title,body,state
   ```

3. **Ground in the codebase BEFORE drafting the plan**
   - Find files: `grep -rn "<symbol or text>" apps/web apps/api 2>/dev/null | head`
   - Always note file paths + line numbers (use `grep -n`)
   - Check if components/views/routes the reporter claims missing actually exist
   - `git log --oneline -20` for recent fixes in the same area (catches regressions)

4. **Classify the issue**
   - **Real bug** → write a fix plan
   - **Working as designed** → label `needs-info`, recommend close + explain why
   - **Environmental** (stale build, missing migration, unlinked account) → recommend the env fix first
   - **Reporter misdiagnosis** → correct it, write the real plan

5. **Write the plan to `/tmp/issue-comments/N.md`** using the template below
6. **Post + label in one shell chain**
   ```bash
   gh issue comment N --body-file /tmp/issue-comments/N.md && \
   gh issue edit N --add-label "bug,error-handling,ready-for-agent"
   ```

## Implementation Plan Template

```markdown
## Implementation Plan for GLM Agent

### Root cause / Current state
[Quote exact file paths + line numbers. Quote the relevant code block — don't paraphrase.]

### Verify before changing code        ← include only for env/stale-build issues
[Specific commands the agent should run first — psql queries, curl, docker exec]

### Fix — Step 1, Step 2, ...
[Concrete diffs in fenced code blocks. Show before/after where useful.]

### Acceptance criteria
- [ ] [Observable outcomes — what the user/curl/test should see]
- [ ] [Include verification commands when applicable]

### Test plan
- [ ] [Manual repro steps, including which user role]
- [ ] [Regression test to add, with the file path it should live in]

### Dependency / related
[Blocking/blocked issues; recommend implementation order for foundational fixes]
```

## QC-Manager Label Taxonomy

Always list existing labels first: `gh label list --limit 100`. Multi-label is fine.

| Axis | Options |
|---|---|
| Type | `bug`, `enhancement`, `documentation` |
| Priority | `priority:critical` (only for blockers) |
| Area | `permissions`, `rbac`, `architecture`, `infrastructure`, `error-handling`, `loading-states`, `notifications`, `state-management`, `dashboard`, `my-work`, `reports`, `runs`, `results`, `stories`, `tasks`, `test-execution`, `consistency`, `design`, `ux` |
| Status | `ready-for-agent` (fully specified), `needs-info` (needs reproduction first), `needs-triage`, `ready-for-human` |

## Grounding Patterns — QC-Manager Specifics

### "Button doesn't work / no feedback"
- Find the button: `grep -rn "<button text>" apps/web/app apps/web/src`
- Read the handler — does it `try/catch`? Does it use `useToast`?
- Check if a gate (`PermissionGate`, `hasPermission`) hides vs disables

### "Endpoint returns 500"
- Find handler: `find apps/api/src/routes -iname "*<topic>*"`
- Missing DB views: `grep -rn "FROM v_<name>" apps/api/src` + check `database/migrations/`
- Common culprit: access-engine parameter type errors (see commits `74c3a68`, `645389c`)

### "404 on URL X"
- Routes config: `apps/web/src/config/routes.ts` (authoritative — sidebar paths defined here)
- App Router pages: `find apps/web/app -name page.tsx | grep <pattern>`
- Reporter's guessed URL vs canonical: distinguish `/quality/runs` (doesn't exist) from `/test/runs` (the real path)

### "Calculation wrong"
- Quote the actual formula from SQL/code (often in `apps/api/src/config/db.js` for project metrics)
- Show the reporter's expected vs the current formula side-by-side
- Recommend labeling change in the UI too — definitions matter

### "Empty page / dashboard"
- `apps/web/app/me/dashboard/my-dashboard-client.tsx` — has banner for unlinked accounts
- Diagnose with: `SELECT u.email, r.id AS resource_id FROM app_user u LEFT JOIN resources r ON r.user_id = u.id WHERE u.email = '<addr>';`

## Quick Reference — Existing Infrastructure (Don't Re-Build)

| Need | Already exists at |
|---|---|
| Toast notifications | `apps/web/src/components/ui/Toast.tsx` (`useToast()`) — mounted in `apps/web/app/layout.tsx` |
| Permission gating | `apps/web/src/components/auth/PermissionGate.tsx` |
| `hasPermission()` | `apps/web/src/components/providers/AuthProvider.tsx:190` |
| Loading spinner | `apps/web/src/components/ui/Spinner.tsx` |
| Error banner | `apps/web/src/components/ui/ErrorBanner.tsx` |
| API client (with 403/Zod handling) | `apps/web/src/lib/api/index.ts:11` (`fetchApi`) |
| Sidebar routes | `apps/web/src/config/routes.ts` (`ROUTES`, `NAVIGATION_SECTIONS`) |

Whenever a plan proposes "add a toast / permission gate / spinner", first check if it's already there.

## Common Rationalizations to Avoid

| Excuse | Reality |
|---|---|
| "Reporter's Suggested Fix looks right, I'll just transcribe it" | Wrong ~50% of the time. Read the code. |
| "Skip line numbers — the agent can grep" | Without them, the agent re-explores and may diverge from your intent. |
| "It's a one-line fix, no test needed" | Recurring bugs (#114→#120, #115→#121, #106→#123) all lacked regression tests. |
| "Just label everything `ready-for-agent`" | `needs-info` is correct when the bug can't be reproduced from the description. |
| "Cross-issue dependency order isn't important" | It is. Foundational (toast, gate, hook) lands first; adoption issues land after. |

## Red Flags — STOP and Re-Read

- Plan references a component without confirming it exists (grep first)
- Plan adds what's already there (e.g., a `PermissionGate` that's already wired)
- Plan says "fix the formula" without quoting the current formula
- Plan has no file paths or line numbers
- Plan recommends a refactor when the reporter's claim isn't reproduced

Hit any of these → re-grep, re-read, redraft.

## Verification Checklist

Before posting comments and labels for a batch:

- [ ] Every plan cites at least one file path + line number from the current codebase
- [ ] Every "real bug" plan has acceptance criteria with observable outcomes
- [ ] Every `needs-info`-labeled issue has explicit verify-before-fix steps
- [ ] Cross-issue dependencies stated (which issue blocks which)
- [ ] Labels picked from existing set (`gh label list`), not invented
- [ ] At most one `priority:critical` per batch unless multiple genuine blockers

## Real-World Impact (this project)

Across 18 issues processed in one session:
- Caught 4 working-as-designed reports (saved ~12 unnecessary PRs)
- Identified 3 environmental causes (stale build, missing migration, unlinked account) before any code change
- Spotted 3 regressions of previously-closed issues — root cause was missing regression tests
- Recommended dependency order so foundational work (`useToast`, `PermissionGate`, `useAsyncAction`) landed before adoption work
