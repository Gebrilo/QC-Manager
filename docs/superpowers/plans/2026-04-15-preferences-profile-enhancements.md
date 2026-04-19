# Preferences & Profile System Enhancements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the Preferences/Profile page with side menu reordering, avatar management, password reset, quick nav parity on My Dashboard, and several UX cleanup items — all respecting RBAC.

**Architecture:** Seven related sub-features all centre on `apps/web/app/preferences/page.tsx`. Preferences are persisted as JSONB on `app_user.preferences` via the existing `PATCH /auth/profile` endpoint — no new preference columns are needed. Side menu order is stored as `menu_order: string[]` inside preferences. Avatar uploads land in the existing `/uploads/avatars/` directory served by Express static middleware; `avatar_url` and `avatar_type` are new columns on `app_user` (single DB migration). Password reset triggers Supabase's built-in reset-email flow directly from the browser — no new API route. The `AuthProvider.refreshUser()` function is called after any preference save so the in-memory user object stays current.

**Tech Stack:** Next.js 14 (App Router), Node/Express API, PostgreSQL JSONB preferences, multer (already in `apps/api/package.json`), HTML5 Drag-and-Drop API (no new npm dependency), Supabase JS browser client for password reset.

---

> **Scope note:** This plan contains 11 tasks across three independent workstreams. You can ship them in slices:
> - **Quick slice (Tasks 1–6):** DB migration + theme cleanup + quick nav parity + personal task count
> - **Nav ordering (Tasks 7–8):** Side menu drag-and-drop reorder
> - **Profile capabilities (Tasks 9–11):** Avatar upload + password reset

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `database/migrations/019_avatar_columns.sql` | Create | Add `avatar_url`, `avatar_type` to `app_user` |
| `apps/web/app/preferences/page.tsx` | Modify | Remove system theme, remove notification_frequency, add nav reorder section, add avatar section, add password section |
| `apps/web/src/components/providers/ThemeProvider.tsx` | Modify | Remove system theme handling |
| `apps/web/src/lib/api.ts` | Modify | Remove `notification_frequency`, add `menu_order`, add `avatarApi` |
| `apps/web/src/components/shared/QuickNavCards.tsx` | Create | Extract QuickNavCards from dashboard-client into shared component |
| `apps/web/app/dashboard/dashboard-client.tsx` | Modify | Use shared QuickNavCards, fix pendingTasks to use personal tasks |
| `apps/web/app/my-dashboard/my-dashboard-client.tsx` | Modify | Add quick_nav_visible preference check + render QuickNavCards |
| `apps/web/src/components/layout/Sidebar.tsx` | Modify | Apply `user.preferences?.menu_order` to sort nav links |
| `apps/api/src/routes/avatar.js` | Create | POST/DELETE `/auth/profile/avatar` |
| `apps/api/src/index.js` | Modify | Register avatar route under `/auth` |

---

## Task 1: DB Migration — Avatar Columns

**Files:**
- Create: `database/migrations/019_avatar_columns.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 019: Avatar storage columns on app_user
-- avatar_url: NULL = no custom avatar (use initials fallback)
-- avatar_type: 'initials' | 'preset' | 'upload'

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS avatar_url  TEXT,
  ADD COLUMN IF NOT EXISTS avatar_type VARCHAR(10)
      CHECK (avatar_type IN ('initials', 'preset', 'upload'))
      DEFAULT 'initials';

COMMENT ON COLUMN app_user.avatar_url  IS 'URL path to avatar image; NULL means use initials';
COMMENT ON COLUMN app_user.avatar_type IS 'initials = generated, preset = built-in icon, upload = user file';
```

- [ ] **Step 2: Register in the migration runner**

Open `apps/api/src/config/db.js` and add `'019_avatar_columns.sql'` to the migrations array (follow the exact pattern used for 018).

- [ ] **Step 3: Verify migration runs cleanly**

```bash
docker restart qc-api && docker logs qc-api --tail 20 | grep -i "019\|migration\|error"
```

Expected: line like `Migration 019_avatar_columns.sql applied` with no ERROR lines.

- [ ] **Step 4: Confirm columns exist**

```bash
docker exec supabase-db psql -U postgres -d postgres -c "\d app_user" | grep avatar
```

Expected: two rows — `avatar_url` (text) and `avatar_type` (character varying).

- [ ] **Step 5: Commit**

```bash
git add database/migrations/019_avatar_columns.sql apps/api/src/config/db.js
git commit -m "feat(db): add avatar_url and avatar_type columns to app_user"
```

---

## Task 2: Remove "System" Theme Option (Feature 2)

**Files:**
- Modify: `apps/web/src/components/providers/ThemeProvider.tsx`
- Modify: `apps/web/app/preferences/page.tsx`

- [ ] **Step 1: Update ThemeProvider type and logic**

In `apps/web/src/components/providers/ThemeProvider.tsx`, apply these changes:

```typescript
// Line 5 — change type
type Theme = 'light' | 'dark';

// Lines 22-32 — remove 'system' branch from init useEffect
useEffect(() => {
    const storedTheme = localStorage.getItem('theme') as Theme | null;
    const storedDensity = localStorage.getItem('density') as Density | null;

    if (storedTheme === 'dark') {
        setTheme('dark');
    } else {
        setTheme('light');
    }

    if (storedDensity) {
        setDensity(storedDensity);
    }
}, []);

// Lines 37-49 — remove 'system' branch from apply useEffect
useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
}, [theme]);

// Lines 56-62 — update toggleTheme (no more 'system')
const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
};

// Lines 70-83 — update inline script (remove system branch)
dangerouslySetInnerHTML={{
    __html: `
        try {
            var t = localStorage.getItem('theme');
            if (t === 'dark') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        } catch (_) {}
    `,
}}
```

