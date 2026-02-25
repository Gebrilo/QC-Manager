# Technical Research: iOS Liquid Glass UI Refactor

## 1. Tailwind CSS Glass Pattern Implementation

**Decision**: We will implement the Liquid Glass effect using a combination of Tailwind's backdrop-filter utilities (`backdrop-blur`), translucent background colors (`bg-opacity`), and subtle borders. 

**Rationale**: Tailwind CSS is already the primary styling solution in the `apps/web` project. Utilizing core Tailwind utilities ensures that we don't need to introduce new dependencies, keeps CSS bundle size small, and allows for responsive design adjustments. The iOS glass look relies heavily on the `backdrop-filter: blur()` CSS property which is fully supported by Tailwind (e.g., `backdrop-blur-md`, `bg-white/70`, `border-white/20`).

**Alternatives considered**: 
- *Custom CSS Modules*: Rejected because it breaks away from the established utility-first Tailwind pattern in the codebase.
- *Third-party component libraries (e.g., NextUI, Radix Themes)*: Rejected because the directive strictly prohibits breaking existing logic or introducing massive new dependencies just for a styling update. We must preserve existing component behavior.

## 2. Preserving Existing Color Palette

**Decision**: The existing Tailwind configuration colors will be mapped to a new set of CSS variables that support RGB channels, allowing us to use them with Tailwind's opacity modifier syntax (e.g., `bg-primary/50`).

**Rationale**: To achieve a frosted glass look, we need translucent versions of the existing colors. If the current `tailwind.config.ts` uses hex codes, Tailwind cannot easily apply arbitrary alpha transparency without RGB components. By refactoring the base colors to CSS variables (e.g., `--color-primary: 37 99 235`) and configuring Tailwind to use `rgb(var(--color-primary) / <alpha-value>)`, we can easily create `bg-primary/30` for a tinted glass effect while keeping the exact visual hue.

**Alternatives considered**:
- *Hardcoding translucent hex colors (e.g., `#2563eb80`)*: Rejected because it makes global theming and maintenance difficult and doesn't scale well for varying levels of transparency needed in glass design (shadows vs backgrounds vs borders).

## 3. Reusable Glass Abstraction

**Decision**: We will create a set of reusable Tailwind compound classes (or a base `@layer components` class like `.glass-panel`) in `globals.css` that standardizes the blur radius, border opacity, and shadow depth.

**Rationale**: Scattering `bg-white/60 backdrop-blur-lg border border-white/20 shadow-xl` across 50 different files is fragile and error-prone. Providing a single source of truth (e.g., a `.glass-card` utility class) ensures consistency and makes it easy to tweak the "Liquid Glass" formula globally.

**Alternatives considered**:
- *React HOCs (Higher Order Components)*: Rejected as they introduce unnecessary React tree depth and complicate the preservation of existing component behavior. CSS-based abstraction is much safer.
