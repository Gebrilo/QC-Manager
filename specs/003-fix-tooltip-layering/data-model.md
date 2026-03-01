# Data Model: Tooltip Layering Fix

This feature primarily focuses on UI component architecture and layering, rather than domain data models. However, the component interface acts as the "data model" for how developers explicitly interact with the Tooltip.

## Components & Interfaces

### `TooltipProps`
The interface for the global UI component.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `children` | `ReactNode` | Yes | The trigger element (e.g., a button or icon). |
| `content` | `ReactNode` \| `string` | Yes | The content to display inside the tooltip. |
| `position` | `'top' \| 'right' \| 'bottom' \| 'left'` | No | Preferred placement (defaults to 'top'). Note: Radix UI calls this `side`. |
| `delayDuration` | `number` | No | Delay in ms before tooltip opens (defaults to 300ms). |
| `className` | `string` | No | Optional extra classes for the tooltip content. |

### Global State / Context
No persistent backend data model changes are required. This is purely a frontend presentation architectural change.
A `TooltipProvider` will be added near the root of the React tree (e.g., in `layout.tsx` or a global providers wrapper) to configure global tooltip behavior (like delay duration).
