# Roles & Permissions — Add `page:my-dashboard` to Permission Catalogues

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `page:my-dashboard` visible and toggleable in both the Roles & Permissions page and the Users page so admins can add or remove it per-role and per-user without touching the database manually.

**Architecture:** Two files have hardcoded permission catalogues that gate what appears in the admin UIs. Neither includes `page:my-dashboard` added during the my-dashboard feature. Adding the key to both catalogues is sufficient — the existing toggle/save UI already handles it correctly.

**Tech Stack:** Node/Express (roles.js), Next.js 14 (users/page.tsx), Docker hotfix deploy via `docker cp` + `docker restart`.

---

## Root Cause Summary

| Location | Variable | Missing key |
|---|---|---|
| `apps/api/src/routes/roles.js:8` | `ALL_PERMISSIONS` array | `'page:my-dashboard'` |
| `apps/web/app/users/page.tsx:40` | `ALL_PERMISSIONS` array | `{ key: 'page:my-dashboard', label: 'My Dashboard', group: 'Pages' }` |

**Roles page** (`/settings/roles`) fetches its permission list from `GET /roles/permissions`, which returns `ALL_PERMISSIONS` from `roles.js`. Because `page:my-dashboard` is absent, it never appears as a toggleable pill — and the PATCH endpoint silently strips it as invalid.

**Users page** (`/users`) uses its own hardcoded `ALL_PERMISSIONS` array to render per-user permission toggles. Same gap.

---

## Task 1: Add `page:my-dashboard` to the API permission catalogue

**Files:**
- Modify: `apps/api/src/routes/roles.js:8-13`

- [ ] **Step 1: Edit the ALL_PERMISSIONS array**

In `apps/api/src/routes/roles.js`, find the Pages block (lines 9–13):

```js
// Page permissions
'page:dashboard', 'page:tasks', 'page:projects', 'page:resources',
'page:governance', 'page:test-executions', 'page:reports', 'page:users',
'page:my-tasks', 'page:task-history', 'page:roles', 'page:journeys',
'page:teams', 'page:bugs',
```

Replace with:

```js
// Page permissions
'page:dashboard', 'page:tasks', 'page:projects', 'page:resources',
'page:governance', 'page:test-executions', 'page:reports', 'page:users',
'page:my-tasks', 'page:my-dashboard', 'page:task-history', 'page:roles',
'page:journeys', 'page:teams', 'page:bugs',
```

- [ ] **Step 2: Deploy to running container**

```bash
docker cp apps/api/src/routes/roles.js qc-api:/app/src/routes/roles.js
docker restart qc-api
```

Expected: container restarts and shows `(healthy)` within ~15 seconds.

- [ ] **Step 3: Verify the permission appears in the API response**

```bash
# Wait for healthy, then check the permissions endpoint
docker ps --filter name=qc-api --format "{{.Status}}"
```

Expected output includes `healthy`.

Navigate to `/settings/roles` in the browser, open the **contributor** role card — `My Dashboard` should now appear as a toggleable pill in the **Pages** group.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/roles.js
git commit -m "fix: add page:my-dashboard to ALL_PERMISSIONS catalogue in roles API"
```

---

## Task 2: Add `page:my-dashboard` to the Users page permission list

**Files:**
- Modify: `apps/web/app/users/page.tsx:50-55`

- [ ] **Step 1: Edit the ALL_PERMISSIONS array**

In `apps/web/app/users/page.tsx`, find the Pages block (around line 50–55):

```ts
    { key: 'page:my-tasks', label: 'My Tasks', group: 'Pages' },
    { key: 'page:task-history', label: 'Task History', group: 'Pages' },
```

Insert the new entry between them:

```ts
    { key: 'page:my-tasks', label: 'My Tasks', group: 'Pages' },
    { key: 'page:my-dashboard', label: 'My Dashboard', group: 'Pages' },
    { key: 'page:task-history', label: 'Task History', group: 'Pages' },
```

- [ ] **Step 2: Verify the frontend picks up the change**

The web container runs Next.js dev mode with `./apps/web` volume-mounted — the file edit is live immediately via hot reload. No restart needed.

Hard-refresh (`Ctrl+Shift+R`) the `/users` page, expand any user — **My Dashboard** should now appear as a toggleable permission pill in the **Pages** section.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/users/page.tsx
git commit -m "fix: add page:my-dashboard to Users page permission catalogue"
```

---

## Verification Checklist

After both tasks complete:

- [ ] `/settings/roles` → open **contributor** → Pages group shows **My Dashboard** pill (toggleable, saves correctly)
- [ ] `/settings/roles` → open any other role → **My Dashboard** pill visible and toggleable
- [ ] `/users` → expand any user → Pages section shows **My Dashboard** toggle
- [ ] Toggle **My Dashboard** on/off for a user and confirm it persists (check Network tab — PUT /users/:id/permissions returns 200)
- [ ] PATCH a role's permissions including `page:my-dashboard` — confirm `/roles/permissions` PATCH does not strip it (it was previously filtered as invalid)
