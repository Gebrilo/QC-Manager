# Secret Management

## Secret Categories

| Category | Examples | Storage | Rotation |
|----------|----------|---------|----------|
| Application secrets | `JWT_SECRET`, `SUPABASE_JWT_SECRET`, `QC_AGENT_WEBHOOK_SECRET` | `.env` files, GitHub Secrets | Manual |
| API keys | `TULEAP_ACCESS_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | `.env` files, GitHub Secrets | Per provider policy |
| Database credentials | `SUPABASE_DATABASE_URL` | `.env` files, GitHub Secrets | Manual |
| Infrastructure credentials | `DOCKER_HUB_TOKEN`, `VPS_SSH_KEY` | GitHub Secrets only | Manual |
| Public identifiers | `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_*` | `.env`, build-time bake | Manual |

## Where Secrets Live

| Location | Scope | Access |
|----------|-------|--------|
| `.env` files | Per-environment | Filesystem (never committed) |
| GitHub Secrets | CI/CD pipeline | GitHub UI, Actions workflows |
| `/root/.qc-deploy-secrets` | VPS deploy script | Root filesystem |
| Supabase Dashboard | Supabase project | Supabase web UI |

## Rules

1. **Never commit secrets to git**. All `.env` files are in `.gitignore`.
2. **Never expose server secrets to browser**. `SUPABASE_SERVICE_ROLE_KEY` and `QC_AGENT_WEBHOOK_SECRET` are server-only.
3. **Use different secrets per environment**. Production and staging must have separate keys.
4. **Rotate on compromise**. If a secret is exposed, rotate immediately.
5. **`.env.example` contains placeholders only**. Real values are filled in per deployment.

## Secret Exposure Check

```bash
# Run before committing docs or config
grep -RInE "api[_-]?key|secret|password|token|private key|BEGIN RSA|BEGIN PRIVATE"   docs/ README.md DOCUMENTATION_INDEX.md || echo "No secrets found"
```

> [!CAUTION]
> If a secret is accidentally committed, rotate it immediately and squash the git history. Git history retains all commits.
