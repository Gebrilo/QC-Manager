# Architecture Decision Records

Decisions are numbered sequentially. Each ADR is a short prose description of the decision and the reasoning behind it. See `.claude/skills/grill-with-docs/ADR-FORMAT.md` for the format.

## Index

| ADR | Decision |
|---|---|
| [0001](./0001-lean-action-vocabulary-for-unified-payload.md) | Use a lean action vocabulary (`sync`, `delete`, `reject`, `archive`) for unified Tuleap payloads; non-task actions on a non-task artifact return 400. |
| [0002](./0002-unify-tuleap-intake-via-shared-persisters.md) | Unify Tuleap webhook intake via shared persister services; per-type routes become thin shims, deleted after 7-day no-traffic window. |
| [0003](./0003-api-owned-tuleap-value-normalization.md) | API owns Tuleap value normalization (key resolution + `bind_value_ids` → label) in `services/tuleapValueNormalizer.js`; n8n stays a thin forwarder. |
| [0004](./0004-symmetric-outbound-tuleap-emission.md) | Mirror ADR 0002 on the outbound side: `services/emitters/` + `emitToTuleap()`, all three outbound routes converge, `tuleapPayloadBuilder.js` deleted. |
| [0005](./0005-multi-field-value-maps-on-tracker-config.md) | Replace `tuleap_sync_config.status_value_map` with multi-field `value_maps` JSONB; drop dead `field_mappings` / `status_mappings` columns in same migration. |
| [0006](./0006-qc-uuids-canonical-for-inter-artifact-links.md) | QC UUIDs are canonical for inter-artifact links; Tuleap integer IDs only at the boundary; `pending_links JSONB` for ingest-order races. |
| [0007](./0007-zod-validation-inside-persister-and-emitter.md) | Zod validation runs inside persister/emitter (not middleware); two schemas — strict for ingest+create, `deepPartial` for update. |
| [0008](./0008-no-auto-provisioning-of-tracker-configs.md) | `/unified` does not auto-provision missing tracker configs; admin must explicitly map via Phase 2 settings UI. `provisionTuleapProject()` is removed. |
| [0009](./0009-normalize-task-assignment-primary-and-secondary-resources.md) | Normalize task assignment into a `task_resource_assignment` junction (one primary + many secondaries, per-person effort); migrate `r1_*`/`r2_*` behind a synced cache, port readers, then drop legacy columns. |
| [0010](./0010-matrix-as-runtime-source-of-truth-for-rbac.md) | The permission Matrix (DB: `role_permissions` + `role_scopes`, sparse per-user exceptions) is the runtime source of truth for authorization; the catalog demotes to vocabulary + seed. Drop the fan-out, mint a key for every role-gate, frozen inheritance, two-tier scopes with a terminal-status floor, last-keyholder invariant + break-glass, and a (role × gate) truth-table behind an `RBAC_UNIFIED` kill-switch. |
| [0011](./0011-rbac-scope-collapse-decorative-prune-and-grant-correction.md) | _Amends 0010._ Collapse ownership scope into one dropdown per action (UI-only over the existing suffix keys); prune the `_own` family + all decorative (zero-route) keys; correct built-in grants (PM project-doer via `pm_of_projects`, Viewer/Contributor team reads, broadened delete with local soft-delete decoupled from Tuleap, drop `blockContributors`); one new wired key `qc.bugs.change_severity`; complete the matrix so every enforced domain appears; deliver via a one-shot hard-overwrite migration; verify with a golden-matrix snapshot. |
