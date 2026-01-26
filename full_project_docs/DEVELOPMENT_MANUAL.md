# QC Management Tool - Development Manual

**Version:** 1.0
**Date:** January 2026

---

## 🚀 1. Quick Start Guide

This guide ensures you can spin up the entire application stack from scratch.

### 1.1 Prerequisites
- **Git**
- **Docker Desktop** (running)
- **Node.js 18+** (for local scripts, optional if using Docker)
- **Visual Studio Code** (recommended)

### 1.2 Installation Steps

1.  **Clone the Repository**
    ```bash
    git clone <repository-url>
    cd qc-app
    ```

2.  **Environment Setup**
    Copy the example environment file:
    ```bash
    cp docker/env.example docker/.env
    ```
    *Note: Verify the `.env` contents. For local dev, default values usually work.*

3.  **Start the Stack (Docker)**
    Run the complete stack (Frontend + API + Database + Automation):
    ```bash
    docker-compose -f docker/docker-compose.local.yml up --build
    ```
    *Wait for about 2-3 minutes for the database and n8n to initialize.*

4.  **Access the Services**
    | Service | URL | Credentials (Default) |
    |:---|:---|:---|
    | **Web App** | `http://localhost:3000` | Register a new user |
    | **API** | `http://localhost:3001` | Accessed via Web App |
    | **n8n Automation** | `http://localhost:5678` | Setup admin account on first load |
    | **PostgreSQL** | `localhost:5432` | `user: postgres` / `pass: postgres` |

---

## 📁 2. Project Structure

Understanding the monolithic repository structure:

```
qc-app/
├── apps/
│   ├── web/               # Next.js Frontend (React)
│   │   ├── src/app/       # Pages & Routes
│   │   ├── src/components/# Reusable UI components
│   │   └── src/lib/       # API clients & Utility
│   └── api/               # (Optional) Express Backup API
├── db/
│   ├── init.sql           # Database Schema (See SRS_1)
│   ├── seeds/             # Initial data for testing
│   └── migrations/        # Schema changes
├── n8n/
│   ├── workflows/         # JSON exports of n8n workflows
│   └── Dockerfile         # Custom n8n image
├── docker/                # Container orchestration
│   ├── docker-compose.local.yml
│   └── docker-compose.prod.yml
└── package.json           # Root dependencies
```

---

## 🛠️ 3. Development Workflows

### 3.1 Making Database Changes
1.  **Edit Schema**: Modify `db/init.sql` or create a new migration file.
2.  **Apply**: Restart the `db` container or run `psql` command.
    ```bash
    docker-compose -f docker/docker-compose.local.yml restart db
    ```
3.  **Verify**: Check `tables` in PostgreSQL client (DBeaver/pgAdmin).

### 3.2 Updating the Frontend
1.  Navigate to `apps/web`.
2.  The `docker-compose` setup mounts the volume, so changes to `src/` should hot-reload at `http://localhost:3000`.
3.  If adding dependencies:
    ```bash
    cd apps/web
    npm install <package>
    # Then rebuild docker
    docker-compose -f docker/docker-compose.local.yml build web
    ```

### 3.3 Creating Automation Workflows (n8n)
1.  Open `http://localhost:5678`.
2.  Create a new workflow.
3.  **Webhook Trigger**: Set method (GET/POST) and path.
4.  **Postgres Node**: Connect to `db` host (internal Docker network) with credentials.
5.  **Save**: Export the JSON to `n8n/workflows/` to commit to Git.

---

## 🧪 4. Testing

### 4.1 Running Tests
(If configured in `package.json`)
```bash
npm run test
```

### 4.2 Manual Verification
Refer to the `PRD.md` -> **Phase 1 MVP** checklist to manually verify features like:
- Creating a Project
- Adding Tasks
- Checking Resource Utilization

---

## 📦 5. Deployment

For production deployment to a VPS (e.g., DigitalOcean, Hostinger):

1.  **Provision VPS**: Install Docker & Docker Compose.
2.  **Secrets**: Set secure passwords in `docker/.env`.
3.  **Run Production Compose**:
    ```bash
    docker-compose -f docker/docker-compose.prod.yml up -d
    ```
4.  **Reverse Proxy**: Setup Nginx or Traefik to handle SSL (`https://`) and route traffic to ports 3000/5678.

---

**End of Development Manual**
