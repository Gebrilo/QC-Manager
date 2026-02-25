# Tasks: iOS Liquid Glass UI Refactor

## Prerequisites

- **Implementation Plan**: `specs/001-liquid-glass-ui/plan.md`
- **Specification**: `specs/001-liquid-glass-ui/spec.md`

## Strategy

1. **Setup & Foundation**: Establish the core CSS variables and Tailwind utility classes based on the contract defined in `ui-components.md`.
2. **Phase 1 (User Story 1 - Global Aesthetic Update)**: Apply the new `.glass-*` utilities incrementally to layout components, then cards, then buttons/modals. 
3. **Phase 2 (User Story 2 - Accessibility/Responsiveness)**: Ensure contrast and responsiveness are maintained while making the updates. (Integrated into the styling tasks).
4. **Testing**: Run visual and automated E2E tests to guarantee zero regressions.

---

## Task Checklist

### Phase 1: Setup
- [x] T001 Define precise RGB CSS variables for the color palette in `apps/web/src/app/globals.css`
- [x] T002 Update `tailwind.config.ts` in `apps/web` to use RGB variables with alpha support (`rgb(var(--color-name) / <alpha-value>)`)
- [x] T003 Create `@layer components` abstractions (`.glass-panel`, `.glass-card`, etc.) in `apps/web/src/app/globals.css`

### Phase 2: Foundational (No blocking prerequisites beyond Setup)
*(All required foundational CSS classes are implemented in Phase 1.)*

### Phase 3: Global Aesthetic Update (User Story 1 & 2)
**Goal:** Apply the iOS Liquid Glass visual style across the entire application interface while preserving functional behavior and accessibility.

- [x] T004 [US1] Apply `.glass-panel` to the main navigation bar container in `apps/web/src/components/layout/Header.tsx` (or equivalent header file)
- [x] T005 [P] [US1] Apply `.glass-panel` to the main sidebar container in `apps/web/src/components/layout/Sidebar.tsx` (or equivalent sidebar file)
- [x] T006 [P] [US1] Apply `.glass-card` to metric dashboard cards in the `apps/web` components folder (specific files to be identified via grep)
- [x] T007 [P] [US1] Apply `.glass-card` to task list items and standard data cards in the `apps/web` components folder
- [x] T008 [P] [US1] Apply `.glass-button` to primary interactive buttons globally (specific files to be identified via grep)
- [x] T009 [P] [US1] Apply `.glass-modal` to dialog components ensuring they use the updated blur effects (specific files to be identified via grep)

### Phase 4: Polish & Cross-Cutting Concerns
- [x] T010 Run local server and perform manual visual checks against contrast and "reduced motion" requirements
- [x] T011 Run `npx playwright test` in `apps/web` to verify zero functional regressions

---

## Dependencies

- **Setup** (T001-T003) must be completed sequentially before applying glass effects.
- Items tagged with `[P]` (T005-T009) can be done in parallel once the CSS abstracts are established.

## Parallel Execution Examples

- While Developer A applies the `.glass-card` updates to dashboard metrics (T006), Developer B can apply the `.glass-button` updates to common interactive elements (T008). 
- Modals (T009) and the Sidebar (T005) can be refactored concurrently.