- [ ] **Step 2: Update preferences page**

In `apps/web/app/preferences/page.tsx`, apply:

```typescript
// Line 19 — change DEFAULT_PREFS.theme
theme: 'light',

// Lines 165-169 — remove 'system' from theme buttons
{(['light', 'dark'] as const).map(t => (
    <button key={t} onClick={() => { setPrefs({ ...prefs, theme: t }); setTheme(t); }}
        className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${prefs.theme === t ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300 dark:hover:border-slate-600'}`}>
        {t === 'light' ? '☀️ Light' : '🌙 Dark'}
    </button>
))}
```

- [ ] **Step 3: Verify visually**

Open https://gebrils.cloud/preferences — confirm only two theme buttons (Light / Dark). Switch between them, reload the page, confirm the chosen theme persists.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/providers/ThemeProvider.tsx apps/web/app/preferences/page.tsx
git commit -m "feat(preferences): remove System theme option, keep only Light and Dark"
```

---

## Task 3: Remove Notification Frequency Setting (Feature 5)

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/app/preferences/page.tsx`

- [ ] **Step 1: Remove from TypeScript type**

In `apps/web/src/lib/api.ts`, remove the `notification_frequency` line from `UserPreferences`:

```typescript
export interface UserPreferences {
    theme?: 'light' | 'dark';
    quick_nav_visible?: boolean;
    default_page?: string;
    display_density?: 'compact' | 'comfortable';
    timezone?: string;
    language?: string;
    show_profile_to_team?: boolean;
    menu_order?: string[];
}
```

(Also add `menu_order` here to avoid a second edit in Task 7.)

- [ ] **Step 2: Remove from DEFAULT_PREFS and the UI**

In `apps/web/app/preferences/page.tsx`:

```typescript
// DEFAULT_PREFS — remove notification_frequency
const DEFAULT_PREFS: Required<Omit<UserPreferences, 'menu_order'>> = {
    theme: 'light',
    quick_nav_visible: true,
    default_page: '/my-tasks',
    display_density: 'comfortable',
    timezone: 'UTC',
    language: 'en',
    show_profile_to_team: true,
};
```

Then delete the entire `<PrefField label="Notification Email Frequency">` block (the `<select>` with immediate/daily/weekly options).

- [ ] **Step 3: Verify no TypeScript errors**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or only pre-existing ones unrelated to this change).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/app/preferences/page.tsx
git commit -m "feat(preferences): remove email notification frequency setting"
```

---

## Task 4: Extract QuickNavCards to a Shared Component

**Files:**
- Create: `apps/web/src/components/shared/QuickNavCards.tsx`
- Modify: `apps/web/app/dashboard/dashboard-client.tsx`

- [ ] **Step 1: Create the shared component file**

Create `apps/web/src/components/shared/QuickNavCards.tsx` with the full component cut from `dashboard-client.tsx` (lines 335–421):

