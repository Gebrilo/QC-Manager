# Page: <Human Name>

> **Template usage:** copy this file to `pages/<slug>.md`, replace every `<...>` placeholder, and delete this blockquote.

## Identity

- **Route:** `/<route>`
- **Source files:** `apps/web/app/<path>/page.tsx`, plus key components under `apps/web/src/components/...`
- **API endpoints used:** `GET /endpoint`, `POST /endpoint`, ...
- **Access:** roles permitted (link to `docs/05-qa/ui-role-scenarios/roles/<role>.md` for the RBAC contract)

## Purpose

<One or two sentences: what does a user come to this page to do?>

## Prerequisites

- Logged in as admin (see `../setup.md`).
- Baseline data: <e.g. "≥ 5 bugs across mixed status/severity exist">.
- How to reach the page: <nav path>.

## Control Inventory

Every interactive element on this page. Walk top-to-bottom, left-to-right as a user would scan it.

### <Control name, e.g. "New Bug button">

- **Locator hint:** `role=button name="New Bug"`
- **Expected on action:** <UI change / navigation / toast / API call>
- **Must NOT happen:** <the failure mode that would be a bug>
- **Data check (optional):** `GET /bugs?sort=-created_at` → newest item is the one just created

### <Next control>

...

## Happy Path Scenarios

Numbered end-to-end flows.

### 1. <Scenario name>

1. Click "New Bug".
2. Fill in: title `[AUDIT-YYYY-MM-DD] Test bug`, severity `Medium`, status `New`.
3. Click "Save".
4. **Expected UI:** modal closes, success toast appears, list refreshes.
5. **Expected data:** `GET /bugs?title=[AUDIT-YYYY-MM-DD]` returns 1 row.

### 2. <Next scenario>

...

## Negative / Edge Cases

- **Empty state.** What does the page show when there are zero records?
- **Loading state.** What displays between navigation and data arrival?
- **Error state.** When the API returns 500: expected message and recovery affordance.
- **Permission edge.** Document any control that's admin-only.
- **Known traps:** Pull from `CLAUDE.md` historical incidents.

## UX Checks Specific To This Page

Anything beyond `../ux-heuristics.md`.

## Linked Issues

Open audit-source issues against this page.

| # | Title | Severity | Date filed |
| --- | --- | --- | --- |
| — | — | — | — |
