# Security Review Checklist

## Authentication

- [ ] Supabase Auth properly configured with strong JWT secret
- [ ] Legacy JWT fallback uses separate, strong secret
- [ ] No hardcoded credentials in source code
- [ ] Session tokens have appropriate expiry
- [ ] Public endpoints intentionally configured

## Authorization

- [ ] RBAC roles match current implementation (6 active roles)
- [ ] Legacy role aliases canonicalized correctly
- [ ] Access Engine covers all secured routes
- [ ] Route guards present on all protected frontend pages
- [ ] API endpoints validate permissions, not just frontend hiding
- [ ] Admin-only endpoints restricted server-side

## Secrets

- [ ] No secrets in git history
- [ ] `.env.example` contains only placeholders
- [ ] Production secrets differ from staging
- [ ] `SUPABASE_SERVICE_ROLE_KEY` never exposed to browser
- [ ] `QC_AGENT_WEBHOOK_SECRET` strong and unique
- [ ] GitHub Secrets properly scoped

## Input Validation

- [ ] Zod schemas validate all API inputs
- [ ] SQL injection prevented (parameterized queries via `pg`)
- [ ] XSS prevented (React's default escaping)
- [ ] File upload validated (type, size, content)

## Data Protection

- [ ] HTTPS enforced (Traefik auto TLS)
- [ ] Database connections use SSL
- [ ] Soft deletes used instead of hard deletes
- [ ] Audit log captures all mutations
- [ ] PII handled according to policy

## Infrastructure

- [ ] Docker containers run as non-root user
- [ ] No ports exposed directly (Traefik only)
- [ ] Container images from trusted registry
- [ ] Dependencies regularly updated
- [ ] VPS SSH access restricted

## Monitoring

- [ ] Failed login attempts logged
- [ ] API errors monitored
- [ ] Audit log accessible for review
- [ ] Suspicious activity detection (recommended)

## Documentation

- [ ] Auth flow documented
- [ ] RBAC model documented
- [ ] Secret management process documented
- [ ] Incident response contact info available

> [!NOTE]
> This checklist is a starting point. Adapt to your organization's security requirements.
