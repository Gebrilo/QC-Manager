# Reverse Proxy Setup

Central Nginx reverse proxy for routing subdomains to Docker containers.

## Architecture

```
                    ┌─────────────────────────────────────────┐
                    │              VPS (Port 80)              │
                    └─────────────────────────────────────────┘
                                       │
                                       ▼
                    ┌─────────────────────────────────────────┐
                    │         nginx-proxy container           │
                    │              (port 80)                  │
                    └─────────────────────────────────────────┘
                           │           │           │
         ┌─────────────────┼───────────┼───────────┼──────────────────┐
         │                 │           │           │                  │
         ▼                 ▼           ▼           ▼                  │
   ┌──────────┐      ┌──────────┐ ┌──────────┐ ┌──────────┐          │
   │  qc-web  │      │  qc-api  │ │  qc-n8n  │ │qc-postgres│         │
   │  :3000   │      │  :3001   │ │  :5678   │ │  :5432    │         │
   └──────────┘      └──────────┘ └──────────┘ └──────────┘          │
         │                 │           │           │                  │
         └─────────────────┴───────────┴───────────┴──────────────────┘
                              Docker network: proxy
```

## Required DNS A Records

Configure these DNS records pointing to your VPS IP:

| Subdomain       | Type | Value        |
|-----------------|------|--------------|
| gerbil.qc       | A    | <VPS_IP>     |
| app.gerbil.qc   | A    | <VPS_IP>     |
| api.gerbil.qc   | A    | <VPS_IP>     |
| n8n.gerbil.qc   | A    | <VPS_IP>     |

## VPS Deployment Steps

After merging changes, execute on VPS:

```bash
# 1. Create external Docker network (one-time)
docker network create proxy

# 2. Start the reverse proxy
cd /opt/qc-manager/reverse-proxy
docker compose up -d

# 3. Start the application stack
cd /opt/qc-manager
docker compose -f docker-compose.prod.yml up -d

# 4. Verify containers are connected
docker network inspect proxy
```

## Container Naming Convention

All containers use `qc-` prefix for clarity:

| Service   | Container Name | Internal Port |
|-----------|----------------|---------------|
| Web       | qc-web         | 3000          |
| API       | qc-api         | 3001          |
| n8n       | qc-n8n         | 5678          |
| PostgreSQL| qc-postgres    | 5432          |

## Subdomain Routing

| URL                  | Routes To                  |
|----------------------|----------------------------|
| http://gerbil.qc     | qc-web:3000 (frontend)     |
| http://app.gerbil.qc | qc-web:3000 (frontend)     |
| http://api.gerbil.qc | qc-api:3001 (backend API)  |
| http://n8n.gerbil.qc | qc-n8n:5678 (automation)   |

## Adding New Apps

1. Create nginx config in `nginx/conf.d/<app>.conf`
2. Add service to application's docker-compose with:
   - `container_name: <name>`
   - `networks: [proxy]`
   - No `ports:` exposure
3. Reload nginx: `docker exec nginx-proxy nginx -s reload`

## Troubleshooting

```bash
# Check nginx config
docker exec nginx-proxy nginx -t

# View nginx logs
docker logs nginx-proxy

# Verify network connectivity
docker exec nginx-proxy ping qc-web

# Reload config without restart
docker exec nginx-proxy nginx -s reload
```

## Future HTTPS Upgrade

This setup is designed for easy HTTPS upgrade:
1. Add Certbot/Let's Encrypt container
2. Mount certificates volume
3. Update nginx configs to listen on 443
4. Add SSL directives

No breaking changes required to application containers.
