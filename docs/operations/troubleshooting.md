# Troubleshooting

## Common Issues

### API Won't Start

| Symptom | Possible Cause | Solution |
|---------|---------------|----------|
| `ECONNREFUSED` | Database unreachable | Check `DATABASE_URL`; verify Supabase connectivity |
| `migrations failed` | Schema change error | Check API logs for specific SQL error |
| Port 3001 in use | Another process | `lsof -i :3001` and kill conflicting process |

### Web Can't Reach API

| Symptom | Possible Cause | Solution |
|---------|---------------|----------|
| CORS errors in browser | Wrong `CORS_ORIGIN` | Set `CORS_ORIGIN` to web domain |
| API proxy fails | Wrong `NEXT_PUBLIC_API_URL` or `API_INTERNAL_URL` | Check env vars; rebuild web if needed |
| 502 Bad Gateway | API container down | `docker compose ps` to check container status |

### Database Issues

| Symptom | Possible Cause | Solution |
|---------|---------------|----------|
| SSL errors on local | `DATABASE_SSL` not set to false | Set `DATABASE_SSL=false` in `.env` |
| Connection pool exhausted | Too many concurrent connections | Increase pool max in `db.js` |
| Migration fails silently | SQL error in migration | Check API startup logs |

### Authentication Issues

| Symptom | Possible Cause | Solution |
|---------|---------------|----------|
| "Invalid token" | `JWT_SECRET` or `SUPABASE_JWT_SECRET` mismatch | Verify secrets match across env |
| Login redirects to login | Session expired | Check token expiry; refresh |
| 403 on all routes | Role not synced | Verify `app_user` row exists with correct role |

### Tuleap Sync Issues

| Symptom | Possible Cause | Solution |
|---------|---------------|----------|
| Artifacts not syncing | n8n workflow not running | Check n8n container and workflow status |
| 400 on webhook | Invalid payload format | Check `tuleap_webhook_log` for errors |
| Outbound creation fails | Invalid `TULEAP_ACCESS_KEY` | Regenerate Tuleap access key |

### Docker Issues

| Symptom | Possible Cause | Solution |
|---------|---------------|----------|
| Network not found | `qc-shared-network` missing | `docker network create qc-shared-network` |
| Port already in use | Another container | `docker ps` to find conflicts |
| Image pull fails | Docker Hub auth | `docker login` with DOCKER_HUB credentials |

## Diagnostic Commands

```bash
# Check all container statuses
docker compose -f docker-compose.prod.yml ps

# API logs with migration check
docker compose -f docker-compose.prod.yml logs api | grep -i "migration\|error\|fail"

# Database connectivity test
docker compose -f docker-compose.prod.yml exec api node -e "
  const { pool } = require('./src/config/db');
  pool.query('SELECT 1').then(() => console.log('DB OK')).catch(e => console.error(e));
"

# Check n8n status
curl -f http://n8n.gerbil.qc/healthz

# Disk space
df -h /opt/qc-manager
```
