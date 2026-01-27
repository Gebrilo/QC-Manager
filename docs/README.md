# QC Management Tool - Documentation Index

Welcome to the QC Management Tool documentation. This directory contains all technical specifications, guides, and integration documentation.

---

## 📚 Documentation Structure

```
docs/
├── 01-requirements/       # Product & software requirements
├── 02-architecture/       # System design & technical specs
├── 03-guides/             # User & developer guides
├── 04-integrations/       # External integrations
└── README.md              # This file
```

---

## 🎯 Quick Navigation

### New to the Project?
1. **[Product Requirements (PRD)](./01-requirements/PRD.md)** - Understand what we're building and why
2. **[Quick Start Guide](./03-guides/quick-start.md)** - Get up and running in 15 minutes
3. **[Development Guide](./03-guides/development-guide.md)** - Set up your local environment

### For Developers
- **[Database Design](./02-architecture/database-design.md)** - Schema, ERDs, and data models
- **[API Specification](./02-architecture/api-specification.md)** - REST API endpoints
- **[Frontend Design](./02-architecture/frontend-design.md)** - UI components and pages
- **[Workflow Design](./02-architecture/workflow-design.md)** - n8n automation workflows
- **[API Usage Guide](./03-guides/api-usage-guide.md)** - Practical API examples

### For DevOps/Deployment
- **[Deployment Guide](./03-guides/deployment-guide.md)** - Production deployment instructions
- **[Docker Setup](../docker-compose.yml)** - Container orchestration

### For Integrations
- **[Google Apps Script](./04-integrations/apps-script-integration.md)** - Google Sheets integration
- **[n8n Workflows](./04-integrations/n8n-workflows.md)** - Automation workflows
- **[TestSprite MCP](./04-integrations/testsprite-integration.md)** - Testing framework integration

---

## 📂 Directory Details

### 01-requirements/
**Product and software requirements specifications**

| Document | Description |
|----------|-------------|
| [PRD.md](./01-requirements/PRD.md) | Product Requirements Document - features, user stories, success metrics |
| [SRS-master.md](./01-requirements/SRS-master.md) | Software Requirements Specification - technical requirements and constraints |

### 02-architecture/
**System design and technical architecture**

| Document | Description |
|----------|-------------|
| [database-design.md](./02-architecture/database-design.md) | Database schema, ERD, tables, views, indexes, audit strategy |
| [api-specification.md](./02-architecture/api-specification.md) | REST API endpoints, request/response formats, authentication |
| [frontend-design.md](./02-architecture/frontend-design.md) | UI/UX design, component library, page layouts |
| [workflow-design.md](./02-architecture/workflow-design.md) | n8n workflow architecture and automation logic |

### 03-guides/
**User and developer guides**

| Document | Description |
|----------|-------------|
| [quick-start.md](./03-guides/quick-start.md) | Get started in 15 minutes - installation and basic usage |
| [development-guide.md](./03-guides/development-guide.md) | Local development setup, coding conventions, Git workflow |
| [deployment-guide.md](./03-guides/deployment-guide.md) | Production deployment - Docker, Railway, Vercel |
| [api-usage-guide.md](./03-guides/api-usage-guide.md) | API examples with curl, JavaScript, Postman |

### 04-integrations/
**External system integrations**

| Document | Description |
|----------|-------------|
| [apps-script-integration.md](./04-integrations/apps-script-integration.md) | Google Apps Script for Google Sheets sync (Phase 1) |
| [n8n-workflows.md](./04-integrations/n8n-workflows.md) | n8n workflow automation documentation |
| [testsprite-integration.md](./04-integrations/testsprite-integration.md) | TestSprite MCP testing framework integration |

---

## 🚀 Common Tasks

### I want to...

**...understand the project scope and goals**
→ Read [PRD.md](./01-requirements/PRD.md)

**...set up my local development environment**
→ Follow [Quick Start Guide](./03-guides/quick-start.md) then [Development Guide](./03-guides/development-guide.md)

**...understand the database schema**
→ Read [Database Design](./02-architecture/database-design.md)

**...integrate with the API**
→ Start with [API Usage Guide](./03-guides/api-usage-guide.md), then refer to [API Specification](./02-architecture/api-specification.md)

**...deploy to production**
→ Follow [Deployment Guide](./03-guides/deployment-guide.md)

**...set up n8n workflows**
→ Read [Workflow Design](./02-architecture/workflow-design.md) and [n8n Workflows](./04-integrations/n8n-workflows.md)

**...contribute to the codebase**
→ Review [Development Guide](./03-guides/development-guide.md) for coding standards and Git workflow

---

## 🛠️ Technology Stack

**Frontend**
- Next.js 14 (App Router)
- React 18
- TypeScript
- Tailwind CSS
- TanStack Table v8
- React Hook Form + Zod

**Backend**
- Node.js 18+
- Express.js
- PostgreSQL 14+
- Zod validation

**Automation**
- n8n (self-hosted or cloud)
- Google Apps Script

**Deployment**
- Docker & Docker Compose
- Vercel (frontend)
- Railway/Render (backend + database)

**Testing**
- TestSprite MCP
- Jest
- React Testing Library

---

## 📖 Documentation Conventions

- All code examples use **ES6+ syntax**
- SQL examples use **PostgreSQL 14+ syntax**
- API examples show **curl**, **JavaScript/TypeScript**, and **Postman** formats
- Environment variables are documented in `.env.example`
- File paths use **forward slashes** (Unix-style) unless Windows-specific

---

## 🤝 Contributing to Documentation

When updating docs:

1. **Keep it current**: Update docs when code changes
2. **Be concise**: Use bullet points, tables, and code blocks
3. **Include examples**: Show, don't just tell
4. **Link related docs**: Help readers navigate
5. **Test examples**: Verify all code snippets work

---

## 📝 Documentation Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-01-27 | Consolidated all documentation into unified structure | System |
| 2025-01-15 | Added API usage guide and examples | Basel |
| 2025-01-10 | Initial architecture documentation | Basel |

---

## 🔗 External Resources

- **GitHub Repository**: [github.com/Gebrilo/QC-Manager](https://github.com/Gebrilo/QC-Manager)
- **Main README**: [../README.md](../README.md)
- **Docker Compose**: [../docker-compose.yml](../docker-compose.yml)

---

**Questions or suggestions?** Open an issue on GitHub or contact the development team.
