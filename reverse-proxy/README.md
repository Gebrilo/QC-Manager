# Reverse Proxy Setup

Central Nginx reverse proxy for routing subdomains to Docker containers using **jwilder/nginx-proxy** for automatic container discovery.

## Architecture

```
                    ┌─────────────────────────────────────────┐
                    │         VPS: 72.61.157.168              │
                    │              (Port 80)                  │
                    └─────────────────────────────────────────┘
                                       │
                                       ▼
                    ┌─────────────────────────────────────────┐
                    │      jwilder/nginx-proxy                │
                    │  Auto-discovers via VIRTUAL_HOST env    │
                    └─────────────────────────────────────────┘
                           │           │           │
         ┌─────────────────┼───────────┼───────────┼──────────────────┐
         │                 │           │           │                  │
         ▼                 ▼           ▼           ▼                  │
   ┌──────────┐      ┌──────────┐ ┌──────────┐ ┌──────────┐          │
   │  qc-web  │      │  qc-api  │ │ n8n-lzye │ │postgresql│          │
   │  :3000   │      │  :3001   │ │  :5678   │ │  :5432   │          │
   └──────────┘      └──────────┘ └──────────┘ └──────────┘          │
         │                 │           │           │                  │
         └─────────────────┴───────────┴───────────┴──────────────────┘
                              Docker network: proxy
```

## How It Works

**jwilder/nginx-proxy** automatically detects containers with `VIRTUAL_HOST` environment variable and creates nginx server blocks for them. No manual nginx config needed.

Example container:
```yaml
environment:
  - VIRTUAL_HOST=api.gerbil.qc
  - VIRTUAL_PORT=3001
```

## Required DNS A Records

Configure these DNS records pointing to VPS IP `72.61.157.168`:

| Subdomain         | Type | Value          |
|-------------------|------|----------------|
| gerbil.qc         | A    | 72.61.157.168  |
| app.gerbil.qc     | A    | 72.61.157.168  |
| api.gerbil.qc     | A    | 72.61.157.168  |
| n8n.gerbil.qc     | A    | 72.61.157.168  |

## Hostinger Deployment

### 1. Deploy reverse-proxy (via Hostinger Docker Manager)

Create project `reverse-proxy` with compose content from `reverse-proxy/docker-compose.yml`

### 2. Deploy qc-app (via Hostinger Docker Manager)

Create project `qc-app` with compose content from `qc-app/docker-compose.yml`

### 3. Update existing n8n (optional)

To route n8n through the proxy, recreate n8n-lzye with:
```yaml
environment:
  - VIRTUAL_HOST=n8n.gerbil.qc
  - VIRTUAL_PORT=5678
networks:
  - proxy
```

## Subdomain Routing

| URL                  | Routes To                  | VIRTUAL_HOST       |
|----------------------|----------------------------|--------------------|
| http://gerbil.qc     | qc-web:3000 (frontend)     | app.gerbil.qc      |
| http://app.gerbil.qc | qc-web:3000 (frontend)     | app.gerbil.qc      |
| http://api.gerbil.qc | qc-api:3001 (backend API)  | api.gerbil.qc      |
| http://n8n.gerbil.qc | n8n:5678 (automation)      | n8n.gerbil.qc      |

## Current VPS State

| Project          | Container                    | Port   | Status  |
|------------------|------------------------------|--------|---------|
| reverse-proxy    | nginx-proxy                  | 80     | Running |
| n8n-lzye         | n8n-lzye-n8n-1               | 32769  | Running |
| postgresql-ju5t  | postgresql-ju5t-postgresql-1 | 32768  | Running |
| qc-app           | qc-api, qc-web               | -      | Pending |

## Adding New Apps

1. Add container with `VIRTUAL_HOST` and `VIRTUAL_PORT` environment variables
2. Connect to `proxy` network (external: true)
3. Expose internal port (no host port mapping needed)
4. nginx-proxy auto-discovers and routes

## Troubleshooting

```bash
# View nginx-proxy generated config
docker exec nginx-proxy cat /etc/nginx/conf.d/default.conf

# Check which containers are discovered
docker logs nginx-proxy

# Verify network connectivity
docker network inspect proxy
```

## Future HTTPS Upgrade

Use `jwilder/nginx-proxy` with `acme-companion`:
```yaml
services:
  nginx-proxy:
    image: jwilder/nginx-proxy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - certs:/etc/nginx/certs
      - /var/run/docker.sock:/tmp/docker.sock:ro

  acme-companion:
    image: nginxproxy/acme-companion
    volumes:
      - certs:/etc/nginx/certs
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      - DEFAULT_EMAIL=your@email.com
```

Then add to containers:
```yaml
environment:
  - VIRTUAL_HOST=api.gerbil.qc
  - LETSENCRYPT_HOST=api.gerbil.qc
```
