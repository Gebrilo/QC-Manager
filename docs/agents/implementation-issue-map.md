# Implementation Issue Map

All 26 implementation issues have been published to `Gebrilo/QC-Manager`.

## Phase Mapping

| Phase | Slices | Issues |
| --- | --- | --- |
| Phase 1 - RBAC catalog | 1, 2, 3, 4 | #34, #36, #37, #39 |
| Phase 2 - IA | 5, 6, 7 | #41, #42, #46 |
| Phase 3 - Code structure | 8, 9, 10, 11, 12 | #40, #43, #47, #44, #48 |
| Phase 4a - Route renames + identity rule | 15, 16, 17 | #49, #52, #50 |
| Phase 4b - Domain cleanup | 13, 14, 18 | #35, #38, #45 |
| Net-new - Coverage Links + panels + filters | 19, 20, 21, 22, 23, 24 | #51, #53, #55, #57, #54, #58 |
| Operational housekeeping | 25, 26 | #56, #59 |

## Labels

- 25 AFK slices have `ready-for-agent`.
- Slice 26, issue #59 for n8n re-import, has `ready-for-human`.

## Dependency-Free Starters

Day 1 work can begin on either:

- #34 - RBAC catalog tracer bullet; spine for Phase 1-3.
- #35 - Rename `tuleap_sync_config`; independent Phase 4b track, parallelizable.

## Dependency Notes

- Largest fan-out node: #51, new link tables, unblocks #53, #54, #55. Those unblock #56, #57, #58, which then unblock #59.
- Critical cutover: #56, drain legacy arrays, is the riskiest single deploy because it changes what the Tuleap inbound persister writes. Schedule its merge alongside the n8n re-import in #59.
