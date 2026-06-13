# GitHub Release → Changelog (n8n workflow) — design

Date: 2026-06-13
Status: Built (imported into n8n, inactive)

## Goal

When a GitHub Release is published on `Gebrilo/QC-Manager`, turn its notes into a
changelog entry and post it (as a **draft**) to the QC Manager landing-content
webhook, so an admin can review and publish it at `/admin/landing-config`.

## Decisions (from brainstorming)

- **Trigger / source:** GitHub Release → its release notes.
- **Ingest:** GitHub repo webhook (event: Releases) → an n8n Webhook node. No
  GitHub token stored in n8n; mirrors the existing Tuleap webhook workflows.
- **AI:** "decide later" — the pipeline runs deterministically today; an AI
  summarization step is pre-wired but **disabled**, ready to enable once an LLM
  provider/key is chosen (Approach A).
- **Publish mode:** draft (`is_published: false`).

## Flow

`Webhook (GitHub release)` → `Build changelog (Code)` → *`AI Summarize` (disabled)*
→ *`Apply AI result` (disabled)* → `Post draft to QC Manager`

The webhook uses `responseMode: onReceived` (instant 200 ack to GitHub; the rest
runs async). No respond node needed.

### Nodes

1. **Webhook: GitHub Release** — `n8n-nodes-base.webhook` v2, POST, path
   `github-release-changelog`.
2. **Build changelog** — `code` v2. Parses JSON or form-encoded GitHub payloads;
   returns `[]` (stops) unless `action === "published"` and the release isn't a
   draft. Derives `version_number` (tag, ≤50), `title` (name||tag, ≤255),
   `content_markdown` (release body, minus the auto "**Full Changelog**" line,
   truncated to 20000), `source: "github"`,
   `source_reference: "github-release-<id>"`, `is_published: false`,
   `generated_by_ai: false`.
3. **AI Summarize (disabled)** — `httpRequest` v4.2 → Anthropic Messages API
   (`POST https://api.anthropic.com/v1/messages`, headers `x-api-key:
   {{$env.ANTHROPIC_API_KEY}}` + `anthropic-version: 2023-06-01`, model
   `claude-haiku-4-5` by default). Passthrough while disabled.
4. **Apply AI result (disabled)** — `code` v2. Merges the Anthropic response text
   into `content_markdown` (referencing `$('Build changelog')`) and sets
   `generated_by_ai: true`. Passthrough while disabled.
5. **Post draft to QC Manager** — `httpRequest` v4.2 → internal
   `http://qc-api:3001/webhooks/landing-content/changelog`, header
   `x-qc-agent-secret: {{$env.QC_AGENT_WEBHOOK_SECRET}}`, body from `$json`.

## Operational notes

- **Security:** the n8n webhook URL is public; it only creates *drafts*, so v1
  relies on the unguessable URL. Optional hardening: add a GitHub webhook secret
  + an HMAC-verification Code node (not built in v1).
- **Idempotency:** the changelog API plain-INSERTs (no dedup), so a GitHub
  redelivery could create a duplicate draft. Low harm (admin deletes one).
- **Enable AI later:** add `ANTHROPIC_API_KEY` to `/docker/n8n/docker-compose.yml`
  env, recreate n8n, then enable both the "AI Summarize" and "Apply AI result"
  nodes. To use a non-Anthropic provider, edit the "AI Summarize" URL/headers and
  the parser in "Apply AI result".

## Setup (one-time)

1. In n8n, open **"GitHub Release -> Changelog (draft)"** and **Activate** it.
2. In `Gebrilo/QC-Manager` → Settings → Webhooks → Add webhook:
   - Payload URL: `https://n8n.gebrils.cloud/webhook/github-release-changelog`
   - Content type: `application/json`
   - Events: **Releases** only.
3. Publish a test release; confirm a draft appears at `/admin/landing-config`.

## Deliverable

`n8n-workflows/github-release-changelog.json` (version-controlled, import-ready),
imported into n8n as workflow `hW8ZJFm6sjYca2KN`.
