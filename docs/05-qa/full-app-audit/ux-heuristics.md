# UX Heuristics — Global Checks

These checks apply to **every** page during an audit, on top of page-specific UX checks.

## Page load
- No JavaScript errors in the browser console.
- No failed network requests in the network tab (status < 400).
- First meaningful paint within a reasonable budget.

## Loading state
- Every async section shows a skeleton, spinner, or inline progress affordance while data is loading.
- No "blank flash" — content area should never be empty between navigation and data arrival.

## Empty state
- When a list or chart has zero records, the user sees a helpful placeholder, not raw `0`, `null`, an empty table, or a broken chart.
- Empty states include a primary action where one exists (e.g. "Create your first bug").

## Error state
- Failed API calls surface a visible message (toast or inline banner). Silent failure is a finding.
- The error message is human-readable; never a raw stack trace, JSON dump, or "undefined".
- A retry / refresh affordance exists where it makes sense.

## Validation feedback
- Invalid form inputs show inline messages near the field.
- Validation triggers on blur or submit (not on every keystroke for fields that don't need it).

## Toast lifecycle
- Successful mutations show a success toast within ~1 second.
- Error toasts persist long enough to read (≥ 5 seconds) or are dismissible.
- Toasts don't stack on top of important controls.

## Keyboard navigation
- Every interactive control is reachable via Tab.
- Focus is visually distinct.
- Escape closes modals; Enter submits forms.

## Mobile / narrow viewport
At 375×812 viewport:
- No horizontal page scroll.
- No overlapping controls or cut-off labels.
- Primary actions remain visible / reachable.

## Browser back / forward
- Navigating back from a detail page restores the list's scroll position and applied filters.

## Reload persistence
- Filters and search terms persist across reload if the URL encodes them.

## Stale data
- After creating, editing, or deleting a record, the list / dashboard reflects the change without a manual refresh.

## Accessibility (light pass)
- Color is not the only signal for state.
- Form fields have visible labels.
- Buttons have accessible names (not just an icon with no aria-label).

## Severity mapping for UX findings

| Heuristic violated | Default severity |
| --- | --- |
| JS error on load, failed core API call | `critical` or `high` |
| Empty state shows raw `null` / broken chart | `high` |
| Missing loading state, silent error | `medium` |
| Mobile overlap, toast lifecycle issues, focus styles | `medium` |
| Polish: copy nits, tooltips, minor misalignment | `low` |
