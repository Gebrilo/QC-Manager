# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Integrate Supabase Auth to enable multiple authentication providers (Google OAuth, Microsoft OAuth, Phone OTP) alongside existing email/password login. This replaces the bespoke JWT mechanism with standard Supabase Session Tokens, requiring a unified login/register UI and an updated authentication middleware in the API. Provide full backward compatibility for existing email/password users while merging accounts by email (but blocking cross-provider merges to prevent hijacking).

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: React 18 (Next.js App Router) for Web, Node.js 18 (Express) for API
**Primary Dependencies**: `@supabase/supabase-js` (Web & API), `jsonwebtoken` (to be deprecated in API), `@radix-ui` (UI components)
**Storage**: PostgreSQL (Supabase Cloud) via `pg` pool in API
**Testing**: Playwright (E2E), Jest (API unit tests)
**Target Platform**: Web Browsers (Desktop/Mobile)
**Project Type**: Next.js Full-Stack App (Separate Frontend/API)
**Performance Goals**: < 30s for full OAuth login flow; OTP SMS delivery < 60s
**Constraints**: Must seamlessly handle old custom JWT tokens during transition or force re-login; UI must accurately reflect any disabled providers based on `.env`.
**Scale/Scope**: Impacts all 5 user roles globally. Unifies login and registration flows.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Code Quality**: Will use `@supabase/supabase-js` standard practices instead of custom cryptographic hashing/signing, improving maintainability.
- [x] **II. Testing Standards**: Playwright E2E tests will be updated to handle the new unified login page and mock OAuth responses if necessary.
- [x] **III. User Experience Consistency**: Unified login/registration page improves flow.
- [x] **IV. Performance Requirements**: Offloading Auth to Supabase removes intensive `pbkdf2Sync` blocking calls from the Node API thread.
- [x] **Security Constraints**: Supabase Auth brings robust industry-standard JWTs and session management.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# Option 2: Web application
apps/api/
├── src/
│   ├── middleware/
│   │   └── authMiddleware.js # Update to verify Supabase JWTs
│   └── routes/
│       └── auth.js           # Refactor to handle Supabase webhooks/sync or remove legacy login endpoints

apps/web/
├── app/
│   ├── login/
│   │   └── page.tsx          # Rewrite to unified auth view using Supabase Auth UI or custom components
│   └── register/
│       └── page.tsx          # Delete or redirect to /login
├── src/
│   └── components/
│       └── providers/
│           └── AuthProvider.tsx # Rewrite to use Supabase session listener
└── tests/
    └── e2e/
        └── auth.spec.ts      # Update selectors and workflows
```

**Structure Decision**: The feature spans both the `apps/web` (Next.js) and `apps/api` (Express) layers, adapting existing auth components to rely on Supabase as the source of truth.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
