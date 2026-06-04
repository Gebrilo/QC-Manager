# Access Enforcement Wiring

Routes should keep the legacy RBAC middleware and add the Access Engine behind a per-artifact feature flag.

Use `services/access/enforcement.js` for route-level wiring:

- List endpoints call `appendListFilter(req, artifactType, where, params, opts)` before composing SQL. Pass table aliases and column overrides when the route uses legacy column names.
- List responses call `shadowList(...)` and then `decorateRows(...)` so each row includes `_can` booleans for row actions.
- Detail, PATCH, and DELETE endpoints load the row first, then call `enforceArtifact(req, res, artifactType, row, verb, opts)`. Return immediately when it denies.
- When the feature flag is off, `enforceArtifact` preserves the legacy result and logs engine disagreements as `audit_log.entity_type = 'shadow_disagreement'`.
- When the feature flag is on, denials return `403` and log `ACCESS_DENIED` with the structured `reason`.

Feature flags use these keys:

- `access_engine.user_stories`
- `access_engine.test_executions`
- `access_engine.test_suites`

The helper treats missing `req.user` as legacy/no-op so focused unit tests that stub auth without a user do not need Access Engine fixtures.
