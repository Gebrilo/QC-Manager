# Research: Tooltip Layering Fix

## Technical Context Unknowns Resolved

### 1. Tooltip Rendering Strategy
- **Decision**: Use `@radix-ui/react-tooltip`.
- **Rationale**: The existing `Tooltip.tsx` uses `relative` wrapper and `absolute` inner div, which inherently traps the tooltip inside parent stacking contexts and gets clipped by `overflow: hidden` or `auto`. `@radix-ui/react-tooltip` automatically renders into a React Portal at the document body, breaking out of all parent containers. It also uses floating-ui under the hood to provide robust collision detection (flip, shift), ensuring the tooltip always stays on screen.
- **Alternatives considered**: 
  - pure `floating-ui` with custom Portal wrapper (requires more boilerplate for accessibility and state management).
  - Just using `position: fixed` without a Portal (still vulnerable to some containing blocks like `transform`, `perspective`, or `filter`).

### 2. Z-Index Management Strategy
- **Decision**: Define a global z-index utility class for tooltips in `tailwind.config.js` or `globals.css` (e.g., `z-[9999]`).
- **Rationale**: Radix UI Portal puts the element at the end of the body, but it still needs a z-index higher than modals/dialogs.
- **Alternatives considered**: Inline styles (harder to maintain).

### 3. State Management & Accessibility
- **Decision**: Rely on Radix UI's built-in state management for hover/focus and ARIA properties.
- **Rationale**: Reduces custom code. Currently `Tooltip.tsx` manually manages `isVisible` with `onMouseEnter`/`onMouseLeave`, missing keyboard accessibility (`onFocus`, `onBlur`).

## Best Practices
- **Portals**: Always use portals for overlying UI elements (tooltips, popovers, modals, dropdowns).
- **Responsive Width**: Use `max-w-[calc(100vw-2rem)]` on the tooltip content to prevent it from being wider than mobile screens.
- **Animations**: Use Tailwind's `data-[state=delayed-open]:animate-in` to animate tooltips smoothly.
