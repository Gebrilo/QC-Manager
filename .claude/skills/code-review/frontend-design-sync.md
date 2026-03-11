---
name: frontend-design-sync
description: Keep the frontend UI aligned with the latest design system changes. Audit the codebase for current design usage (tokens/components/patterns), detect mismatches, and implement updates in a consistent, token-driven way with a clear compliance report and test plan.
---

## Goal

Ensure the frontend always matches the *current* design system:
- Use the latest **design tokens**, **components**, and **patterns** already adopted in the repo
- Replace ad-hoc / hardcoded styles with approved tokens and shared components
- Keep UI consistent across pages, states, breakpoints, themes, and accessibility requirements
- Produce a clear report + PR-ready plan (and patch suggestions)

## What “latest design” means (Source of Truth Priority)

Use the most authoritative design sources available in this order:

1) In-repo design system packages (tokens/components) and their versions  
2) Storybook (stories, docs, usage guidelines)  
3) Styleguide docs in repo (MD/MDX), UI standards, lint rules  
4) Existing most-used shared components as the standard  
5) PR/ticket notes or screenshots provided by the author (if any)

If external tools like Figma are referenced but not available, proceed with repo truth and list assumptions.

---

## Inputs

- A PR diff, branch, or set of files to review/update
- Optional: design update notes, screenshots, links (if provided)

If inputs are incomplete, still proceed with the repo-based audit and document missing context.

---

## Workflow

### 1) Detect the current design system in use
Identify:
- Token source: CSS variables, JSON tokens, Tailwind config, Theme provider, etc.
- Component library: internal `ui/` package, design system package, or shared component folder
- Styling approach: Tailwind, CSS Modules, styled-components, Emotion, SCSS, etc.
- Theming: light/dark, brand themes, runtime theme switching
- Responsive rules: breakpoints and layout primitives

Commands (use what fits the repo):
- `cat package.json` and search for design system deps
- `rg -n "design-system|tokens|theme|ThemeProvider|tailwind.config|storybook" .`
- `ls src/components src/ui src/design src/styles` (or equivalents)

Output a short “Design System Detection” summary.

### 2) Identify what changed and what UI it impacts
Run:
1. `git diff main...HEAD`
2. `git diff --stat main...HEAD`
3. `git diff --name-status main...HEAD`

Classify changes into:
- Component changes (shared UI)
- Page/feature changes
- Styling/token changes
- Layout/responsive changes
- Accessibility/interaction changes

### 3) Audit design compliance (repo truth)
Check every changed UI area against current design usage.

#### Tokens & Consistency
- No new hardcoded colors, spacing, font sizes, radii, shadows unless explicitly allowed
- Prefer design tokens / theme values / utility classes that map to tokens
- Avoid “one-off” CSS values like `13px`, `#123456`, `margin: 18px` unless it matches a token scale

Practical checks:
- Search for hardcoded colors: `rg -n "#[0-9a-fA-F]{3,8}" src`
- Search for raw pixel usage: `rg -n "(margin|padding|gap|font-size|border-radius):\s*\d+px" src`
- If Tailwind: ensure classes match configured scale and don’t use arbitrary values unless policy allows

#### Components & Patterns
- Use shared components for buttons, inputs, modals, toasts, tables, cards, typography
- Ensure variants match existing patterns (primary/secondary, destructive, size variants)
- Don’t duplicate an existing component behavior; extend/compose instead

#### Interaction States
Confirm states exist and look consistent:
- hover / active / focus-visible
- disabled
- loading
- error/validation
- empty states
- keyboard navigation

#### Responsive Design
- Breakpoints align with system breakpoints
- Layout doesn’t break for narrow widths
- Touch targets reasonable on mobile
- Long text handling (wrap, truncate, overflow)

#### Accessibility
- Semantic HTML first (button vs div)
- Labels, aria attributes when needed (not everywhere)
- Focus rings not removed; use `:focus-visible` patterns
- Color contrast not obviously broken (especially text and disabled)
- Error messages tied to inputs where applicable

### 4) Implement updates in a “design-system first” way
When adapting UI to design changes:
1) Prefer updating/using existing shared components
2) Use tokens (CSS variables/theme) instead of raw values
3) Keep styling localized and consistent with the repo approach
4) Avoid large refactors mixed with UI tweaks (split if necessary)
5) Update stories/tests/docs when changing shared components

Common transformations:
- Replace raw colors with token variables (e.g. `var(--color-text)` / theme palette)
- Replace custom spacing with spacing tokens (e.g. `var(--space-4)` / Tailwind scale)
- Replace custom typography with `Text`/`Typography` component or tokens
- Replace duplicate button/input markup with shared `Button`/`Input` components
- Ensure new UI follows the same layout primitives (Stack, Grid, Container, etc.)

### 5) Validate (tests + visual confidence)
If you can run commands, run the most relevant set:
- Unit tests and lint: `npm test` / `pnpm test`, `npm run lint`
- Typecheck: `npm run typecheck`
- Storybook build (if present): `npm run storybook` or `npm run build-storybook`

If visual regression tooling exists, recommend or run:
- Chromatic / Loki / Playwright screenshot tests (repo-specific)

If you cannot run tests, state that clearly and provide exact commands for the author.

---

## Output Format (always use this structure)

### Design System Detection
- **Tokens:** (where they come from + how they’re applied)
- **Component library:** (shared components path/package)
- **Styling approach:** (Tailwind/CSS Modules/etc.)
- **Breakpoints/theming:** (what exists)

---

### PR Description (ready to paste)

## What
One sentence explaining what this PR does.

## Why
Brief context on why this change is needed.

## Changes
- Bullet points of specific changes made
- Group related changes together
- Mention any files deleted or renamed

---

### Design Compliance Report
**Verdict:** ✅ Aligned / ⚠️ Partially aligned / ⛔ Not aligned  
**Risk level:** Low / Medium / High (1–2 lines)

#### ✅ Matches current design system
- Bullet list of what’s consistent (tokens/components/patterns)

#### ⛔ Must-fix mismatches (blocking)
For each:
- **Where:** `path/to/file` (component/page)
- **Mismatch:** what differs from the system
- **Fix:** concrete steps (prefer tokens/components) + short code snippet if useful

If none, write: “None found.”

#### 🛠️ Suggestions (non-blocking)
Grouped by:
- Tokens (reduce hardcoding)
- Components (reuse/compose)
- Responsive/layout
- A11y and interaction polish
- Cleanup/naming/readability

#### 🧪 Test Plan
- **Executed:** commands + result (or “Not executed”)
- **Recommended:** key UI scenarios to verify (desktop/mobile, states)

#### 📌 “Stay in sync” Follow-ups
- Add/update Storybook stories for changed components (if shared UI changed)
- Add a lint rule / codemod suggestion (if repeated hardcoding appears)
- Document the pattern in repo docs if it’s new

---

## Rules of Thumb (always follow)

- Never invent a new design language: follow what the repo already uses.
- Prefer tokens over hardcoded values.
- Prefer shared components over custom markup.
- Keep interaction + accessibility consistent across the app.
- Separate blocking issues from suggestions.
- If design intent is unclear, infer from existing patterns and list assumptions.

## Quick Red Flags (call out explicitly)
- New hardcoded colors/spacing/font sizes that bypass tokens
- Duplicate button/input/modal implementations
- Missing focus-visible styles or keyboard traps
- Responsive breakpoints inconsistent with the system
- Shared component changes without story/test updates