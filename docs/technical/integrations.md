# Integrations

## Tuleap Integration

Bidirectional artifact sync between Tuleap and QC-Manager.

### Artifact Types Synced

| Type | QC Table | Inbound | Outbound |
|------|----------|---------|----------|
| Bug | `bugs` | Yes | Yes |
| Task | `tasks` | Yes | Yes |
| User Story | `user_stories` | Yes | Yes |
| Test Case | `test_cases` | Yes | Yes |

### Inbound Flow

```
Tuleap → n8n webhook → Unified Payload → API Persister → QC Database
```

- n8n receives raw Tuleap webhook events
- Transforms to Unified Payload format (`{ artifact_type, action, project_id, common, fields, tuleap }`)
- POST to `/api/tuleap-webhook/unified`
- Persister validates with Zod, resolves tracker config, processes action

### Outbound Flow

```
QC UI → API Emitter → Tuleap REST API → Tuleap artifact created/updated
```

- QC user creates/edits artifact in web UI
- API builds Tuleap-compatible payload
- Calls Tuleap REST API with `TULEAP_ACCESS_KEY`
- Stores returned `tuleap_artifact_id` on QC row

### Key Decisions

| ADR | Decision |
|-----|----------|
| 0001 | Lean action vocabulary: sync, delete, reject, archive |
| 0002 | Shared persister services; thin route shims |
| 0003 | API-owned value normalization; n8n is thin forwarder |
| 0004 | Symmetric outbound emission via shared emitters |
| 0005 | Multi-field value_maps JSONB replacing single status_value_map |
| 0006 | QC UUIDs canonical for artifact links; Tuleap IDs at boundary only |
| 0007 | Zod validation inside persisters/emitters, not middleware |
| 0008 | No auto-provisioning of tracker configs |

## n8n Workflow Automation

Self-hosted n8n instance for workflow automation.

### Key Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| Tuleap intake | Webhook | Receive Tuleap events, transform, forward to API |
| Report generation | Schedule or API call | Generate quality reports, email delivery |
| Landing content | Webhook | AI-generated changelog/roadmap content intake |
| Cleanup | Schedule | Database maintenance, stale artifact cleanup |

### Configuration

- Internal URL: `http://qc-n8n:5678`
- Webhook base: `N8N_WEBHOOK_URL` env var
- Empty `N8N_WEBHOOK_URL` → mocks workflow calls in dev

## Supabase

### Services Used

| Service | Purpose | Required |
|---------|---------|----------|
| PostgreSQL | Production application database | Yes |
| Auth | User authentication and session management | Yes |
| Storage | File uploads (attachments, avatars) | Optional |

### Env Variables

| Variable | Required |
|----------|----------|
| `SUPABASE_DATABASE_URL` | Production |
| `SUPABASE_URL` | Yes |
| `SUPABASE_ANON_KEY` | Yes (frontend-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (server-only) |
| `SUPABASE_JWT_SECRET` | Yes (token verification) |

## TestSprite

Webhook integration for test result ingestion.

- Endpoint: `POST /testsprite`
- Purpose: Receive test execution results from TestSprite MCP
- Status: Integrated

## Google Apps Script (Historical)

- Phase 1 integration for Google Sheets sync
- Status: May be deprecated; verify current usage
- Docs: `docs/04-integrations/apps-script-integration.md`
