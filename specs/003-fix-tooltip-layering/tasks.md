# Tasks: Tooltip Layering Fix

**Input**: Design documents from `/specs/003-fix-tooltip-layering/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, quickstart.md ✅

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)

---

## Phase 1: Setup

**Purpose**: Install dependencies and configure global infrastructure.

- [x] T001 Install `@radix-ui/react-tooltip` package in `apps/web`
- [x] T002 [P] Add `TooltipProvider` to root layout in `apps/web/app/layout.tsx`

---

## Phase 2: Foundational – Rewrite Global Tooltip Component

**Purpose**: Create the portal-based Tooltip component that all user stories depend on.

**⚠️ CRITICAL**: US1 and US2 both depend on this.

- [x] T003 Rewrite `apps/web/src/components/ui/Tooltip.tsx` with Radix UI primitives (Portal-based, with auto-flip and viewport-collision detection)

**Checkpoint**: ✅ New `Tooltip`, `TooltipTrigger`, `TooltipContent` exports available. Backward-compat `InfoTooltip` and `SimpleTooltip` wrappers exist.

---

## Phase 3: User Story 1 – Dashboard Tooltips (Priority: P1) 🎯 MVP

**Goal**: All tooltips on the Dashboard page render above cards; none are clipped.

**Independent Test**: Hover over every tooltip on the Dashboard and confirm each one renders above the surrounding card.

### Implementation for User Story 1

- [x] T004 [US1] Audit all files under `apps/web/app/dashboard/` and `apps/web/src/components/dashboard/` for any remaining `z-index` or `overflow` issues that could trap tooltips.
- [x] T005 [US1] Migrate any Dashboard-specific ad-hoc `<Tooltip>` usage to the new global component. (No migration needed — all usage was already via `InfoTooltip` which is now portal-backed)

**Checkpoint**: ✅ Dashboard tooltips render correctly on top of all cards (portal escapes all stacking contexts).

---

## Phase 4: User Story 2 – Global Tooltip Consistency (Priority: P2)

**Goal**: All modules across the app use the new portal-based tooltip.

**Independent Test**: Navigate to non-Dashboard pages (Tasks, Role Management, etc.) and confirm tooltips behave correctly inside modals and complex layouts.

### Implementation for User Story 2

- [x] T006 [P] [US2] Audit and migrate tooltip usage in `apps/web/src/components/tasks/` (no legacy usage found)
- [x] T007 [P] [US2] Audit and migrate tooltip usage in all remaining `apps/web/src/components/` subdirectories (`StatCard`, `WorkloadBalanceWidget`, `ResourceStats`, `ResourceUtilizationChart` — all use `InfoTooltip`, now portal-based automatically)

**Checkpoint**: ✅ All modules use the new global Tooltip component.

---

## Phase 5: Polish & Validation

- [x] T008 [P] Verify `apps/web/src/components/ui/Tooltip.tsx` exports are backward-compatible (no broken imports)
- [x] T009 [P] Confirm WCAG accessibility: tooltips must be accessible via keyboard focus (inherits from Radix)
- [x] T010 Run `npm run build` (`npx tsc --noEmit`) in `apps/web` — ✅ zero TypeScript errors

---

## Dependencies & Execution Order

- **Phase 1**: No dependencies – start immediately
- **Phase 2**: Depends on Phase 1 (package must be installed first)
- **Phase 3 & 4**: Both depend on Phase 2 (new component must exist)
- **Phase 5**: Depends on all previous phases

---

## Notes

- [P] tasks = different files, no dependencies between them
- Commit after each phase for clean rollback points
- Avoid ad-hoc `z-50` overrides on layout containers – the portal handles layering
