# Access Enforcement Wiring

Routes should keep the legacy RBAC middleware and add the Access Engine route filters and row guards directly.

Use `services/access/enforcement.js` for route-level wiring:

- List endpoints call `appendListFilter(req, artifactType, where, params, opts)` before composing SQL. Pass table aliases and column overrides when the route uses legacy column names.
- List responses call `decorateRows(...)` so each row includes `_can` booleans for row actions. `shadowList(...)` is a no-op compatibility hook retained for older slice wiring.
- Detail, PATCH, and DELETE endpoints load the row first, then call `enforceArtifact(req, res, artifactType, row, verb, opts)`. Return immediately when it denies.
- Denials return `403` and log `ACCESS_DENIED` with the structured `reason`.

The helper treats missing `req.user` as legacy/no-op so focused unit tests that stub auth without a user do not need Access Engine fixtures.
