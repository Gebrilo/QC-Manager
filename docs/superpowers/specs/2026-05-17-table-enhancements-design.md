# Table Enhancements: Project Filter, Column Toggle, Wide Title, Hover Tooltip

**Date:** 2026-05-17  
**Status:** Approved  
**Scope:** Test Cases page, Bugs page, Tasks table component

---

## Summary

Four UX improvements applied consistently across Test Cases, Bugs, and Tasks:

1. **Project filter on Test Cases** — mirrors the existing project dropdown on Bugs and Tasks.
2. **Column show/hide toggle** — gear icon dropdown (TanStack Table `VisibilityState`) on Bugs and Test Cases; Tasks already has this.
3. **Wide title column** — title column takes ~35% of table width so long titles are visible without truncation.
4. **Hover tooltip on title** — `SimpleTooltip` popup showing full title + key metadata when hovering the title cell.

---

## Approach

Migrate Bugs and Test Cases from plain HTML tables to `@tanstack/react-table` — the same library already used by `TaskTable.tsx`. This gives column visibility, sorting, and consistent UX for free. Tasks (`TaskTable.tsx`) only needs the title width and tooltip added.

---

## Files Changed

| File | Change |
|---|---|
| `apps/web/app/test/cases/page.tsx` | Add project filter dropdown + convert table to TanStack Table |
| `apps/web/app/work/bugs/page.tsx` | Convert table to TanStack Table (project filter already present) |
| `apps/web/src/components/tasks/TaskTable.tsx` | Widen title column + add hover tooltip |

---

## Feature Details

### 1. Project Filter — Test Cases

- Fetch projects on mount via `projectsApi.list()` (same pattern as Bugs and Tasks pages).
- Add `projectFilter` state; pass as `project_id` to `testCasesApi.list()`.
- Dropdown renders between the search box and the existing status/priority dropdowns.
- Selecting a project resets pagination to page 1.

### 2. Column Visibility Toggle

Both Bugs and Test Cases get a gear icon (⚙) in the top-right of the table section. Hovering opens a dropdown listing all toggleable columns as checkboxes — identical to the existing gear in `TaskTable.tsx`.

**Test Cases — default visibility:**

| Column | Default |
|---|---|
| ID | visible |
| Title | always visible (not toggleable) |
| Type | visible |
| Priority | visible |
| Status | visible |
| Automation | visible |
| Last Result | visible |
| Sync | **hidden** |
| Last Run | visible |
| Actions | always visible (not toggleable) |

**Bugs — default visibility:**

| Column | Default |
|---|---|
| ID | visible |
| Title | always visible (not toggleable) |
| Source | visible |
| Severity | visible |
| Status | visible |
| Project | visible |
| Submitted By | **hidden** |
| Updated By | **hidden** |
| Assigned To | visible |
| Reported | visible |
| Delete (permission-gated) | always visible (not toggleable) |

### 3. Wide Title Column

Title column uses `size: 400` in the column definition (TanStack) combined with a `min-w-[280px]` class on the `<td>`. This makes the title column occupy ~35% of the table width, enough to show most titles without truncation. The `line-clamp-1` / `truncate` class is removed so text wraps naturally up to 2 lines (`line-clamp-2`).

### 4. Hover Tooltip on Title

Uses `SimpleTooltip` from `@/components/ui/Tooltip` wrapping the title text in the cell renderer.

Tooltip content per entity:

- **Test Cases**: `{title} — {description[:150]} | Type: {test_type} | Priority: {priority}`
- **Bugs**: `{title} — Component: {component} | Severity: {severity} | Status: {status}`
- **Tasks**: `{task_name} — Project: {project_name} | Priority: {priority} | Assignee: {resource1_name}`

If a field is absent it is omitted from the tooltip. The tooltip uses `delayDuration={300}` (Radix default).

---

## Column Definition Pattern (reference)

Each converted page follows the `TaskTable.tsx` pattern:

```ts
const columnHelper = createColumnHelper<EntityType>();

const columns = useMemo(() => [
  columnHelper.accessor('id_field', { ... }),
  columnHelper.accessor('title_field', {
    size: 400,
    cell: (info) => (
      <SimpleTooltip content={buildTooltip(info.row.original)} position="top">
        <p className="font-medium line-clamp-2 cursor-default">{info.getValue()}</p>
      </SimpleTooltip>
    ),
  }),
  // ...
], []);
```

---

## Out of Scope

- Board/kanban view for Bugs or Test Cases.
- Persistent column visibility (localStorage) — can be added later if needed.
- Server-side sorting for Bugs/Test Cases — client-side sorting via TanStack is sufficient for current data volumes.
