# Monitoring

## Health Checks

| Endpoint | Purpose | Expected |
|----------|---------|----------|
| `GET /api/health` | API health | 200 OK |
| `GET /` | Web serving | 200 OK |
| `GET /api/public/landing-page` | Landing page API | 200 OK |

### Check Commands

```bash
# API health
curl -f https://api.gerbil.qc/health

# Web status
curl -o /dev/null -w "%{http_code}" https://gerbil.qc

# Landing page
curl -f https://api.gerbil.qc/api/public/landing-page
```

## Docker Monitoring

```bash
# Container status
docker compose -f docker-compose.prod.yml ps

# Resource usage
docker stats --no-stream

# API logs (last 100 lines)
docker compose -f docker-compose.prod.yml logs --tail 100 api

# Follow logs
docker compose -f docker-compose.prod.yml logs -f api
```

## Key Signals to Monitor

| Signal | Check | Alert Threshold |
|--------|-------|-----------------|
| API health endpoint | `curl /health` | Non-200 response |
| API memory/CPU | `docker stats` | >80% sustained |
| Migration status | `docker logs api \| grep migration` | No "completed successfully" message |
| Tuleap webhook errors | `SELECT * FROM tuleap_webhook_log WHERE status >= 400` | >5 in 1 hour |
| Database connectivity | API logs for `ECONNREFUSED` | Any occurrence |
| Disk space | `df -h` | >80% used |

## Log Sources

| Source | Location |
|--------|----------|
| API | `docker compose logs api` |
| Web | `docker compose logs web` |
| n8n | `docker compose logs n8n` |
| Traefik | Traefik container logs |
| Database errors | API logs (propagated from pg driver) |

## Recommended Monitoring Setup

> [!WARNING]
> **Needs Validation:** No production monitoring is documented. The following are recommendations.

- [ ] Set up uptime monitoring for `api.gerbil.qc/health`
- [ ] Configure Docker container restart policies
- [ ] Set up disk space alerts
- [ ] Configure log rotation for Docker containers
- [ ] Set up database connection pool monitoring
- [ ] Configure alerting for Tuleap webhook failures
