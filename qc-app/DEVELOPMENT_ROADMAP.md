# QC Management Tool - Development Roadmap

## Overview

This roadmap shows you the exact order to build and deploy your QC Management Tool, from local development to production on Hostinger VPS.

---

## 📍 Current Status

✅ **Completed:**
- Project documentation (CLAUDE.md)
- Database schema design
- Backend API specification
- Frontend component designs
- n8n workflow definitions
- Reporting subsystem design
- Initial project structure (`apps/api`, `apps/web`, `docker`, `n8n`)
- Basic Express backend with Postgres connection
- Functional Next.js frontend with basic UI
- Docker Compose setup verified and working

🔨 **To Build:**
- Actual code implementation
- Production deployment

---

## 🗺️ Development Phases

```
┌──────────────────────────────────────────────────────────────────┐
│                     PHASE 0: SETUP (Completed)                   │
│  ✓ Install tools     ✓ Create DB     ✓ Test connection         │
│  ✓ Docker Setup      ✓ Git Repo      ✓ Initial Code            │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│               PHASE 1: BACKEND CORE (Week 1-2)                   │
│  □ CRUD endpoints    □ Validation    □ Error handling           │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│              PHASE 2: FRONTEND CORE (Week 2-3)                   │
│  □ Project pages     □ Task pages    □ Forms                    │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│               PHASE 3: n8n WORKFLOWS (Week 3-4)                  │
│  □ Report generation □ Cleanup       □ Scheduling               │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│            PHASE 4: DEPLOYMENT PREP (Week 4)                     │
│  □ VPS setup         □ SSL config    □ Domain DNS               │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│           PHASE 5: PRODUCTION DEPLOY (Week 5)                    │
│  □ Deploy code       □ Test live     □ Monitor                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 📋 Detailed Task Breakdown

### PHASE 0: Local Development Setup (Completed)

| Task | File/Action | Time | Status |
|------|-------------|------|--------|
| Install Docker & Git | System | 30 min | ✅ |
| Create Docker Compose | `docker/docker-compose.local.yml` | 15 min | ✅ |
| Initialize Repo | `apps/api`, `apps/web` | 15 min | ✅ |
| Verify Database | `docker exec` check | 5 min | ✅ |

**Deliverable:** Database, Backend, and Frontend running in Docker

---

### PHASE 1: Backend API (Legacy Express -> production-ready)

#### 1.1 Project Setup (Completed)

| Task | File | Status |
|------|------|--------|
| Initialize backend | `apps/api/package.json` | ✅ |
| Dockerize | `apps/api/Dockerfile` | ✅ |
| Database Connection | `apps/api/src/db.js` | ✅ |
| Basic Routes | `apps/api/src/server.js` | ✅ |

#### 1.2 Core API Endpoints (Refinement)

| Endpoint | File | Reference Doc | Status |
|----------|------|---------------|--------|
| GET /api/projects | `apps/api/src/routes/projects.js` | QC_Backend_API_Design.md | 🔄 |
| POST /api/projects | `apps/api/src/routes/projects.js` | QC_Backend_API_Design.md | 🔄 |
| GET /api/projects/:id | `apps/api/src/routes/projects.js` | QC_Backend_API_Design.md | ⬜ |
| PUT /api/projects/:id | `apps/api/src/routes/projects.js` | QC_Backend_API_Design.md | ⬜ |
| DELETE /api/projects/:id | `apps/api/src/routes/projects.js` | QC_Backend_API_Design.md | ⬜ |
| GET /api/tasks | `apps/api/src/routes/tasks.js` | QC_Backend_API_Design.md | 🔄 |
| POST /api/tasks | `apps/api/src/routes/tasks.js` | QC_Backend_API_Design.md | 🔄 |
| PUT /api/tasks/:id | `apps/api/src/routes/tasks.js` | QC_Backend_API_Design.md | 🔄 |

#### 1.3 Validation & Error Handling

| Task | File | Time | Status |
|------|------|------|--------|
| Zod schemas | `apps/api/src/schemas/` | 1 hr | ⬜ |
| Error middleware | `apps/api/src/middleware/error.js` | 1 hr | ⬜ |
| Audit logging | `apps/api/src/middleware/audit.js` | 2 hr | 🔄 |

**Deliverable:** Fully functional REST API with validation matching Design Spec

---

### PHASE 2: Frontend (Refinement)

#### 2.1 Setup (Completed)

| Task | File | Status |
|------|------|--------|
| Create Next.js app | `apps/web/` | ✅ |
| Dockerize | `apps/web/Dockerfile` | ✅ |
| Tailwind Config | `apps/web/tailwind.config.js` | ✅ |
| API Client | `apps/web/lib/api.js` | 🔄 |

#### 2.2 Core Pages

| Page | File | Reference Doc | Time | Status |
|------|------|---------------|------|--------|
| Dashboard | `apps/web/app/page.js` | QC_Frontend_Design.md | 🔄 |
| Projects List | `apps/web/app/projects/page.js` | QC_Frontend_Design.md | 4 hr | ⬜ |
| Project Detail | `apps/web/app/projects/[id]/page.js` | QC_Frontend_Design.md | 5 hr | ⬜ |
| Tasks Page | `apps/web/app/tasks/page.js` | QC_Frontend_Design.md | 4 hr | ⬜ |

#### 2.3 Components

| Component | File | Reference Code | Time | Status |
|-----------|------|----------------|------|--------|
| TaskTable | `apps/web/components/TaskTable.js` | QC_Frontend_Design.md | 4 hr | ⬜ |
| TaskForm | `apps/web/components/TaskForm.js` | QC_Frontend_Design.md | 3 hr | 🔄 |
| ProjectCard | `apps/web/components/ProjectCard.js` | - | 2 hr | ⬜ |
| ReportExportPanel | `apps/web/components/ReportExportPanel.js` | QC_Frontend_Design.md | 2 hr | ⬜ |

**Deliverable:** Working web application with CRUD operations matching Design Spec


---

### PHASE 3: n8n Workflows (Day 15-21)

#### 3.1 Setup

| Task | Time | Status |
|------|------|--------|
| Install n8n globally | 5 min | ⬜ |
| Start n8n server | 2 min | ⬜ |
| Configure PostgreSQL credentials | 5 min | ⬜ |
| Configure AWS S3 credentials | 10 min | ⬜ |
| Configure PDFShift credentials | 5 min | ⬜ |

#### 3.2 Import Workflows

| Workflow | File | Time | Status |
|----------|------|------|--------|
| Project Summary PDF | `n8n/qc_generate_project_summary_pdf.json` | 30 min | ⬜ |
| Task Export Excel | `n8n/qc_generate_task_export_excel.json` | 30 min | ⬜ |
| Cleanup Reports | `n8n/qc_cleanup_expired_reports.json` | 20 min | ⬜ |

#### 3.3 Test Workflows

| Test | Expected Result | Time | Status |
|------|----------------|------|--------|
| Generate PDF report | Download link returned | 10 min | ⬜ |
| Export tasks to Excel | .xlsx file downloads | 10 min | ⬜ |
| Test cleanup logic | Old files deleted | 10 min | ⬜ |

**Deliverable:** Automated report generation system

---

### PHASE 4: VPS Preparation (Day 22-24)

#### 4.1 VPS Setup

| Task | Command/Action | Time | Status |
|------|---------------|------|--------|
| Access Hostinger VPS | `ssh root@your-vps-ip` | 5 min | ⬜ |
| Update system | `apt update && apt upgrade -y` | 10 min | ⬜ |
| Create user | `adduser qcadmin` | 5 min | ⬜ |
| Setup firewall | `ufw enable` | 5 min | ⬜ |
| Install Node.js | See DEPLOYMENT_GUIDE.md | 10 min | ⬜ |
| Install PostgreSQL | See DEPLOYMENT_GUIDE.md | 15 min | ⬜ |
| Install Nginx | `apt install nginx` | 5 min | ⬜ |
| Install PM2 | `npm install -g pm2` | 5 min | ⬜ |

#### 4.2 Database Setup

| Task | Time | Status |
|------|------|--------|
| Create production database | 5 min | ⬜ |
| Apply schema | 5 min | ⬜ |
| Verify connection | 2 min | ⬜ |

#### 4.3 Domain Configuration

| Task | Where | Time | Status |
|------|-------|------|--------|
| Point domain to VPS IP | Hostinger DNS panel | 5 min | ⬜ |
| Create A records | DNS panel | 5 min | ⬜ |
| Wait for DNS propagation | - | 1-24 hr | ⬜ |

**Deliverable:** VPS ready for deployment

---

### PHASE 5: Production Deployment (Day 25-28)

#### 5.1 Deploy Backend

| Task | Command | Time | Status |
|------|---------|------|--------|
| Clone repository | `git clone YOUR_REPO` | 5 min | ⬜ |
| Install dependencies | `npm install` | 5 min | ⬜ |
| Configure .env | `nano .env` | 10 min | ⬜ |
| Build backend | `npm run build` | 2 min | ⬜ |
| Start with PM2 | `pm2 start dist/index.js` | 2 min | ⬜ |

#### 5.2 Deploy Frontend

| Task | Command | Time | Status |
|------|---------|------|--------|
| Install dependencies | `npm install` | 5 min | ⬜ |
| Configure .env.local | `nano .env.local` | 5 min | ⬜ |
| Build frontend | `npm run build` | 3 min | ⬜ |
| Start with PM2 | `pm2 start npm -- start` | 2 min | ⬜ |

#### 5.3 Configure Nginx

| Task | Time | Status |
|------|------|--------|
| Create Nginx config | 15 min | ⬜ |
| Test config | 2 min | ⬜ |
| Restart Nginx | 1 min | ⬜ |

#### 5.4 SSL Setup

| Task | Command | Time | Status |
|------|---------|------|--------|
| Install Certbot | `apt install certbot` | 5 min | ⬜ |
| Get SSL certificates | `certbot --nginx` | 10 min | ⬜ |
| Verify HTTPS | Visit https://yourdomain.com | 2 min | ⬜ |

#### 5.5 Deploy n8n

| Task | Time | Status |
|------|------|--------|
| Install n8n | 5 min | ⬜ |
| Start with PM2 | 2 min | ⬜ |
| Import workflows | 10 min | ⬜ |
| Configure credentials | 15 min | ⬜ |
| Test workflows | 20 min | ⬜ |

**Deliverable:** Fully deployed production application

---

## ⏱️ Time Estimates

| Phase | Estimated Time |
|-------|----------------|
| Phase 0: Setup | 2 days |
| Phase 1: Backend | 5 days |
| Phase 2: Frontend | 7 days |
| Phase 3: n8n | 4 days |
| Phase 4: VPS Prep | 3 days |
| Phase 5: Deploy | 4 days |
| **Total** | **~4-5 weeks** |

*Assumes 4-6 hours of focused work per day*

---

## 🎯 Quick Win Strategy

If you want to see results fast, do this:

### Week 1: Minimal MVP

1. **Day 1:** Setup (Phase 0)
2. **Day 2-3:** Basic backend with GET endpoints
3. **Day 4-5:** Simple frontend showing projects/tasks
4. **Day 6-7:** Test locally, verify everything works

**Result:** Working app on localhost showing data

### Week 2: Deploy

1. **Day 8-9:** VPS setup
2. **Day 10-11:** Deploy backend + frontend
3. **Day 12-13:** SSL + domain setup
4. **Day 14:** Test production

**Result:** Live app accessible via your domain

### Weeks 3-4: Features

Add reports, authentication, advanced features progressively.

---

## 📚 Key Reference Documents

| Document | When to Use |
|----------|-------------|
| [QUICK_START.md](QUICK_START.md) | Starting local development |
| [DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md) | Deploying to VPS |
| [QC_Backend_API_Design.md](docs/QC_Backend_API_Design.md) | Building API endpoints |
| [QC_Frontend_Design.md](docs/QC_Frontend_Design.md) | Building UI components |
| [CLAUDE.md](CLAUDE.md) | Architecture decisions |

---

## ✅ Daily Checklist Template

```markdown
## Day X: [Phase Name]

**Goal:** [What you want to accomplish]

### Tasks
- [ ] Task 1
- [ ] Task 2
- [ ] Task 3

### Completed
- ✅ Completed task 1
- ✅ Completed task 2

### Issues
- 🐛 Issue encountered: [description]
- ✅ Resolved by: [solution]

### Tomorrow
- [ ] Next task
```

---

## 🆘 When You Get Stuck

1. **Check error logs:** See DEPLOYMENT_GUIDE.md "Monitoring & Maintenance" section
2. **Search documentation:** Use Ctrl+F in reference docs
3. **Test endpoints:** Use Postman or curl to debug API
4. **Database issues:** Check `psql` connection and logs
5. **VPS issues:** Check PM2 logs with `pm2 logs`

---

## 🎉 Success Criteria

You're done when:

- ✅ Users can create projects
- ✅ Users can create/edit tasks
- ✅ Tasks are linked to projects
- ✅ Reports can be generated
- ✅ App is accessible via HTTPS domain
- ✅ Database backups are automated
- ✅ All services auto-restart on failure

---

**Start here:** [QUICK_START.md](QUICK_START.md) → Get running locally in 15 minutes!
