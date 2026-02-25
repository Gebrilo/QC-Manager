# Internal UI Contracts: Liquid Glass Design System

This document outlines the CSS contracts and reusable utility classes that will be introduced in the `apps/web/src/app/globals.css` file to standardize the Liquid Glass look without breaking existing markup structures.

## 1. Global CSS Variables Contract

The `tailwind.config.ts` will rely on these root variables. Existing Hex colors will be converted to RGB triplets.

```css
:root {
  /* Existing theme colors converted to RGB for transparency support */
  --color-primary: 37 99 235; /* Example values */
  --color-secondary: 100 116 139;
  --color-background: 248 250 252;
  --color-surface: 255 255 255;
  
  /* Liquid Glass Base Variables */
  --glass-blur: 12px;
  --glass-opacity-bg: 0.7;
  --glass-opacity-border: 0.2;
}
```

## 2. Reusable Utility Classes Contract

Instead of applying 5-6 utility classes everywhere, the following compound classes will be created in `@layer components`:

- `.glass-panel`: Applied to main layout containers (sidebars, navbars).
  - *Contract*: `bg-surface/70 backdrop-blur-md border-b/r border-surface/20`
- `.glass-card`: Applied to data cards, widgets, and form containers.
  - *Contract*: `bg-surface/60 backdrop-blur-sm rounded-xl border border-surface/30 shadow-[0_4px_30px_rgba(0,0,0,0.1)]`
- `.glass-button`: Applied to interactive buttons.
  - *Contract*: `bg-primary/80 hover:bg-primary/90 backdrop-blur-md text-white transition-all duration-200`
- `.glass-modal`: Applied to dialogs and popovers.
  - *Contract*: `bg-surface/80 backdrop-blur-lg border border-surface/40 shadow-2xl rounded-2xl`
