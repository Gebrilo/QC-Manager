# Production Readiness Checklist

## Pre-Deployment

- [ ] All required env variables set (see `environment-variables.md`)
- [ ] `JWT_SECRET` is a strong, unique value (not the dev default)
- [ ] `SUPABASE_DATABASE_URL` points to production Supabase project
- [ ] `QC_AGENT_WEBHOOK_SECRET` is set and strong
- [ ] Docker networks `qc-shared-network` and `qc-network` exist
- [ ] Docker Hub images built and pushed (`qc-api:latest`, `qc-web:latest`)
- [ ] Traefik is running and connected to `qc-shared-network`
- [ ] DNS records point to VPS (gerbil.qc, api.gerbil.qc, n8n.gerbil.qc)

## Deployment Verification

- [ ] `docker compose -f docker-compose.prod.yml ps` shows all services running
- [ ] API logs show "Database migrations completed successfully"
- [ ] `curl -f https://api.gerbil.qc/health` returns 200
- [ ] `curl -I https://gerbil.qc/` returns 200
- [ ] Landing page renders at `https://gerbil.qc/`
- [ ] Login flow works end-to-end
- [ ] n8n is accessible at `https://n8n.gerbil.qc/`

## Post-Deployment

- [ ] Admin user can log in and access admin pages
- [ ] Tuleap webhook test (if applicable)
- [ ] Test result upload works
- [ ] Dashboard metrics load correctly
- [ ] RBAC role restrictions verified for at least 2 roles
- [ ] SSL certificates auto-renewed by Traefik (check expiry)

## Security

- [ ] No default secrets in production
- [ ] `SUPABASE_SERVICE_ROLE_KEY` not exposed to frontend
- [ ] `CORS_ORIGIN` restricted to production domain
- [ ] API does not expose stack traces in errors
- [ ] `RBAC_UNIFIED` setting reviewed and intentional

## Monitoring

- [ ] Health check endpoint monitored
- [ ] Container restart policies configured
- [ ] Log rotation configured
- [ ] Disk space monitoring in place
- [ ] Alerting configured for critical failures

## Documentation

- [ ] Deployment guide matches actual procedure
- [ ] Environment variable reference is current
- [ ] Team knows how to rollback
- [ ] Emergency contact information documented
