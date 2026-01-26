# QC App

A boring, maintainable Quality Control application ensuring data integrity and process automation.

## Quick Start (Local)

1. **Prerequisites**: Docker & Docker Compose installed.
2. **Setup Environment**:
   ```bash
   cp docker/env.example docker/.env
   # Edit docker/.env if needed
   ```
3. **Run**:
   ```bash
   docker-compose -f docker/docker-compose.local.yml up --build
   ```
4. **Access**:
   - Frontend: http://localhost:3000
   - API: http://localhost:3001
   - n8n: http://localhost:5678
   - Postgres: localhost:5432

## Deployment (VPS/Hostinger)

1. Provision a VPS with Docker installed.
2. Clone repository.
3. Configure `docker/.env` with production secrets.
4. Setup SSL certificates (Let's Encrypt recommended via Certbot or Nginx Proxy Manager).
5. Run:
   ```bash
   docker-compose -f docker/docker-compose.prod.yml up -d
   ```

## Project Structure

- `apps/web`: Next.js frontend dashboard.
- `apps/api`: Express.js backend handling CRUD and Auth.
- `n8n`: Workflow automation logic.
- `db`: Database initialization, migrations, and seeds.

## Architecture

This project uses a "Thin API, Fat Workflow" architecture.
- The API handles immediate user feedback (CRUD, Auth).
- n8n handles complex business logic, reporting, and state transitions.
- Postgres is the single source of truth.
