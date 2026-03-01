# Feature Specification: Tooltip Layering Fix

**Feature Branch**: `003-fix-tooltip-layering`  
**Created**: 2026-03-01  
**Status**: Draft  
**Input**: User description: "I need you to act as a Senior Frontend Architect and UI/UX Planning Expert..."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Tooltips on Dashboard Cards (Priority: P1)

As a user viewing the Dashboard, I need to see tooltips fully rendered above all cards and UI elements when I hover over items, so that I can read the information clearly without it being obscured.

**Why this priority**: Dasboard is the most heavily used page and obscured tooltips prevent users from accessing critical context.

**Independent Test**: Can be fully tested by hovering over all tooltip triggers on the Dashboard and verifying they render on top of adjacent cards.

**Acceptance Scenarios**:

1. **Given** the user is on the Dashboard, **When** they hover over a tooltip trigger within a card, **Then** the tooltip appears completely above the card and any adjacent cards (no clipping or z-index issues).
2. **Given** the user triggers a tooltip near the edge of the screen, **When** the tooltip appears, **Then** it automatically repositions itself to remain fully within the viewport (no overflow).

---

### User Story 2 - Consistent Tooltip Behavior Across Application (Priority: P2)

As a user navigating different modules of the application, I need tooltips to behave consistently, always appearing above content and staying within the screen boundaries.

**Why this priority**: Ensures a polished and reliable UX across the entire application, preventing regressions.

**Independent Test**: Can be tested by verifying tooltip behavior on non-Dashboard pages that use complex layouts or modals.

**Acceptance Scenarios**:

1. **Given** a tooltip trigger inside a modal or complex layout, **When** hovered, **Then** the tooltip renders correctly and above all elements.

### Edge Cases

- What happens when a tooltip is triggered on a very small mobile screen? (It should adjust dynamically, potentially changing position or utilizing an alternative mobile-friendly overlay approach).
- How does the system handle tooltips within scrollable containers? (The solution must ensure they break out of the scroll container's local context).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render tooltips using a mechanism that completely breaks out of local DOM stacking contexts.
- **FR-002**: System MUST implement a global layering priority strategy, assigning tooltips the highest visual priority over all other application layers.
- **FR-003**: System MUST dynamically adjust tooltip positioning to remain fully visible when viewport boundaries are reached.
- **FR-004**: System MUST apply this tooltip architecture globally, replacing any ad-hoc tooltip implementations currently used.
- **FR-005**: System MUST encompass a root cause analysis methodology for developers to verify fixes against existing instances.

### Technical & Architectural Requirements (Requested Technical Plan)

#### Root Cause Analysis Checklist
Identify the root cause of the current tooltips issues by checking:
- [ ] Are tooltips currently rendered inline within `overflow: hidden` or `overflow: auto` containers (causing clipping)?
- [ ] Is there a missing or incorrect z-index value on the tooltip component?
- [ ] Is the tooltip caught in a local stacking context created by a parent element (e.g., a card with `position: relative` and a `z-index`)?
- [ ] Does the current positioning logic lack viewport collision detection (e.g., hardcoded `top` / `left` values)?

#### Recommended Architectural Approach
- **Global Portal Usage**: Render all tooltips into a DOM node at the end of the `body` element using React Portals (or equivalent framework feature). This completely bypasses parent container `overflow` and local stacking context issues.
- **Floating Element Library**: Utilize a robust positioning positioning library (like floating-ui) to manage dynamic positioning, viewport collision detection (flip/shift modifiers), and arrow placement.

#### Z-Index Management Strategy
- Implement a global z-index scale (e.g., in CSS variables or a design system theme file).
- Tooltips must be assigned the highest standard z-index tier (`--z-tooltip: 9999;`), ensuring they always float above modals (`--z-modal: 9000;`), popovers, and sticky headers.

#### CSS / Positioning Best Practices
- Avoid setting `z-index` haphazardly on layout containers across the app.
- Tooltips should use `position: absolute` or `position: fixed` relative to the global portal container.
- Ensure tooltip styling accounts for responsive design (e.g., `max-width` to prevent huge tooltips on narrow screens).

#### Viewport Collision Detection Strategy
- Use collision modifiers:
  - **Flip**: If a tooltip is set to `top` but hits the top of the screen, flip it to `bottom`.
  - **Shift**: If a tooltip hits the side of the screen, slide it along the axis to remain visible.

#### Testing Strategy
- **UI Testing**: Use visual testing to capture tooltip behavior across different breakpoints.
- **Edge Cases**: Test tooltips near all 4 corners of the viewport and inside deep, scrollable nested panels.
- **Component Tests**: Ensure the global Tooltip component correctly forwards refs and handles dynamic content updates.

#### Rollout Plan
1. **Phase 1 (Foundation)**: Implement the new global Tooltip component and context/portal provider.
2. **Phase 2 (Dashboard)**: Refactor the Dashboard to use the new Tooltip component. Verify fix resolves clipping and stacking.
3. **Phase 3 (Global App)**: Incrementally audit and replace legacy tooltips across other modules.

#### Risk Assessment
- **Risk**: Refactoring tooltips globally might break some highly customized edge-case implementations in the app.
  - **Mitigation**: Standardize on the new global tooltip API but allow escape hatches (like custom render sub-components) within the bounds of the new portal architecture. Ensure a phased rollout starting with the Dashboard.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of tooltips on the Dashboard render completely above cards and are entirely visible without being clipped by parent containers.
- **SC-002**: 100% of tooltips tested near viewport edges automatically adjust their position to avoid clipping.
- **SC-003**: The new global tooltip architecture successfully replaces all legacy tooltip instances on the Dashboard in Phase 2.
