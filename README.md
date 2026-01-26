# QC Management Tool

A comprehensive Quality Control Project Management System designed to streamline project tracking, resource allocation, and governance.

## 🚀 Features

- **Dashboard**: High-level overview of project health, resource utilization, and key metrics.
- **Project Management**: Detailed project tracking with status, timeline, and deliverables.
- **Resource Management**: Manage team workload, availability, and skills.
- **Governance**: Audit capability and compliance tracking.
- **Automation**: Integration with n8n for automated reporting and notifications.

## 🛠️ Technology Stack

- **Frontend**: Next.js (React), Tailwind CSS
- **Backend**: Node.js, Express
- **Database**: PostgreSQL
- **Automation**: n8n
- **Containerization**: Docker

## 📂 Project Structure

```bash
├── qc-app/             # Main Application Monorepo
│   ├── apps/web/       # Next.js Frontend
│   └── apps/api/       # Node.js API
├── n8n/                # n8n Workflow Definitions
├── database/           # Database Initialization Scripts
└── docs/               # Project Documentation
```

## 🚦 Getting Started

### Prerequisites

- Node.js (v18+)
- Docker & Docker Compose
- PostgreSQL

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/Gebrilo/QC-Manager.git
    cd QC-Manager
    ```

2.  **Environment Setup**:
    - Copy `.env.example` to `.env` in `qc-app/apps/web` and `qc-app/apps/api`.
    - Configure your database credentials.

3.  **Run with Docker**:
    ```bash
    docker-compose up -d
    ```

4.  **Run Manually (Development)**:
    ```bash
    cd qc-app
    npm install
    npm run dev
    ```

## 📚 Documentation

Detailed documentation can be found in the `docs/` folder.

## 📄 License

[MIT](LICENSE)
