# Quickstart: Verifying the Liquid Glass UI

Since this is strictly a presentation-layer visual update without any functional changes to business logic or state, our testing strategy focuses purely on visual regression and aesthetics.

## Local Testing Instructions

1. Start the development server for the web application:
   ```bash
   cd apps/web
   npm run dev
   ```
2. Open your browser to `http://localhost:3000`.

## Visual Verification Checklist

To prove the "Liquid Glass" effect has been safely applied without regression, manually verify the following common components:

- [ ] **Global Background**: Ensure the application background color remains consistent with the original palette but perhaps has a subtle gradient or depth.
- [ ] **Navigation Bar / Header**: Verify the top navigation bar has a frosted glass effect (`backdrop-blur`) and you can faintly see scrolled content passing underneath it.
- [ ] **Data Cards**: Check dashboard metrics or info cards. They should appear to float slightly with soft shadows and translucent backgrounds, not opaque flat colors.
- [ ] **Modals / Dialogs**: Open any settings or confirmation modal. The background overlay should blur the main application, and the modal itself should look polished with rounded corners (`rounded-2xl`) and a distinct shadow.
- [ ] **Buttons & Interactive Elements**: Hover over primary buttons. Ensure the transition is smooth, and focus rings (when using keyboard `Tab`) are clearly visible for accessibility.

## Automated Verification

If Playwright is configured for the `apps/web` project, run the existing E2E or visual regression tests to ensure no core functionality broke:

```bash
cd apps/web
npx playwright test
```
