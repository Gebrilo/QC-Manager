# Implementation Plan: Tooltip Layering Fix

**Branch**: `003-fix-tooltip-layering` | **Date**: 2026-03-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-fix-tooltip-layering/spec.md`

## Summary

The goal is to implement a global, portal-based Tooltip architecture to resolve pervasive z-index, clipping, and overflow issues across the application, especially on the Dashboard. We will use `@radix-ui/react-tooltip` to automatically render tooltips at the root of the document body, ensuring they float above all local stacking contexts and respect viewport bounds via built-in collision detection.

## Technical Context

**Language/Version**: TypeScript 5.9, React 18, Next.js 14
**Primary Dependencies**: TailwindCSS, `@radix-ui/react-tooltip` (to be added)
**Storage**: N/A
**Testing**: Playwright for E2E, visual verification
**Target Platform**: Web (Browser)
**Project Type**: Web Application
**Performance Goals**: Smooth 60fps animations for tooltips, zero layout shift on open.
**Constraints**: Must not break existing layouts or scroll containers; must replace legacy `Tooltip.tsx` seamlessly.
**Scale/Scope**: Global replacement across the entire application frontend.

## Constitution Check

*GATE: Passed*

- **I. Code Quality**: The new Radix UI implementation significantly reduces custom, brittle positioning code in favor of a robust, standard library.
- **III. User Experience Consistency**: Enforces a single global tooltip pattern, ensuring no clipping and consistent alignment behavior platform-wide.

## Project Structure

### Documentation (this feature)

```text
specs/003-fix-tooltip-layering/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
apps/web/src/
├── components/
│   └── ui/
│       └── Tooltip.tsx  # To be rewritten with Radix UI
├── app/
│   └── layout.tsx       # Add global TooltipProvider here
```

**Structure Decision**: A single Next.js web application structure. Changes are localized to the global UI component directory (`apps/web/src/components/ui/`) and the root layout.

## Complexity Tracking

> **No Constitution Check violations. Complexity tracking not required.**
