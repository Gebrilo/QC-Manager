# QC Management Tool - Quick Start Guide

## 🚀 Get Started in 15 Minutes

Follow these steps to get your QC Management Tool running locally.

---

## Step 1: Prerequisites (5 min)

Download and install:

1. **Node.js v18+**: https://nodejs.org/
2. **PostgreSQL 14+**: https://www.postgresql.org/download/
3. **Git**: https://git-scm.com/downloads

---

## Step 2: Database Setup (3 min)

### Windows

```bash
# Open Command Prompt or PowerShell
# Access PostgreSQL
psql -U postgres

# In psql shell:
CREATE DATABASE qc_management;
CREATE USER qc_user WITH ENCRYPTED PASSWORD 'dev_password';
GRANT ALL PRIVILEGES ON DATABASE qc_management TO qc_user;
\q
```

### Mac/Linux

```bash
# Access PostgreSQL
sudo -u postgres psql

# In psql shell:
CREATE DATABASE qc_management;
CREATE USER qc_user WITH ENCRYPTED PASSWORD 'dev_password';
GRANT ALL PRIVILEGES ON DATABASE qc_management TO qc_user;
\q
```

### Apply Schema

```bash
# Navigate to your project folder
cd "d:\Claude\QC management tool!"

# Apply database schema
psql -U qc_user -d qc_management -f database/schema.sql
```

**Password:** `dev_password`

---

## Step 3: Backend Setup (3 min)

```bash
# Create backend folder
mkdir backend
cd backend

# Initialize project
npm init -y

# Install dependencies
npm install express cors helmet dotenv pg zod
npm install -D typescript @types/node @types/express tsx nodemon

# Create tsconfig.json
echo {
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
} > tsconfig.json

# Create .env file
echo NODE_ENV=development
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=qc_management
DB_USER=qc_user
DB_PASSWORD=dev_password
DB_SSL=false
CORS_ORIGIN=http://localhost:3000 > .env

# Create src directory
mkdir src
```

Now create `backend/src/index.ts` with this content:

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Database
export const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN }));
app.use(express.json());

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Projects API
app.get('/api/projects', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM project WHERE status != $1 ORDER BY created_at DESC',
      ['deleted']
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Tasks API
app.get('/api/tasks', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM task WHERE status != $1 ORDER BY created_at DESC',
      ['deleted']
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});
```

Update `package.json` scripts:

```json
{
  "scripts": {
    "dev": "nodemon --exec tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

Start backend:

```bash
npm run dev
```

Test: Visit http://localhost:3001/health

---

## Step 4: Frontend Setup (3 min)

Open a **new terminal**:

```bash
# Navigate to project root
cd "d:\Claude\QC management tool!"

# Create Next.js app
npx create-next-app@latest frontend --typescript --tailwind --app --no-src-dir

# Navigate to frontend
cd frontend

# Install dependencies
npm install axios react-hook-form lucide-react

# Create .env.local
echo NEXT_PUBLIC_API_URL=http://localhost:3001/api > .env.local
```

Replace `app/page.tsx` with:

```typescript
'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

export default function Home() {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/projects`)
      .then(res => setProjects(res.data));

    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/tasks`)
      .then(res => setTasks(res.data));
  }, []);

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-3xl font-bold mb-8">QC Management Tool</h1>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Projects</h2>
        <div className="grid gap-4">
          {projects.map((p: any) => (
            <div key={p.id} className="border p-4 rounded">
              <h3 className="font-bold">{p.name}</h3>
              <p className="text-sm text-gray-600">{p.description}</p>
              <div className="mt-2 text-xs text-gray-500">
                Status: {p.status} | Owner: {p.owner}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Tasks</h2>
        <div className="grid gap-2">
          {tasks.map((t: any) => (
            <div key={t.id} className="border-l-4 border-blue-500 p-3 bg-gray-50">
              <div className="flex justify-between">
                <span className="font-medium">{t.name}</span>
                <span className="text-xs bg-blue-100 px-2 py-1 rounded">{t.status}</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Assignee: {t.assignee} | Due: {t.due_date}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
```

Start frontend:

```bash
npm run dev
```

Visit: http://localhost:3000

---

## Step 5: n8n Setup (1 min - Optional)

Open a **third terminal**:

```bash
# Install n8n globally
npm install -g n8n

# Start n8n
n8n start
```

Visit: http://localhost:5678

Import workflows from `n8n/` folder.

---

## ✅ You're Done!

You should now see:

- **Backend**: http://localhost:3001/health
- **Frontend**: http://localhost:3000
- **n8n** (optional): http://localhost:5678

### What You Have

- ✅ Database with 2 sample projects and tasks
- ✅ REST API for projects and tasks
- ✅ React frontend displaying data
- ✅ n8n workflows for reports (optional)

---

## Next Steps

1. **Add More API Endpoints**: See [QC_Backend_API_Design.md](docs/QC_Backend_API_Design.md)
2. **Build Frontend Components**: See [QC_Frontend_Design.md](docs/QC_Frontend_Design.md)
3. **Deploy to VPS**: See [DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)

---

## Troubleshooting

### "Cannot connect to database"

```bash
# Check PostgreSQL is running
# Windows:
services.msc  # Look for "postgresql-x64-14"

# Mac:
brew services list

# Linux:
sudo systemctl status postgresql
```

### "Port 3001 already in use"

```bash
# Find and kill the process
# Windows:
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# Mac/Linux:
lsof -i :3001
kill -9 <PID>
```

### "Module not found"

```bash
# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

---

## Support

- Check [DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md) for detailed setup
- Review [CLAUDE.md](CLAUDE.md) for project architecture
- See sample code in `frontend/components/` and `n8n/` folders
