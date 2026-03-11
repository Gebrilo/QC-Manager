# QC management tool Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-02-25

## Active Technologies
- TypeScript 5.9, Node.js 25 + Next.js 14, React 18, Tailwind CSS 3.3.5, HTML5 Drag and Drop API (native) (002-tasks-kanban-view)
- No new DB entities; view preference stored in `localStorage` under key `qc_tasks_view` (002-tasks-kanban-view)
- [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION] + [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION] (003-fix-tooltip-layering)
- [if applicable, e.g., PostgreSQL, CoreData, files or N/A] (003-fix-tooltip-layering)
- Node.js 18 (Express API), n8n workflow JSON + Express.js, node-postgres (pg), n8n-nodes-base, crypto (004-n8n-workflow-validation)
- PostgreSQL 15 (tables: `tasks`, `bugs`, `tuleap_sync_config`, `tuleap_webhook_log`, `tuleap_task_history`) (004-n8n-workflow-validation)
- React 18 (Next.js App Router) for Web, Node.js 18 (Express) for API + `@supabase/supabase-js` (Web & API), `jsonwebtoken` (to be deprecated in API), `@radix-ui` (UI components) (005-supabase-multi-auth)
- PostgreSQL (Supabase Cloud) via `pg` pool in API (005-supabase-multi-auth)

- TypeScript 5.9, Node.js 25 + Next.js 14, React 18, Tailwind CSS 3.3.5 (001-liquid-glass-ui)

## Project Structure

```text
backend/
frontend/
tests/
```

## Commands

npm test; npm run lint

## Code Style

TypeScript 5.9, Node.js 25: Follow standard conventions

## Recent Changes
- 005-supabase-multi-auth: Added React 18 (Next.js App Router) for Web, Node.js 18 (Express) for API + `@supabase/supabase-js` (Web & API), `jsonwebtoken` (to be deprecated in API), `@radix-ui` (UI components)
- 001-playwright-test-cycle: Added [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION] + [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]
- 004-n8n-workflow-validation: Added Node.js 18 (Express API), n8n workflow JSON + Express.js, node-postgres (pg), n8n-nodes-base, crypto


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