```typescript
'use client';

import type { AssignedJourney } from '@/lib/api';

export function QuickNavCards({ journeys, pendingTasks }: {
    journeys: AssignedJourney[];
    pendingTasks: number;
}) {
    if (journeys.length === 0 && pendingTasks === 0) return null;

    const statusConfig: Record<string, { label: string; classes: string }> = {
        assigned: { label: 'Not Started', classes: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
        in_progress: { label: 'In Progress', classes: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400' },
        completed: { label: 'Completed', classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' },
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Quick Access</h2>
                <a href="/preferences" className="text-xs text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Manage in Preferences →</a>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {/* Tasks summary card */}
                <a href="/my-tasks"
                    className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all group">
                    <div className="w-10 h-10 rounded-lg bg-violet-50 dark:bg-violet-950 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">My Tasks</p>
                        <p className="text-xs text-slate-400">{pendingTasks} pending</p>
                    </div>
                </a>

                {/* Journey cards */}
                {journeys.slice(0, 6).map(j => {
                    const isLocked = j.is_locked;
                    const cfg = statusConfig[j.status] || statusConfig.assigned;
                    return (
                        <a
                            key={j.id}
                            href={isLocked ? undefined : `/journeys/${j.journey_id}`}
                            onClick={isLocked ? (e) => e.preventDefault() : undefined}
                            className={`bg-white dark:bg-slate-900 border rounded-xl p-4 transition-all group relative ${isLocked ? 'border-slate-200 dark:border-slate-800 opacity-60 cursor-not-allowed' : 'border-slate-200 dark:border-slate-800 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 cursor-pointer'}`}
                        >
                            {isLocked && (
                                <div className="absolute top-3 right-3 flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full">
                                    <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                </div>
                            )}
                            <div className="flex items-center gap-2 mb-2">
                                <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${isLocked ? 'bg-slate-100 dark:bg-slate-800' : 'bg-indigo-50 dark:bg-indigo-950'}`}>
                                    <svg className={`w-3.5 h-3.5 ${isLocked ? 'text-slate-400' : 'text-indigo-600 dark:text-indigo-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                    </svg>
                                </div>
                                {!isLocked && (
                                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${cfg.classes}`}>{cfg.label}</span>
                                )}
                            </div>
                            <p className={`text-sm font-semibold truncate transition-colors ${isLocked ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400'}`}>
                                {j.title}
                            </p>
                            {!isLocked && (
                                <>
                                    <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-2">
                                        <div
                                            className={`h-full rounded-full ${j.status === 'completed' ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                            style={{ width: `${j.progress?.completion_pct ?? 0}%` }}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between mt-1">
                                        <span className="text-xs text-slate-400">{j.progress?.completion_pct ?? 0}%</span>
                                        {(j.total_xp || 0) > 0 && (
                                            <span className="text-xs font-medium text-violet-500">{j.total_xp} XP</span>
                                        )}
                                    </div>
                                </>
                            )}
                            {isLocked && j.lock_reason && (
                                <p className="text-xs text-amber-500 mt-1.5">{j.lock_reason}</p>
                            )}
                        </a>
                    );
                })}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Update dashboard-client to import the shared component**

In `apps/web/app/dashboard/dashboard-client.tsx`:
- Remove the `QuickNavCards` function definition (lines 335–421)
- Add import at the top: `import { QuickNavCards } from '@/components/shared/QuickNavCards';`
- The existing usage at line 176–178 requires no change (props signature unchanged)

- [ ] **Step 3: Verify TypeScript builds**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/shared/QuickNavCards.tsx apps/web/app/dashboard/dashboard-client.tsx
git commit -m "refactor: extract QuickNavCards to shared component"
```

---

## Task 5: Fix Personal Task Pending Count (Feature 4)

**Context:** The QuickNavCards "My Tasks" card links to `/my-tasks` (personal tasks in the `personal_tasks` table). But `dashboard-client.tsx` currently counts _company_ tasks (from `tasksApi.list()`) as the "pending" number. Fix: fetch personal tasks and count those with status `pending` or `in_progress`.

**Files:**
- Modify: `apps/web/app/dashboard/dashboard-client.tsx`

- [ ] **Step 1: Add PersonalTask type**

At the top of `apps/web/app/dashboard/dashboard-client.tsx`, add to the existing import from `@/lib/api`:

```typescript
import { dashboardApi, tasksApi, myJourneysApi, fetchApi, type DashboardMetrics, type Task, type AssignedJourney } from '@/lib/api';

// Add local type for personal task (only needs status field)
interface PersonalTask { id: string; status: 'pending' | 'in_progress' | 'done' | 'cancelled'; }
```

- [ ] **Step 2: Fetch personal tasks in the load function**

Replace the existing `Promise.all` in the `load` callback to add personal tasks:

```typescript
const [tasksData, metricsData, journeyData, meData, personalTasksData] = await Promise.all([
    tasksApi.list().catch(() => []),
    dashboardApi.getMetrics().catch(() => null),
    myJourneysApi.list().catch(() => []),
    fetchApi<{ user: { preferences?: { quick_nav_visible?: boolean } } }>('/auth/me').catch(() => null),
    fetchApi<PersonalTask[]>('/my-tasks').catch(() => [] as PersonalTask[]),
]);
```

- [ ] **Step 3: Use personal task count in QuickNavCards**

Replace line 177 where `pendingTasks` is computed:

```typescript
{showQuickNav && !isLoading && (
    <QuickNavCards
        journeys={journeys}
        pendingTasks={(personalTasksData as PersonalTask[]).filter(
            t => t.status === 'pending' || t.status === 'in_progress'
        ).length}
    />
)}
```

- [ ] **Step 4: Verify count is correct**

Open https://gebrils.cloud/dashboard. The "My Tasks" quick nav card should show the count of personal tasks that are `pending` or `in_progress` (matches what you see at /my-tasks).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/dashboard/dashboard-client.tsx
git commit -m "fix(dashboard): quick nav pending count now uses personal tasks, not company tasks"
```

---

## Task 6: Apply Quick Nav Toggle to My Dashboard (Feature 3)

**Context:** `my-dashboard-client.tsx` doesn't check `quick_nav_visible` at all — the toggle in Preferences only affects `/dashboard`. Fix: add the same preference check and render QuickNavCards when enabled.

**Files:**
- Modify: `apps/web/app/my-dashboard/my-dashboard-client.tsx`

- [ ] **Step 1: Add state and imports**

```typescript
'use client';

import { useEffect, useState, useCallback } from 'react';
import { meDashboardApi, MeDashboard, myJourneysApi, fetchApi, type AssignedJourney } from '@/lib/api';
import { useAuth } from '@/components/providers/AuthProvider';
import { MyStatCards } from '@/components/my-dashboard/MyStatCards';
import { TaskDistributionChart } from '@/components/my-dashboard/TaskDistributionChart';
import { TasksByProjectTable } from '@/components/my-dashboard/TasksByProjectTable';
import { MyBugsTable } from '@/components/my-dashboard/MyBugsTable';
import { QuickNavCards } from '@/components/shared/QuickNavCards';

interface PersonalTask { id: string; status: 'pending' | 'in_progress' | 'done' | 'cancelled'; }
```

- [ ] **Step 2: Add state variables**

Inside `MyDashboardClient()`, add:

```typescript
const [showQuickNav, setShowQuickNav] = useState(true);
const [journeys, setJourneys] = useState<AssignedJourney[]>([]);
const [pendingPersonalTasks, setPendingPersonalTasks] = useState(0);
```

- [ ] **Step 3: Update load() to fetch Quick Nav data**

```typescript
const load = useCallback(async () => {
    try {
        setIsLoading(true);
        setError(null);
        const [result, meData, journeyData, personalTasksData] = await Promise.all([
            meDashboardApi.get(),
            fetchApi<{ user: { preferences?: { quick_nav_visible?: boolean } } }>('/auth/me').catch(() => null),
            myJourneysApi.list().catch(() => [] as AssignedJourney[]),
            fetchApi<PersonalTask[]>('/my-tasks').catch(() => [] as PersonalTask[]),
        ]);
        setData(result);
        if (meData?.user?.preferences?.quick_nav_visible === false) setShowQuickNav(false);
        setJourneys(journeyData);
        setPendingPersonalTasks(
            (personalTasksData as PersonalTask[]).filter(
                t => t.status === 'pending' || t.status === 'in_progress'
            ).length
        );
    } catch (err: any) {
        if (err?.status === 404 || err?.message?.includes('No resource')) {
            setError('no-resource');
        } else {
            setError('generic');
        }
    } finally {
        setIsLoading(false);
    }
}, []);
```

- [ ] **Step 4: Render QuickNavCards in the JSX**

In the return block, add QuickNavCards _before_ `<MyStatCards>`:

```typescript
return (
    <div className="space-y-6 animate-in fade-in duration-700">
        {isAdminOrManager && (
            // ... existing info banner unchanged
        )}

        {showQuickNav && (
            <QuickNavCards journeys={journeys} pendingTasks={pendingPersonalTasks} />
        )}

        <MyStatCards summary={data.summary} />
        {/* rest unchanged */}
    </div>
);
```

- [ ] **Step 5: Verify on both pages**

1. Open https://gebrils.cloud/preferences and toggle Quick Nav Cards **off** → save.
2. Navigate to `/dashboard` — quick nav should be hidden.
3. Navigate to `/my-dashboard` — quick nav should also be hidden.
4. Toggle back **on** → verify it appears on both pages.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/my-dashboard/my-dashboard-client.tsx
git commit -m "feat(my-dashboard): apply quick_nav_visible preference parity with dashboard"
```

---

## Task 7: Side Menu Reordering — Types, API, and Sidebar Rendering (Feature 1)

**Context:** Add `menu_order: string[]` to preferences. When set, the Sidebar sorts nav links to match. Saving happens via the existing `PATCH /auth/profile` endpoint. After save, `refreshUser()` re-hydrates the user object so the sidebar updates.

**Files:**
- Modify: `apps/web/src/lib/api.ts` (already done in Task 3 — `menu_order` was added there)
- Modify: `apps/web/src/components/layout/Sidebar.tsx`
- Modify: `apps/web/src/components/providers/AuthProvider.tsx` (expose `refreshUser` — already exists, just verify it's in the context return)

- [ ] **Step 1: Verify refreshUser is exported from AuthProvider**

In `apps/web/src/components/providers/AuthProvider.tsx`, confirm the context value includes `refreshUser`:

```typescript
// Should already be in the return at the bottom of AuthProvider
return (
    <AuthContext.Provider value={{
        user, permissions, token, loading,
        signInWithPassword, signUp, logout,
        hasPermission, isAdmin, refreshUser,
    }}>
```

If `refreshUser` is missing from the value object, add it now.

- [ ] **Step 2: Apply menu_order in Sidebar**

In `apps/web/src/components/layout/Sidebar.tsx`, change the `navLinks` computation:

```typescript
// Replace existing navLinks computation (lines 17–21)
const rawNavLinks = getNavbarRoutes().filter(route => {
    if (route.requiresActivation && !user.activated) return false;
    if (route.adminOnly && !isAdmin) return false;
    if (route.permission && !hasPermission(route.permission)) return false;
    return true;
});

const menuOrder: string[] = (user.preferences?.menu_order as string[] | undefined) || [];

const navLinks = menuOrder.length > 0
    ? [
        // Items in saved order (filtered to accessible only)
        ...menuOrder
            .map(path => rawNavLinks.find(r => r.path === path))
            .filter((r): r is NonNullable<typeof r> => r != null),
        // Append any accessible routes not in the saved order (new routes added later)
        ...rawNavLinks.filter(r => !menuOrder.includes(r.path)),
    ]
    : rawNavLinks;
```

- [ ] **Step 3: Verify sidebar still renders correctly with no saved order**

Open https://gebrils.cloud — sidebar should look identical to before (no `menu_order` in preferences yet, so `menuOrder.length === 0` branch is used).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/layout/Sidebar.tsx apps/web/src/components/providers/AuthProvider.tsx
git commit -m "feat(sidebar): apply user menu_order preference to nav link ordering"
```

---

## Task 8: Side Menu Reordering — Preferences UI (Feature 1)

**Context:** Add a "Navigation" section to the Preferences page with a drag-and-drop list of accessible nav items. Uses the HTML5 Drag-and-Drop API (no new library). Saves `menu_order` via `profileApi.update({ preferences: { menu_order } })`, then calls `refreshUser()` to update the sidebar immediately.

**Files:**
- Modify: `apps/web/app/preferences/page.tsx`

- [ ] **Step 1: Add imports and state**

At the top of `apps/web/app/preferences/page.tsx`, add:

```typescript
import { useState, useEffect, useMemo, useRef } from 'react';
import { fetchApi, profileApi, UserPreferences } from '../../src/lib/api';
import { useTheme } from '../../src/components/providers/ThemeProvider';
import { useAuth } from '../../src/components/providers/AuthProvider';
import { getRouteConfig, getNavbarRoutes } from '../../src/config/routes';
```

Inside `PreferencesPage()`, add state for nav ordering:

```typescript
const { refreshUser } = useAuth();

// Build the list of nav routes this user can access
const accessibleNavRoutes = useMemo(() => {
    return getNavbarRoutes().filter(route => {
        if (route.adminOnly && !isAdmin) return false;
        if (route.requiresActivation && !authUser?.activated) return false;
        if (route.permission && !hasPermission(route.permission)) return false;
        return true;
    });
}, [isAdmin, authUser, hasPermission]);

const [menuOrder, setMenuOrder] = useState<string[]>([]);
const [navSaving, setNavSaving] = useState(false);
const [navMsg, setNavMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
```

- [ ] **Step 2: Initialise menuOrder from profile**

In the existing `useEffect` that fetches `/auth/me`, after setting `prefs`, add:

```typescript
const savedOrder: string[] = data.user.preferences?.menu_order || [];
// Build ordered list: saved order first, then any new accessible routes appended
const initialOrder = [
    ...savedOrder.filter(p => accessibleNavRoutes.some(r => r.path === p)),
    ...accessibleNavRoutes
        .map(r => r.path)
        .filter(p => !savedOrder.includes(p)),
];
setMenuOrder(initialOrder);
```

Note: this `useEffect` currently doesn't have `accessibleNavRoutes` in its deps. Add it:

```typescript
useEffect(() => {
    fetchApi<{ user: UserProfile }>('/auth/me')
        // ...
}, [accessibleNavRoutes]);  // add accessibleNavRoutes
```

- [ ] **Step 3: Add the drag-and-drop save function**

```typescript
const saveNavOrder = async () => {
    setNavSaving(true);
    setNavMsg(null);
    try {
        await profileApi.update({ preferences: { menu_order: menuOrder } });
        await refreshUser();
        setNavMsg({ type: 'success', text: 'Navigation order saved!' });
    } catch (err: any) {
        setNavMsg({ type: 'error', text: err.message || 'Failed to save' });
    } finally {
        setNavSaving(false); }
};
```

- [ ] **Step 4: Add the drag handlers**

```typescript
const handleDragStart = (idx: number) => setDraggingIdx(idx);

const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
};

const handleDrop = (idx: number) => {
    if (draggingIdx === null || draggingIdx === idx) {
        setDraggingIdx(null);
        setDragOverIdx(null);
        return;
    }
    const next = [...menuOrder];
    const [moved] = next.splice(draggingIdx, 1);
    next.splice(idx, 0, moved);
    setMenuOrder(next);
    setDraggingIdx(null);
    setDragOverIdx(null);
};

const handleDragEnd = () => {
    setDraggingIdx(null);
    setDragOverIdx(null);
};
```

- [ ] **Step 5: Add the Navigation section JSX**

Add this `PrefSection` block after the "UI Preferences" section and before the closing `</div>`:

```tsx
{/* ── Navigation Order ── */}
<PrefSection title="Navigation Order" icon="☰">
    <div className="space-y-4">
        <p className="text-xs text-slate-500 dark:text-slate-400">
            Drag items to reorder the side navigation. Changes only affect items you have access to.
        </p>
        <ul className="space-y-1.5">
            {menuOrder.map((path, idx) => {
                const route = accessibleNavRoutes.find(r => r.path === path);
                if (!route) return null;
                const Icon = route.icon;
                return (
                    <li
                        key={path}
                        draggable
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDrop={() => handleDrop(idx)}
                        onDragEnd={handleDragEnd}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border select-none cursor-grab active:cursor-grabbing transition-all ${
                            draggingIdx === idx
                                ? 'opacity-40 border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/30'
                                : dragOverIdx === idx
                                    ? 'border-indigo-400 dark:border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20'
                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                    >
                        <svg className="w-4 h-4 text-slate-300 dark:text-slate-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                        </svg>
                        {Icon && <Icon className="w-4 h-4 text-slate-500 dark:text-slate-400 flex-shrink-0" strokeWidth={1.75} />}
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{route.label}</span>
                    </li>
                );
            })}
        </ul>
        {navMsg && <Msg {...navMsg} />}
        <button onClick={saveNavOrder} disabled={navSaving} className={btnPrimary}>
            {navSaving ? 'Saving…' : 'Save Navigation Order'}
        </button>
    </div>
</PrefSection>
```

- [ ] **Step 6: Test the drag-and-drop**

1. Open https://gebrils.cloud/preferences.
2. Drag a nav item to a new position.
3. Click "Save Navigation Order".
4. Check the sidebar — items should reflect the new order immediately (after `refreshUser()` fires).
5. Reload the page — order should persist.

- [ ] **Step 7: Test RBAC edge case**

Log in as a user without `page:dashboard` permission. Verify:
- "Dashboard" does not appear in the navigation order list.
- Even if someone manually POSTes `{ preferences: { menu_order: ['/dashboard', ...] } }`, the sidebar filters it out via `accessibleNavRoutes.find()`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/preferences/page.tsx
git commit -m "feat(preferences): add drag-and-drop side navigation reordering"
```

---

## Task 9: Avatar Upload — Backend (Feature 7a)

**Context:** Avatars are uploaded via `POST /auth/profile/avatar` (multipart/form-data). multer saves the file to `apps/api/uploads/avatars/`. The endpoint updates `avatar_url` and `avatar_type` on `app_user`. `DELETE /auth/profile/avatar` resets to initials. Files are already served at `/uploads/` by Express static middleware in `index.js`.

**Files:**
- Create: `apps/api/src/routes/avatar.js`
- Modify: `apps/api/src/index.js`

- [ ] **Step 1: Write a test for POST /auth/profile/avatar**

Create `apps/api/__tests__/avatar.upload.test.js`:

```javascript
const request = require('supertest');
const path = require('path');
const fs = require('fs');

jest.mock('../src/config/db', () => require('./helpers/mockPool'));
jest.mock('../src/middleware/authMiddleware', () => ({
    requireAuth: (req, _res, next) => { req.user = { id: 'user-1' }; next(); },
}));

const { createTestApp } = require('./helpers/testApp');

describe('POST /auth/profile/avatar', () => {
    let app;
    beforeAll(() => { app = createTestApp('/auth', require('../src/routes/avatar')); });

    it('rejects non-image files', async () => {
        const res = await request(app)
            .post('/auth/profile/avatar')
            .attach('avatar', Buffer.from('not an image'), { filename: 'bad.pdf', contentType: 'application/pdf' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/image/i);
    });

    it('rejects files over 2MB', async () => {
        const bigBuffer = Buffer.alloc(2.1 * 1024 * 1024);
        const res = await request(app)
            .post('/auth/profile/avatar')
            .attach('avatar', bigBuffer, { filename: 'big.jpg', contentType: 'image/jpeg' });
        expect(res.status).toBe(400);
    });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd apps/api && npx jest avatar.upload --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module '../src/routes/avatar'`

- [ ] **Step 3: Create the avatar route**

Create `apps/api/src/routes/avatar.js`:

```javascript
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const { requireAuth } = require('../middleware/authMiddleware');

const AVATARS_DIR = path.join(__dirname, '..', '..', 'uploads', 'avatars');

// Ensure directory exists at startup
if (!fs.existsSync(AVATARS_DIR)) {
    fs.mkdirSync(AVATARS_DIR, { recursive: true });
}

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, AVATARS_DIR),
    filename: (req, _file, cb) => {
        // Deterministic name per user: avatar-<userId>.<ext>
        // This overwrites the previous upload automatically (no orphaned files)
        const ext = _file.mimetype === 'image/png' ? 'png'
                  : _file.mimetype === 'image/gif' ? 'gif'
                  : _file.mimetype === 'image/webp' ? 'webp'
                  : 'jpg';
        cb(null, `avatar-${req.user.id}.${ext}`);
    },
});

const fileFilter = (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (jpg, png, gif, webp) are allowed'));
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_SIZE_BYTES },
});

// POST /auth/profile/avatar
router.post('/avatar', requireAuth, (req, res, next) => {
    upload.single('avatar')(req, res, async (err) => {
        if (err) {
            const status = err.code === 'LIMIT_FILE_SIZE' ? 400 : 400;
            return res.status(status).json({ error: err.message || 'Upload failed' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const avatarUrl = `/uploads/avatars/${req.file.filename}`;

        try {
            await db.query(
                'UPDATE app_user SET avatar_url = $1, avatar_type = $2, updated_at = NOW() WHERE id = $3',
                [avatarUrl, 'upload', req.user.id]
            );
            res.json({ avatar_url: avatarUrl, avatar_type: 'upload' });
        } catch (dbErr) {
            // Clean up the uploaded file on DB failure
            fs.unlink(req.file.path, () => {});
            next(dbErr);
        }
    });
});

// DELETE /auth/profile/avatar — reset to initials
router.delete('/avatar', requireAuth, async (req, res, next) => {
    try {
        // Fetch current avatar to remove file
        const result = await db.query(
            'SELECT avatar_url FROM app_user WHERE id = $1',
            [req.user.id]
        );
        const current = result.rows[0]?.avatar_url;
        if (current && current.startsWith('/uploads/avatars/')) {
            const filePath = path.join(__dirname, '..', '..', current.replace('/uploads/', 'uploads/'));
            fs.unlink(filePath, () => {}); // ignore if already gone
        }

        await db.query(
            'UPDATE app_user SET avatar_url = NULL, avatar_type = $1, updated_at = NOW() WHERE id = $2',
            ['initials', req.user.id]
        );
        res.json({ avatar_url: null, avatar_type: 'initials' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
```

- [ ] **Step 4: Register the avatar route**

In `apps/api/src/index.js`, add after the `/auth` line:

```javascript
// Existing line:
apiRouter.use('/auth', require('./routes/auth'));
// Add:
apiRouter.use('/auth/profile', require('./routes/avatar'));
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd apps/api && npx jest avatar.upload --no-coverage 2>&1 | tail -20
```

Expected: PASS — 2 tests passing.

- [ ] **Step 6: Update `GET /auth/me` to return avatar fields**

In `apps/api/src/routes/auth.js`, update the SELECT in the `/me` handler to include `avatar_url, avatar_type`:

```javascript
const result = await db.query(
    `SELECT id, name, display_name, email, phone, role, active, activated,
            onboarding_completed, preferences, avatar_url, avatar_type,
            created_at, last_login
     FROM app_user WHERE id = $1`,
    [req.user.id]
);
```

Also update `PATCH /auth/profile` RETURNING clause:

```javascript
RETURNING id, name, display_name, email, role, preferences, avatar_url, avatar_type
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/avatar.js apps/api/src/index.js apps/api/src/routes/auth.js apps/api/__tests__/avatar.upload.test.js
git commit -m "feat(api): add avatar upload and delete endpoints"
```

---

## Task 10: Avatar Upload — Frontend (Feature 7a)

**Context:** The Profile section in Preferences gets a new Avatar picker. It shows: (a) current avatar or initials circle, (b) an "Upload Photo" button, (c) a "Remove" button if a custom avatar exists. No preset icons are included (they add complexity with no clear value; initials remain the default).

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/app/preferences/page.tsx`

- [ ] **Step 1: Add avatarApi to api.ts**

In `apps/web/src/lib/api.ts`, after `profileApi`:

```typescript
export const avatarApi = {
    upload: async (file: File): Promise<{ avatar_url: string; avatar_type: string }> => {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.gebrils.cloud';
        const { supabase } = await import('./supabase');
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || '';

        const form = new FormData();
        form.append('avatar', file);

        const res = await fetch(`${API_URL}/auth/profile/avatar`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: form,
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Upload failed');
        }
        return res.json();
    },

    remove: (): Promise<{ avatar_url: null; avatar_type: string }> =>
        fetchApi('/auth/profile/avatar', { method: 'DELETE' }),
};
```

- [ ] **Step 2: Extend UserProfile interface in preferences page**

In `apps/web/app/preferences/page.tsx`, update `UserProfile`:

```typescript
interface UserProfile {
    id: string;
    name: string;
    display_name: string | null;
    email: string;
    role: string;
    preferences: UserPreferences;
    avatar_url: string | null;
    avatar_type: 'initials' | 'preset' | 'upload' | null;
}
```

- [ ] **Step 3: Add avatar state**

Inside `PreferencesPage()`, add:

```typescript
const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
const [avatarSaving, setAvatarSaving] = useState(false);
const [avatarMsg, setAvatarMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
const fileInputRef = useRef<HTMLInputElement>(null);
```

In the existing `useEffect` that fetches `/auth/me`, also set avatar:

```typescript
setAvatarUrl(data.user.avatar_url || null);
```

- [ ] **Step 4: Add avatar handlers**

```typescript
const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
        setAvatarMsg({ type: 'error', text: 'Only JPG, PNG, GIF, or WebP images are allowed.' });
        return;
    }
    if (file.size > 2 * 1024 * 1024) {
        setAvatarMsg({ type: 'error', text: 'Image must be under 2 MB.' });
        return;
    }

    setAvatarSaving(true);
    setAvatarMsg(null);
    try {
        const { avatarApi } = await import('../../src/lib/api');
        const result = await avatarApi.upload(file);
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.gebrils.cloud';
        setAvatarUrl(`${apiUrl}${result.avatar_url}`);
        await refreshUser();
        setAvatarMsg({ type: 'success', text: 'Avatar updated!' });
    } catch (err: any) {
        setAvatarMsg({ type: 'error', text: err.message || 'Upload failed.' });
    } finally {
        setAvatarSaving(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
};

const handleAvatarRemove = async () => {
    setAvatarSaving(true);
    setAvatarMsg(null);
    try {
        const { avatarApi } = await import('../../src/lib/api');
        await avatarApi.remove();
        setAvatarUrl(null);
        await refreshUser();
        setAvatarMsg({ type: 'success', text: 'Avatar removed.' });
    } catch (err: any) {
        setAvatarMsg({ type: 'error', text: err.message || 'Failed to remove avatar.' });
    } finally {
        setAvatarSaving(false); }
};
```

- [ ] **Step 5: Replace the existing avatar circle in the Profile section JSX**

Replace the static avatar `div` (the `w-14 h-14` circle) with:

```tsx
<div className="flex items-center gap-4 mb-2">
    {/* Avatar display */}
    {avatarUrl ? (
        <img
            src={avatarUrl}
            alt="Profile avatar"
            className="w-14 h-14 rounded-full object-cover flex-shrink-0 border-2 border-slate-200 dark:border-slate-700"
        />
    ) : (
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
            {(displayName || profile?.name || '?').charAt(0).toUpperCase()}
        </div>
    )}
    <div className="space-y-1">
        <p className="font-semibold text-slate-900 dark:text-white">{profile?.name}</p>
        <p className="text-xs text-slate-400 capitalize">{profile?.role}</p>
        <div className="flex items-center gap-2 mt-2">
            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleAvatarUpload}
            />
            <button
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarSaving}
                className="text-xs px-2.5 py-1 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-400 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors disabled:opacity-50"
            >
                {avatarSaving ? 'Uploading…' : 'Upload Photo'}
            </button>
            {avatarUrl && (
                <button
                    onClick={handleAvatarRemove}
                    disabled={avatarSaving}
                    className="text-xs px-2.5 py-1 border border-red-200 dark:border-red-900 rounded-lg text-red-500 hover:border-red-400 transition-colors disabled:opacity-50"
                >
                    Remove
                </button>
            )}
        </div>
        {avatarMsg && <Msg {...avatarMsg} />}
    </div>
</div>
```

- [ ] **Step 6: Test avatar flow**

1. Open https://gebrils.cloud/preferences.
2. Click "Upload Photo" — select a valid JPG. Verify the avatar updates immediately.
3. Reload the page — avatar persists.
4. Click "Remove" — reverts to initials circle.
5. Try uploading a PDF — verify error message "Only JPG, PNG, GIF, or WebP images are allowed."
6. Try uploading a file > 2 MB — verify error message "Image must be under 2 MB."

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/app/preferences/page.tsx
git commit -m "feat(preferences): add avatar upload and remove with client-side validation"
```

---

## Task 11: Password / Security Section (Feature 7b)

**Context:** The app uses Supabase magic links — users may not have a traditional password. The safest cross-provider approach is to trigger Supabase's `resetPasswordForEmail` flow. This sends the user a secure link to `/auth/reset-password` (already configured) where they can set or change their password. No current-password field needed; the Supabase session acts as the auth proof.

**Files:**
- Modify: `apps/web/app/preferences/page.tsx`

- [ ] **Step 1: Add security state**

Inside `PreferencesPage()`, add:

```typescript
const [pwSending, setPwSending] = useState(false);
const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
```

- [ ] **Step 2: Add the send-reset handler**

```typescript
const sendPasswordReset = async () => {
    if (!profile?.email) {
        setPwMsg({ type: 'error', text: 'No email on file for this account.' });
        return;
    }
    setPwSending(true);
    setPwMsg(null);
    try {
        const { supabase } = await import('../../src/lib/supabase');
        const redirectTo = `${window.location.origin}/auth/reset-password`;
        const { error } = await supabase.auth.resetPasswordForEmail(profile.email, { redirectTo });
        if (error) throw error;
        setPwMsg({ type: 'success', text: `Password reset link sent to ${profile.email}` });
    } catch (err: any) {
        setPwMsg({ type: 'error', text: err.message || 'Failed to send reset email.' });
    } finally {
        setPwSending(false); }
};
```

- [ ] **Step 3: Add the Security section JSX**

Add this `PrefSection` block at the end of the page, just before the closing `</div>`:

```tsx
{/* ── Security ── */}
<PrefSection title="Security" icon="🔒">
    <div className="space-y-4">
        <div>
            <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">Change Password</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                We&apos;ll send a secure link to <strong>{profile?.email}</strong> to set or update your password.
            </p>
        </div>
        {pwMsg && <Msg {...pwMsg} />}
        <button
            onClick={sendPasswordReset}
            disabled={pwSending}
            className={btnPrimary}
        >
            {pwSending ? 'Sending…' : 'Send Password Reset Link'}
        </button>
    </div>
</PrefSection>
```

- [ ] **Step 4: Test the password reset flow**

1. Open https://gebrils.cloud/preferences.
2. Scroll to the Security section — verify the user's email is shown.
3. Click "Send Password Reset Link".
4. Verify success message appears and an email is received at the configured address.
5. Follow the link in the email — verify it loads `/auth/reset-password` correctly.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/preferences/page.tsx
git commit -m "feat(preferences): add password reset via email link in Security section"
```

---

## QA Test Scenarios

### Theme (Task 2)
- **Happy:** Select Light → reload → Light persists.
- **Happy:** Select Dark → reload → Dark persists.
- **Edge:** User had `theme: 'system'` saved in JSONB. After Task 2, DEFAULT_PREFS.theme is 'light' but the saved value is still 'system'. Verify `ThemeProvider` gracefully falls back to 'light' when `localStorage.getItem('theme')` returns `'system'` (the new init `useEffect` checks for `=== 'dark'`, so 'system' falls through to 'light' — correct).

### Quick Nav Toggle (Tasks 4–6)
- **Happy:** Toggle off → Save → both `/dashboard` and `/my-dashboard` hide QuickNavCards.
- **Happy:** Toggle on → Save → both pages show QuickNavCards.
- **Edge:** User with no journeys and 0 personal tasks → QuickNavCards returns `null` (guarded by `journeys.length === 0 && pendingTasks === 0`).

### Personal Task Count (Task 5)
- **Happy:** User has 3 personal tasks (2 pending, 1 done) → Quick Nav shows "2 pending".
- **Edge:** Personal tasks API returns 403 (no permission) → `catch(() => [])` returns empty array → shows "0 pending" gracefully.

### Side Menu Reorder (Tasks 7–8)
- **Happy:** Drag item, save → sidebar reflects new order immediately and after reload.
- **RBAC:** Contributor user can only reorder items they have access to — admin-only routes don't appear in the list.
- **Edge:** New route added to `ROUTES` after user saved their order → new route appended at end of sidebar (handled by the "append unlisted accessible routes" logic in Sidebar.tsx).
- **Edge:** 20+ menu items — drag-and-drop list remains usable (scrolls within the preferences card).

### Avatar Upload (Tasks 9–10)
- **Happy:** Upload 1 MB JPG → avatar appears, persists after reload.
- **Happy:** Remove avatar → reverts to initials letter.
- **Error:** Upload PDF → client rejects with "Only JPG, PNG, GIF, or WebP" before any network call.
- **Error:** Upload 3 MB image → client rejects with "Image must be under 2 MB".
- **Security:** Attempt to path-traverse via filename (e.g. `../../etc/passwd`) → multer `diskStorage.filename` generates a deterministic `avatar-<userId>.jpg` name, ignoring the original filename.

### Password Reset (Task 11)
- **Happy:** User clicks "Send Password Reset Link" → success message → email arrives → link loads `/auth/reset-password`.
- **Edge:** User account has no email (phone-only) → button shows error "No email on file for this account."
- **Edge:** Supabase rate-limits the reset email → Supabase returns an error → shown as error message.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `system` saved in DB is not cleaned up | Low — ThemeProvider gracefully falls back to 'light' | No migration needed; fallback handles it |
| Avatar file deletion fails silently | Low — old file orphaned in `/uploads/avatars/` | `fs.unlink()` errors are ignored; add a periodic cleanup script if storage grows |
| menu_order contains a path from a role the user no longer has | Low — sidebar `accessibleNavRoutes.find()` returns undefined; `filter` removes it | Handled in Task 7 Sidebar code |
| multer `LIMIT_FILE_SIZE` returns a different error code than expected | Medium — file not rejected | Tested in Task 9 Step 2 |
| Supabase password reset email goes to spam | Low UX impact | Instruct users to check spam; no code fix |
| ThemeProvider `system` branch still exists and is tested elsewhere | Low | Full removal in Task 2 covers both init and apply useEffects |
