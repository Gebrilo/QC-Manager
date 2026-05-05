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
