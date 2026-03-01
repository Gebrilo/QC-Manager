# Quickstart: Tooltip Layering Fix

## Installation
The tooltip layering fix will introduce `@radix-ui/react-tooltip`.
```bash
npm install @radix-ui/react-tooltip
```

## Basic Usage

To use the new global Tooltip component:

```tsx
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/Tooltip';

// 1. Wrap your application or layout in a Provider (usually done once at the root)
<TooltipProvider delayDuration={300}>
  <App />
</TooltipProvider>

// 2. Use the Tooltip anywhere in your app without worrying about clipping or z-index
<Tooltip>
  <TooltipTrigger asChild>
    <button>Hover me</button>
  </TooltipTrigger>
  <TooltipContent side="top">
    This tooltip will always render on top of the screen and adjust if it hits the viewport edge!
  </TooltipContent>
</Tooltip>
```

## Migration from Legacy `Tooltip.tsx`
The old component used `<Tooltip content="text"> <button /> </Tooltip>`. 
You can use the new wrapper component to maintain this simple API:

```tsx
// Legacy wrapper
import { SimpleTooltip } from '@/components/ui/Tooltip';

<SimpleTooltip content="This is simple text" position="top">
    <span>ℹ️</span>
</SimpleTooltip>
```

## Implementation Notes
- Tooltips are rendered into a React Portal at the end of the `<body>`.
- Global z-index for tooltips is set to `50` (via tailwind `z-50`) or higher if required to clear modals.
- Collision detection (flip/shift modifiers) is handled automatically by Radix UI.
