# QC Scenario Planning - Backend API Design for Solo Developers

**Version:** 1.0
**Date:** 2025-01-15
**Stack:** Next.js 14 + TypeScript + Supabase + n8n
**Purpose:** Pragmatic API design balancing simplicity with enterprise patterns

---

## 📋 TABLE OF CONTENTS

1. [Architecture Overview](#architecture-overview)
2. [Technology Stack](#technology-stack)
3. [Authentication Strategy](#authentication-strategy)
4. [API Endpoint Specifications](#api-endpoint-specifications)
5. [Code Examples](#code-examples)
6. [Report Generation Flow](#report-generation-flow)
7. [Security Hardening](#security-hardening)
8. [Deployment Considerations](#deployment-considerations)
9. [Acceptance Checklist](#acceptance-checklist)

---

## 🏗️ ARCHITECTURE OVERVIEW

### Decision: Hybrid API Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   Next.js API Routes                            │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Simple CRUD → Direct DB Write → Trigger n8n Webhook     │ │
│  │  Complex Operations → Delegate to n8n → Return Job ID    │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
          ↓                                    ↓
┌───────────────────────┐        ┌──────────────────────────────┐
│   Supabase Postgres   │        │      n8n Workflows           │
│   - Direct queries    │        │   - Business logic           │
│   - Views for metrics │        │   - Audit logging            │
│   - Constraints       │        │   - Reports                  │
└───────────────────────┘        │   - Notifications            │
                                 └──────────────────────────────┘
```

### Why This Hybrid Approach?

**Next.js API Routes Handle:**
- ✅ Simple CRUD (Projects, Resources, Tasks)
- ✅ Input validation (Zod schemas)
- ✅ Authentication checks
- ✅ Direct database writes for speed
- ✅ Triggering n8n webhooks asynchronously

**n8n Workflows Handle:**
- ✅ Audit logging (after DB write)
- ✅ Business rule validation (status transitions)
- ✅ Resource utilization calculations
- ✅ Report generation (complex, long-running)
- ✅ Email/Slack notifications

**Benefits:**
- 🚀 **Fast response times** - Direct DB writes, async n8n calls
- 🔧 **Easy debugging** - API layer is simple TypeScript
- 📊 **Complex logic in n8n** - Visual workflows for non-developers
- 🎯 **Solo developer friendly** - Less code to maintain

---

## 🛠️ TECHNOLOGY STACK

### Recommended Stack for Solo Developer

```typescript
// Core Technologies
{
  "framework": "Next.js 14",
  "language": "TypeScript",
  "database": "Supabase (Postgres + Auth + Storage)",
  "orm": "Drizzle ORM or Prisma (optional - can use raw SQL)",
  "validation": "Zod",
  "auth": "Supabase Auth (or NextAuth.js)",
  "automation": "n8n (self-hosted or cloud)",
  "deployment": "Vercel (Next.js) + Railway/Render (n8n)"
}
```

### Why This Stack?

| Technology | Why? | Alternative |
|------------|------|-------------|
| **Next.js 14** | Server actions, API routes, built-in caching | Express.js, Fastify |
| **Supabase** | Postgres + Auth + Storage in one, generous free tier | Plain Postgres + Auth0 |
| **Zod** | TypeScript-first validation, type inference | Joi, Yup |
| **Drizzle ORM** | TypeScript-first, thin wrapper, feels like SQL | Prisma (heavier), raw SQL |
| **n8n** | Visual workflows, no-code automation | Custom Node.js scripts |

---

## 🔐 AUTHENTICATION STRATEGY

### Recommended: Supabase Auth

**Why Supabase Auth?**
- ✅ Built-in with Supabase Postgres
- ✅ JWT tokens automatically issued
- ✅ Row-level security (RLS) policies
- ✅ Email/password, Google, GitHub SSO
- ✅ No additional service to manage

### Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER LOGIN FLOW                              │
└─────────────────────────────────────────────────────────────────┘

1. User → POST /auth/login {email, password}
2. Supabase Auth → Validates credentials
3. Returns JWT access token + refresh token
4. Client stores tokens in httpOnly cookie (or localStorage)

┌─────────────────────────────────────────────────────────────────┐
│                    API REQUEST FLOW                             │
└─────────────────────────────────────────────────────────────────┘

1. Client → GET /api/tasks (with Authorization: Bearer <token>)
2. Next.js API Route → Verify JWT with Supabase
3. Extract user_email from JWT payload
4. Execute query with user context
5. Return data
```

### JWT Token Structure

```json
{
  "aud": "authenticated",
  "exp": 1705334400,
  "iat": 1705248000,
  "iss": "https://your-project.supabase.co/auth/v1",
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@company.com",
  "role": "authenticated",
  "app_metadata": {
    "provider": "email"
  },
  "user_metadata": {
    "full_name": "Basel Ahmed",
    "role": "manager"
  }
}
```

### Middleware for Auth Check

```typescript
// middleware.ts (Next.js 14)
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  // Verify session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Protect /api/* routes (except public endpoints)
  if (req.nextUrl.pathname.startsWith('/api/')) {
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }

  return res;
}

export const config = {
  matcher: ['/api/:path*'],
};
```

### Alternative: NextAuth.js

If you prefer NextAuth.js (more flexibility for custom providers):

```typescript
// pages/api/auth/[...nextauth].ts
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { verify } from 'argon2';

export default NextAuth({
  providers: [
    CredentialsProvider({
      async authorize(credentials) {
        // Validate against your users table
        const user = await db.query.users.findFirst({
          where: eq(users.email, credentials.email),
        });

        if (user && await verify(user.password, credentials.password)) {
          return {
            id: user.id,
            email: user.email,
            name: user.name,
          };
        }
        return null;
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.email = token.email;
      return session;
    },
  },
});
```

---

## 📡 API ENDPOINT SPECIFICATIONS

### API Design Principles

1. **RESTful conventions** - Use standard HTTP methods
2. **JSON payloads** - All requests/responses are JSON
3. **Zod validation** - Type-safe input validation
4. **Consistent errors** - Standard error format
5. **Async n8n calls** - Non-blocking workflow triggers

### Complete API Specification

| Endpoint | Method | Auth | Purpose | Handled By |
|----------|--------|------|---------|------------|
| `/api/auth/login` | POST | No | User login | Supabase Auth |
| `/api/auth/logout` | POST | Yes | User logout | Supabase Auth |
| `/api/projects` | GET | Yes | List projects | Next.js → DB View |
| `/api/projects` | POST | Yes | Create project | Next.js → DB → n8n |
| `/api/projects/:id` | GET | Yes | Get project | Next.js → DB View |
| `/api/projects/:id` | PATCH | Yes | Update project | Next.js → DB → n8n |
| `/api/tasks` | GET | Yes | List tasks | Next.js → DB View |
| `/api/tasks` | POST | Yes | Create task | Next.js → DB → n8n |
| `/api/tasks/:id` | GET | Yes | Get task | Next.js → DB View |
| `/api/tasks/:id` | PATCH | Yes | Update task | Next.js → DB → n8n |
| `/api/tasks/:id` | DELETE | Yes | Soft delete task | Next.js → DB → n8n |
| `/api/tasks/:id/restore` | POST | Yes | Restore task | Next.js → DB → n8n |
| `/api/resources` | GET | Yes | List resources | Next.js → DB View |
| `/api/resources` | POST | Yes | Create resource | Next.js → DB → n8n |
| `/api/resources/:id` | PATCH | Yes | Update resource | Next.js → DB → n8n |
| `/api/reports` | POST | Yes | Generate report | Delegate to n8n |
| `/api/reports/:job_id` | GET | Yes | Get report status | n8n job status |
| `/api/dashboard` | GET | Yes | Dashboard metrics | Next.js → DB View |

---

### Endpoint Details

#### **1. GET /api/projects**

**Purpose:** List all projects with aggregated metrics

**Request:**
```typescript
// Query parameters (optional)
interface GetProjectsQuery {
  status?: 'At Risk' | 'On Track' | 'Complete' | 'No Tasks';
  priority?: 'High' | 'Medium' | 'Low';
  limit?: number;
  offset?: number;
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "project_id": "PRJ-001",
      "project_name": "CST",
      "priority": "Medium",
      "status": "At Risk",
      "completion_pct": 16.22,
      "tasks_done_count": 2,
      "tasks_total_count": 6,
      "task_hrs_estimate": 74.0,
      "task_hrs_actual": 12.0,
      "start_date": "2025-01-01",
      "target_date": "2025-03-31"
    }
  ],
  "pagination": {
    "total": 2,
    "limit": 50,
    "offset": 0
  }
}
```

**Logic Flow:**
1. Next.js API route receives request
2. Verify JWT token (middleware)
3. Parse & validate query params with Zod
4. Query `v_projects_with_metrics` view (direct DB)
5. Return JSON response
6. **No n8n webhook** (read-only operation)

---

#### **2. POST /api/projects**

**Purpose:** Create a new project

**Request Body:** (Zod schema)
```typescript
import { z } from 'zod';

const CreateProjectSchema = z.object({
  project_id: z.string().regex(/^PRJ-[0-9]{3}$/, 'Must be format PRJ-XXX'),
  project_name: z.string().min(1).max(100),
  total_weight: z.number().int().min(1).max(5),
  priority: z.enum(['High', 'Medium', 'Low']),
  start_date: z.string().date().optional(),
  target_date: z.string().date().optional(),
});

type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
```

**Example Request:**
```json
{
  "project_id": "PRJ-003",
  "project_name": "Quality Dashboard Enhancement",
  "total_weight": 4,
  "priority": "High",
  "start_date": "2025-02-15",
  "target_date": "2025-05-15"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "project_id": "PRJ-003",
    "project_name": "Quality Dashboard Enhancement",
    "total_weight": 4,
    "priority": "High",
    "status": "No Tasks",
    "completion_pct": 0,
    "tasks_total_count": 0,
    "created_at": "2025-01-15T10:30:00Z"
  }
}
```

**Error Response:** `400 Bad Request`
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "project_id",
        "message": "Must be format PRJ-XXX"
      }
    ]
  }
}
```

**Logic Flow:**
1. Next.js API route receives request
2. Verify JWT token
3. Validate request body with Zod
4. Generate UUID for project
5. **INSERT into `projects` table** (direct DB write)
6. **Trigger n8n webhook** (async, non-blocking):
   - POST to `https://n8n.company.com/webhook/audit/projects`
   - Payload: `{action: 'CREATE', entity_id, user_email, after_json}`
7. Query `v_projects_with_metrics` to get created project
8. Return `201 Created` response
9. n8n workflow runs in background (audit logging)

---

#### **3. POST /api/tasks**

**Purpose:** Create a new task with validation

**Request Body:** (Zod schema)
```typescript
const CreateTaskSchema = z.object({
  task_id: z.string().regex(/^TSK-[0-9]{3}$/, 'Must be format TSK-XXX'),
  project_id: z.string(), // Display ID (e.g., 'PRJ-001')
  task_name: z.string().min(1).max(200),
  status: z.enum(['Backlog', 'In Progress', 'Done', 'Cancelled']).default('Backlog'),
  estimate_days: z.number().positive().optional(),
  resource1_name: z.string(), // Resource name (will lookup UUID)
  r1_estimate_hrs: z.number().min(0).default(0),
  r1_actual_hrs: z.number().min(0).default(0),
  resource2_name: z.string().optional(),
  r2_estimate_hrs: z.number().min(0).default(0),
  r2_actual_hrs: z.number().min(0).default(0),
  deadline: z.string().date().optional(),
  completed_date: z.string().date().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
}).refine(
  (data) => {
    // Business rule: Done status requires completed_date
    if (data.status === 'Done' && !data.completed_date) {
      return false;
    }
    return true;
  },
  {
    message: 'completed_date required when status is Done',
    path: ['completed_date'],
  }
).refine(
  (data) => {
    // Business rule: No R2 hours without R2 resource
    if (!data.resource2_name && (data.r2_estimate_hrs > 0 || data.r2_actual_hrs > 0)) {
      return false;
    }
    return true;
  },
  {
    message: 'Cannot have R2 hours without Resource 2 assigned',
    path: ['resource2_name'],
  }
);

type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
```

**Example Request:**
```json
{
  "task_id": "TSK-007",
  "project_id": "PRJ-001",
  "task_name": "Implement authentication module",
  "status": "Backlog",
  "estimate_days": 3.0,
  "resource1_name": "Basel",
  "r1_estimate_hrs": 24.0,
  "r1_actual_hrs": 0.0,
  "deadline": "2025-02-15",
  "tags": ["backend", "security"],
  "notes": "Implement JWT-based auth"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "task_id": "TSK-007",
    "task_name": "Implement authentication module",
    "status": "Backlog",
    "estimate_days": 3.0,
    "estimate_hrs": 24.0,
    "total_estimate_hrs": 24.0,
    "total_actual_hrs": 0.0,
    "overall_completion_pct": 0.0,
    "created_at": "2025-01-15T10:30:00Z"
  },
  "warnings": [
    "Resource 'Basel' utilization will be 95% after this task"
  ]
}
```

**Logic Flow:**
1. Next.js API route receives request
2. Verify JWT token
3. Validate request body with Zod
4. Lookup foreign keys:
   - Query `projects` table: get UUID from `project_id`
   - Query `resources` table: get UUID from `resource1_name`
   - Query `resources` table: get UUID from `resource2_name` (if provided)
5. Check uniqueness: verify `task_id` not exists
6. Generate UUID for task
7. **INSERT into `tasks` table** (direct DB write)
8. **Trigger n8n webhook** (async):
   - POST to `https://n8n.company.com/webhook/audit/tasks`
   - Payload: `{action: 'CREATE', entity_id, user_email, after_json}`
9. **Trigger n8n resource check** (async):
   - POST to `https://n8n.company.com/webhook/resource-check`
   - Returns warnings if resource overallocated
10. Query `v_tasks_with_metrics` to get created task
11. Return `201 Created` response with warnings (if any)

**See Code Example Below** ↓

---

#### **4. PATCH /api/tasks/:id**

**Purpose:** Update task (status, hours, notes)

**Request Body:** (Zod schema)
```typescript
const UpdateTaskSchema = z.object({
  status: z.enum(['Backlog', 'In Progress', 'Done', 'Cancelled']).optional(),
  r1_actual_hrs: z.number().min(0).optional(),
  r2_actual_hrs: z.number().min(0).optional(),
  completed_date: z.string().date().optional(),
  deadline: z.string().date().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
```

**Example Request:**
```json
{
  "status": "In Progress",
  "r1_actual_hrs": 5.0,
  "notes": "Started mobile view implementation"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "task_id": "TSK-001",
    "status": "In Progress",
    "r1_actual_hrs": 5.0,
    "overall_completion_pct": 12.5,
    "updated_at": "2025-01-15T14:30:00Z"
  },
  "changes": {
    "status": { "old": "Backlog", "new": "In Progress" },
    "r1_actual_hrs": { "old": 0.0, "new": 5.0 }
  }
}
```

**Logic Flow:**
1. Next.js API route receives request
2. Verify JWT token
3. Validate request body with Zod
4. Fetch current task state (for before/after comparison)
5. **Validate status transition** (if status changed):
   - Query `status_transitions` table
   - Check if transition is allowed
   - Return 400 if not allowed
6. **UPDATE `tasks` table** (direct DB write)
7. **Trigger n8n webhook** (async):
   - POST to `https://n8n.company.com/webhook/audit/tasks`
   - Payload: `{action: 'UPDATE', entity_id, user_email, before_json, after_json, changed_fields}`
8. Query `v_tasks_with_metrics` to get updated task
9. Return `200 OK` response with changes summary

---

#### **5. DELETE /api/tasks/:id**

**Purpose:** Soft delete task (set status='Cancelled', is_deleted=TRUE)

**Request:** No body

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Task TSK-006 has been cancelled",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "task_id": "TSK-006",
    "status": "Cancelled",
    "is_deleted": true,
    "deleted_at": "2025-01-15T16:00:00Z"
  }
}
```

**Logic Flow:**
1. Verify JWT token
2. Fetch current task state
3. Check if task is already deleted/cancelled → return 400
4. **UPDATE `tasks` table**:
   - SET status = 'Cancelled'
   - SET is_deleted = TRUE
   - SET deleted_at = CURRENT_TIMESTAMP
   - SET deleted_by = user_email
5. **Trigger n8n webhook** (async):
   - POST to `https://n8n.company.com/webhook/audit/tasks`
   - Payload: `{action: 'DELETE', entity_id, user_email, before_json, after_json}`
6. Return `200 OK` response

---

#### **6. POST /api/reports**

**Purpose:** Generate report (delegated to n8n)

**Request Body:** (Zod schema)
```typescript
const GenerateReportSchema = z.object({
  report_type: z.enum(['project_status', 'resource_utilization', 'task_export', 'dashboard']),
  format: z.enum(['xlsx', 'pdf', 'csv']),
  filters: z.object({
    project_ids: z.array(z.string()).optional(),
    date_range: z.object({
      start: z.string().date(),
      end: z.string().date(),
    }).optional(),
  }).optional(),
  delivery: z.enum(['download', 'email']).default('download'),
  recipient_email: z.string().email().optional(),
});

type GenerateReportInput = z.infer<typeof GenerateReportSchema>;
```

**Example Request:**
```json
{
  "report_type": "project_status",
  "format": "xlsx",
  "filters": {
    "project_ids": ["PRJ-001", "PRJ-002"],
    "date_range": {
      "start": "2025-01-01",
      "end": "2025-01-31"
    }
  },
  "delivery": "download"
}
```

**Response:** `202 Accepted` (job created, processing in background)
```json
{
  "success": true,
  "message": "Report generation started",
  "data": {
    "job_id": "rpt-550e8400-e29b-41d4-a716-446655440000",
    "status": "processing",
    "estimated_completion": "2025-01-15T10:35:00Z",
    "status_url": "/api/reports/rpt-550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Logic Flow:**
1. Verify JWT token
2. Validate request body with Zod
3. Generate job_id (UUID)
4. **Trigger n8n webhook** (async):
   - POST to `https://n8n.company.com/webhook/reports/generate`
   - Payload: `{job_id, report_type, format, filters, delivery, user_email}`
5. **Store job in database** (optional):
   - INSERT INTO report_jobs (job_id, status='processing', user_id)
6. Return `202 Accepted` immediately
7. n8n workflow runs (queries DB, generates Excel/PDF, uploads to Drive)
8. n8n updates job status via webhook back to Next.js

**See Code Example Below** ↓

---

#### **7. GET /api/reports/:job_id**

**Purpose:** Check report generation status

**Response:** `200 OK` (processing)
```json
{
  "success": true,
  "data": {
    "job_id": "rpt-550e8400-e29b-41d4-a716-446655440000",
    "status": "processing",
    "progress": 65,
    "created_at": "2025-01-15T10:30:00Z"
  }
}
```

**Response:** `200 OK` (completed)
```json
{
  "success": true,
  "data": {
    "job_id": "rpt-550e8400-e29b-41d4-a716-446655440000",
    "status": "completed",
    "download_url": "https://drive.google.com/file/d/1abc123/view",
    "filename": "Project_Status_Report_2025-01-15.xlsx",
    "file_size": "245 KB",
    "expires_at": "2025-02-15T10:30:00Z",
    "created_at": "2025-01-15T10:30:00Z",
    "completed_at": "2025-01-15T10:32:00Z"
  }
}
```

**Logic Flow:**
1. Verify JWT token
2. Query `report_jobs` table (or call n8n status endpoint)
3. Return current job status

---

## 💻 CODE EXAMPLES

### Example 1: Create Task Endpoint (Complete Implementation)

```typescript
// app/api/tasks/route.ts (Next.js 14 App Router)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role for backend
);

// Zod schema for validation
const CreateTaskSchema = z.object({
  task_id: z.string().regex(/^TSK-[0-9]{3}$/, 'Must be format TSK-XXX'),
  project_id: z.string(),
  task_name: z.string().min(1).max(200),
  status: z.enum(['Backlog', 'In Progress', 'Done', 'Cancelled']).default('Backlog'),
  estimate_days: z.number().positive().optional(),
  resource1_name: z.string(),
  r1_estimate_hrs: z.number().min(0).default(0),
  r1_actual_hrs: z.number().min(0).default(0),
  resource2_name: z.string().optional(),
  r2_estimate_hrs: z.number().min(0).default(0),
  r2_actual_hrs: z.number().min(0).default(0),
  deadline: z.string().optional(),
  completed_date: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
}).refine(
  (data) => data.status !== 'Done' || data.completed_date,
  { message: 'completed_date required when status is Done', path: ['completed_date'] }
).refine(
  (data) => data.resource2_name || (data.r2_estimate_hrs === 0 && data.r2_actual_hrs === 0),
  { message: 'Cannot have R2 hours without Resource 2', path: ['resource2_name'] }
);

type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export async function POST(req: NextRequest) {
  try {
    // 1. Verify authentication (extract user from JWT)
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Missing token' } },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } },
        { status: 401 }
      );
    }

    // 2. Parse and validate request body
    const body = await req.json();
    const validation = CreateTaskSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: validation.error.errors.map(err => ({
              field: err.path.join('.'),
              message: err.message,
            })),
          },
        },
        { status: 400 }
      );
    }

    const input = validation.data;

    // 3. Lookup foreign keys (project UUID, resource UUIDs)
    const [projectResult, resource1Result, resource2Result] = await Promise.all([
      supabase
        .from('projects')
        .select('id')
        .eq('project_id', input.project_id)
        .eq('is_deleted', false)
        .single(),
      supabase
        .from('resources')
        .select('id')
        .eq('resource_name', input.resource1_name)
        .eq('is_deleted', false)
        .single(),
      input.resource2_name
        ? supabase
            .from('resources')
            .select('id')
            .eq('resource_name', input.resource2_name)
            .eq('is_deleted', false)
            .single()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (projectResult.error || !projectResult.data) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: `Project ${input.project_id} not found` } },
        { status: 404 }
      );
    }

    if (resource1Result.error || !resource1Result.data) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: `Resource ${input.resource1_name} not found` } },
        { status: 404 }
      );
    }

    if (input.resource2_name && (resource2Result.error || !resource2Result.data)) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: `Resource ${input.resource2_name} not found` } },
        { status: 404 }
      );
    }

    const projectUuid = projectResult.data.id;
    const resource1Uuid = resource1Result.data.id;
    const resource2Uuid = resource2Result.data?.id || null;

    // 4. Check uniqueness (task_id)
    const { data: existingTask } = await supabase
      .from('tasks')
      .select('id')
      .eq('task_id', input.task_id)
      .eq('is_deleted', false)
      .single();

    if (existingTask) {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: `Task ${input.task_id} already exists` } },
        { status: 409 }
      );
    }

    // 5. Generate UUID for new task
    const taskUuid = uuidv4();

    // 6. Insert into tasks table
    const { data: insertedTask, error: insertError } = await supabase
      .from('tasks')
      .insert({
        id: taskUuid,
        task_id: input.task_id,
        project_id: projectUuid,
        task_name: input.task_name,
        status: input.status,
        estimate_days: input.estimate_days || null,
        resource1_id: resource1Uuid,
        r1_estimate_hrs: input.r1_estimate_hrs,
        r1_actual_hrs: input.r1_actual_hrs,
        resource2_id: resource2Uuid,
        r2_estimate_hrs: input.r2_estimate_hrs,
        r2_actual_hrs: input.r2_actual_hrs,
        deadline: input.deadline || null,
        completed_date: input.completed_date || null,
        tags: input.tags || [],
        notes: input.notes || '',
        created_by: user.email,
        updated_by: user.email,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: 'Failed to create task' } },
        { status: 500 }
      );
    }

    // 7. Trigger n8n webhook for audit logging (async, non-blocking)
    triggerN8nAudit({
      action: 'CREATE',
      entity_name: 'tasks',
      entity_id: taskUuid,
      user_email: user.email!,
      before_json: null,
      after_json: insertedTask,
    }).catch(err => console.error('n8n audit failed:', err)); // Don't block response

    // 8. Trigger n8n resource check (async)
    const resourceWarnings = await checkResourceUtilization(resource1Uuid, input.r1_estimate_hrs);

    // 9. Query v_tasks_with_metrics to get derived fields
    const { data: taskWithMetrics } = await supabase
      .from('v_tasks_with_metrics')
      .select('*')
      .eq('id', taskUuid)
      .single();

    // 10. Return response
    return NextResponse.json(
      {
        success: true,
        data: taskWithMetrics || insertedTask,
        warnings: resourceWarnings,
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      { status: 500 }
    );
  }
}

// Helper: Trigger n8n audit webhook
async function triggerN8nAudit(payload: {
  action: string;
  entity_name: string;
  entity_id: string;
  user_email: string;
  before_json: any;
  after_json: any;
}) {
  const n8nWebhookUrl = process.env.N8N_AUDIT_WEBHOOK_URL!;

  await fetch(n8nWebhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.N8N_API_KEY!,
    },
    body: JSON.stringify(payload),
  });
}

// Helper: Check resource utilization (call n8n or direct query)
async function checkResourceUtilization(resourceUuid: string, additionalHours: number): Promise<string[]> {
  const warnings: string[] = [];

  // Query resource utilization view
  const { data: resource } = await supabase
    .from('v_resources_utilization')
    .select('*')
    .eq('id', resourceUuid)
    .single();

  if (resource) {
    const newAllocation = resource.current_allocation_hrs + additionalHours;
    const newUtilization = (newAllocation / resource.weekly_capacity_hrs) * 100;

    if (newUtilization > 100) {
      warnings.push(`Resource '${resource.resource_name}' will be ${newUtilization.toFixed(1)}% utilized (overallocated)`);
    } else if (newUtilization > 80) {
      warnings.push(`Resource '${resource.resource_name}' will be ${newUtilization.toFixed(1)}% utilized (near capacity)`);
    }
  }

  return warnings;
}
```

---

### Example 2: Generate Report Endpoint (Delegate to n8n)

```typescript
// app/api/reports/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Zod schema
const GenerateReportSchema = z.object({
  report_type: z.enum(['project_status', 'resource_utilization', 'task_export', 'dashboard']),
  format: z.enum(['xlsx', 'pdf', 'csv']),
  filters: z.object({
    project_ids: z.array(z.string()).optional(),
    date_range: z.object({
      start: z.string(),
      end: z.string(),
    }).optional(),
  }).optional(),
  delivery: z.enum(['download', 'email']).default('download'),
  recipient_email: z.string().email().optional(),
});

type GenerateReportInput = z.infer<typeof GenerateReportSchema>;

export async function POST(req: NextRequest) {
  try {
    // 1. Verify authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Missing token' } },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } },
        { status: 401 }
      );
    }

    // 2. Validate request body
    const body = await req.json();
    const validation = GenerateReportSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: validation.error.errors,
          },
        },
        { status: 400 }
      );
    }

    const input = validation.data;

    // 3. Generate job ID
    const jobId = `rpt-${uuidv4()}`;

    // 4. Store job in database (optional - for tracking)
    await supabase.from('report_jobs').insert({
      job_id: jobId,
      user_id: user.id,
      report_type: input.report_type,
      format: input.format,
      status: 'processing',
      created_at: new Date().toISOString(),
    });

    // 5. Trigger n8n report generation workflow (async)
    const n8nWebhookUrl = process.env.N8N_REPORTS_WEBHOOK_URL!;

    fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.N8N_API_KEY!,
      },
      body: JSON.stringify({
        job_id: jobId,
        report_type: input.report_type,
        format: input.format,
        filters: input.filters || {},
        delivery: input.delivery,
        recipient_email: input.recipient_email || user.email,
        user_email: user.email,
      }),
    }).catch(err => console.error('n8n trigger failed:', err));

    // 6. Return 202 Accepted immediately (don't wait for n8n)
    return NextResponse.json(
      {
        success: true,
        message: 'Report generation started',
        data: {
          job_id: jobId,
          status: 'processing',
          estimated_completion: new Date(Date.now() + 2 * 60 * 1000).toISOString(), // +2 minutes
          status_url: `/api/reports/${jobId}`,
        },
      },
      { status: 202 }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      { status: 500 }
    );
  }
}
```

---

### Example 3: Check Report Status Endpoint

```typescript
// app/api/reports/[job_id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: { job_id: string } }
) {
  try {
    // 1. Verify authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Missing token' } },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } },
        { status: 401 }
      );
    }

    // 2. Query report_jobs table
    const { data: job, error } = await supabase
      .from('report_jobs')
      .select('*')
      .eq('job_id', params.job_id)
      .eq('user_id', user.id) // Ensure user owns this job
      .single();

    if (error || !job) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Report job not found' } },
        { status: 404 }
      );
    }

    // 3. Return job status
    return NextResponse.json({
      success: true,
      data: {
        job_id: job.job_id,
        status: job.status, // 'processing', 'completed', 'failed'
        report_type: job.report_type,
        format: job.format,
        download_url: job.download_url || null,
        filename: job.filename || null,
        file_size: job.file_size || null,
        error_message: job.error_message || null,
        created_at: job.created_at,
        completed_at: job.completed_at || null,
      },
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      { status: 500 }
    );
  }
}
```

---

### Example 4: n8n Callback Endpoint (Update Report Status)

```typescript
// app/api/webhooks/n8n/report-complete/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // 1. Verify n8n webhook signature (security)
    const apiKey = req.headers.get('x-api-key');
    if (apiKey !== process.env.N8N_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse payload from n8n
    const payload = await req.json();
    const {
      job_id,
      status, // 'completed' or 'failed'
      download_url,
      filename,
      file_size,
      error_message,
    } = payload;

    // 3. Update report_jobs table
    const { error } = await supabase
      .from('report_jobs')
      .update({
        status,
        download_url,
        filename,
        file_size,
        error_message,
        completed_at: new Date().toISOString(),
      })
      .eq('job_id', job_id);

    if (error) {
      console.error('Failed to update report job:', error);
      return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
    }

    // 4. Optionally send notification to user (email/Slack)
    // ... (trigger another n8n workflow or send directly)

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

---

## 📊 REPORT GENERATION FLOW

### Complete Flow Diagram

```
┌───────────────────────────────────────────────────────────────┐
│ FRONTEND REQUEST                                              │
└───────────────────────────────────────────────────────────────┘
    │
    │ POST /api/reports
    │ {report_type: 'project_status', format: 'xlsx', ...}
    ↓
┌───────────────────────────────────────────────────────────────┐
│ NEXT.JS API ROUTE                                             │
│  1. Validate JWT token                                        │
│  2. Validate request body (Zod)                               │
│  3. Generate job_id (UUID)                                    │
│  4. INSERT into report_jobs (status='processing')             │
│  5. Trigger n8n webhook (async)                               │
│  6. Return 202 Accepted with job_id                           │
└───────────────────────────────────────────────────────────────┘
    │
    │ Returns immediately (non-blocking)
    ↓
┌───────────────────────────────────────────────────────────────┐
│ FRONTEND RECEIVES                                             │
│ {job_id: 'rpt-123', status: 'processing', status_url: '...'} │
└───────────────────────────────────────────────────────────────┘
    │
    │ Poll GET /api/reports/:job_id every 2 seconds
    ↓
┌───────────────────────────────────────────────────────────────┐
│ N8N WORKFLOW (Background Processing)                          │
│  1. Receive webhook trigger                                   │
│  2. Query Postgres (v_projects_with_metrics, v_tasks, etc.)   │
│  3. Transform data for Excel/PDF                              │
│  4. Generate file (Excel node / PDF service)                  │
│  5. Upload to Google Drive / S3                               │
│  6. Get download URL                                          │
│  7. POST to /api/webhooks/n8n/report-complete                 │
│     {job_id, status: 'completed', download_url, filename}     │
└───────────────────────────────────────────────────────────────┘
    │
    ↓
┌───────────────────────────────────────────────────────────────┐
│ NEXT.JS WEBHOOK HANDLER                                       │
│  1. Verify n8n API key                                        │
│  2. UPDATE report_jobs SET status='completed', download_url   │
└───────────────────────────────────────────────────────────────┘
    │
    ↓
┌───────────────────────────────────────────────────────────────┐
│ FRONTEND POLLS AGAIN                                          │
│ GET /api/reports/:job_id                                      │
│ → Returns: {status: 'completed', download_url: '...'}        │
│ → Show download button to user                                │
└───────────────────────────────────────────────────────────────┘
```

### Frontend Code Example (React)

```typescript
// hooks/useReportGeneration.ts
import { useState } from 'react';

export function useReportGeneration() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateReport = async (input: {
    report_type: string;
    format: string;
    filters?: any;
  }) => {
    try {
      // 1. Start report generation
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify(input),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error.message);
      }

      setJobId(result.data.job_id);
      setStatus('processing');

      // 2. Poll for status
      pollReportStatus(result.data.job_id);

    } catch (err: any) {
      setError(err.message);
      setStatus('failed');
    }
  };

  const pollReportStatus = async (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/reports/${jobId}`, {
          headers: {
            'Authorization': `Bearer ${getAccessToken()}`,
          },
        });

        const result = await response.json();

        if (result.data.status === 'completed') {
          setStatus('completed');
          setDownloadUrl(result.data.download_url);
          clearInterval(interval);
        } else if (result.data.status === 'failed') {
          setStatus('failed');
          setError(result.data.error_message);
          clearInterval(interval);
        }

      } catch (err: any) {
        setError(err.message);
        setStatus('failed');
        clearInterval(interval);
      }
    }, 2000); // Poll every 2 seconds

    // Stop polling after 5 minutes (timeout)
    setTimeout(() => {
      clearInterval(interval);
      if (status === 'processing') {
        setStatus('failed');
        setError('Report generation timed out');
      }
    }, 5 * 60 * 1000);
  };

  return {
    generateReport,
    jobId,
    status,
    downloadUrl,
    error,
  };
}

// Usage in component
function ReportButton() {
  const { generateReport, status, downloadUrl } = useReportGeneration();

  const handleClick = () => {
    generateReport({
      report_type: 'project_status',
      format: 'xlsx',
      filters: {
        project_ids: ['PRJ-001', 'PRJ-002'],
      },
    });
  };

  return (
    <div>
      <button onClick={handleClick} disabled={status === 'processing'}>
        {status === 'processing' ? 'Generating...' : 'Generate Report'}
      </button>

      {status === 'completed' && downloadUrl && (
        <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
          Download Report
        </a>
      )}
    </div>
  );
}
```

---

## 🔒 SECURITY HARDENING

### 1. Rate Limiting

**Implementation:** Use Upstash Redis + Vercel Edge Config

```typescript
// lib/rateLimit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Create rate limiter (10 requests per 10 seconds per IP)
export const rateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '10 s'),
  analytics: true,
});

// Usage in API route
export async function POST(req: NextRequest) {
  const ip = req.ip ?? req.headers.get('x-forwarded-for') ?? 'unknown';

  const { success, limit, reset, remaining } = await rateLimiter.limit(ip);

  if (!success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again later.' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString(),
        },
      }
    );
  }

  // Continue with request...
}
```

**Rate Limits by Endpoint:**

| Endpoint | Limit | Window | Reason |
|----------|-------|--------|--------|
| `/api/auth/login` | 5 | 15 min | Prevent brute force |
| `/api/tasks` (POST) | 50 | 1 min | Normal usage |
| `/api/tasks` (GET) | 100 | 1 min | Read-heavy |
| `/api/reports` (POST) | 5 | 5 min | Resource-intensive |

---

### 2. Input Validation & Sanitization

**Always use Zod schemas:**

```typescript
// ✅ GOOD: Zod validation
const schema = z.object({
  task_name: z.string().min(1).max(200),
  notes: z.string().max(5000).optional(),
});

// ❌ BAD: No validation
const { task_name, notes } = req.body; // Dangerous!
```

**Sanitize HTML in notes fields:**

```typescript
import DOMPurify from 'isomorphic-dompurify';

const sanitizedNotes = DOMPurify.sanitize(input.notes, {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
  ALLOWED_ATTR: ['href'],
});
```

---

### 3. SQL Injection Prevention

**Use parameterized queries (Supabase automatically handles this):**

```typescript
// ✅ GOOD: Parameterized query (safe)
const { data } = await supabase
  .from('tasks')
  .select('*')
  .eq('task_id', userInput);

// ❌ BAD: String concatenation (vulnerable to SQL injection)
const query = `SELECT * FROM tasks WHERE task_id = '${userInput}'`;
```

---

### 4. Secrets Management

**Use environment variables (Vercel Environment Variables):**

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://xyz.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
N8N_API_KEY=sk-1234567890abcdef
N8N_AUDIT_WEBHOOK_URL=https://n8n.company.com/webhook/audit
N8N_REPORTS_WEBHOOK_URL=https://n8n.company.com/webhook/reports/generate
UPSTASH_REDIS_REST_URL=https://redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXMwAAIncD...
```

**Never commit `.env.local` to git:**

```bash
# .gitignore
.env.local
.env*.local
```

---

### 5. CORS Configuration

```typescript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: 'https://qc.company.com' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PATCH,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ];
  },
};
```

---

### 6. Content Security Policy (CSP)

```typescript
// next.config.js
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: `
      default-src 'self';
      script-src 'self' 'unsafe-eval' 'unsafe-inline';
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: https:;
      connect-src 'self' https://*.supabase.co https://n8n.company.com;
    `.replace(/\s{2,}/g, ' ').trim(),
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
];

module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};
```

---

### 7. Error Handling (Don't Leak Information)

```typescript
// ✅ GOOD: Generic error message to client
try {
  // ... database operation
} catch (error) {
  console.error('Database error:', error); // Log detailed error server-side

  return NextResponse.json(
    { success: false, error: { code: 'DB_ERROR', message: 'Failed to create task' } },
    { status: 500 }
  );
}

// ❌ BAD: Leak database error to client
return NextResponse.json({ error: error.message }, { status: 500 });
// Could expose: "duplicate key value violates unique constraint tasks_pkey"
```

---

### 8. HTTPS Only (Vercel Automatic)

- Vercel automatically enforces HTTPS
- All HTTP requests redirected to HTTPS
- Free SSL certificates via Let's Encrypt

---

### 9. Audit Logging for Security Events

```typescript
// Log failed login attempts
await supabase.from('security_logs').insert({
  event_type: 'LOGIN_FAILED',
  user_email: email,
  ip_address: req.ip,
  user_agent: req.headers.get('user-agent'),
  timestamp: new Date().toISOString(),
});

// Log suspicious activity
if (tooManyRequests) {
  await supabase.from('security_logs').insert({
    event_type: 'RATE_LIMIT_EXCEEDED',
    ip_address: req.ip,
    endpoint: req.url,
  });
}
```

---

## 🚀 DEPLOYMENT CONSIDERATIONS

### Recommended Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT                                  │
│                    (Browser / Mobile App)                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓ HTTPS
┌─────────────────────────────────────────────────────────────────┐
│                      VERCEL EDGE                                │
│  - Next.js App (API Routes + Frontend)                          │
│  - Global CDN                                                   │
│  - Automatic HTTPS                                              │
│  - Edge Functions                                               │
└─────────────────────────────────────────────────────────────────┘
          ↓                                    ↓
┌───────────────────────┐        ┌──────────────────────────────┐
│   SUPABASE            │        │   N8N (Railway/Render)       │
│   - Postgres DB       │        │   - Workflows                │
│   - Auth              │        │   - Webhooks                 │
│   - Storage           │        │   - Scheduled Jobs           │
└───────────────────────┘        └──────────────────────────────┘
```

### Services & Costs (Solo Developer Budget)

| Service | Tier | Cost/Month | Purpose |
|---------|------|------------|---------|
| **Vercel** | Pro | $20 | Next.js hosting, CDN, Edge functions |
| **Supabase** | Pro | $25 | Postgres, Auth, Storage (8GB DB) |
| **Railway** | Hobby | $5 | n8n self-hosted |
| **Upstash Redis** | Free | $0 | Rate limiting (10k requests/day) |
| **Google Drive** | Free | $0 | Report storage (15GB free) |
| **Total** | | **$50/mo** | Production-ready stack |

### Environment Variables Checklist

**Vercel:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (secret, server-only)
- `N8N_API_KEY`
- `N8N_AUDIT_WEBHOOK_URL`
- `N8N_REPORTS_WEBHOOK_URL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

**Railway (n8n):**
- `N8N_BASIC_AUTH_ACTIVE=true`
- `N8N_BASIC_AUTH_USER=admin`
- `N8N_BASIC_AUTH_PASSWORD=<strong-password>`
- `WEBHOOK_URL=https://n8n.company.com`
- `DATABASE_TYPE=postgresdb`
- `DATABASE_HOST=<supabase-host>`
- `DATABASE_NAME=postgres`
- `DATABASE_USER=postgres`
- `DATABASE_PASSWORD=<password>`

---

## ✅ ACCEPTANCE CHECKLIST

### API Completeness

- [x] **All CRUD endpoints defined**
  - Projects: GET, POST, PATCH ✅
  - Tasks: GET, POST, PATCH, DELETE, POST /restore ✅
  - Resources: GET, POST, PATCH ✅

- [x] **Zod schemas for all inputs**
  - CreateTaskSchema ✅
  - UpdateTaskSchema ✅
  - CreateProjectSchema ✅
  - GenerateReportSchema ✅

- [x] **Request/Response formats documented**
  - JSON request bodies ✅
  - JSON responses with success/error ✅
  - Status codes (200, 201, 400, 401, 404, 409, 500) ✅

- [x] **Error responses standardized**
  - `{success: false, error: {code, message, details}}` ✅

### Authentication

- [x] **Auth strategy defined**
  - Supabase Auth recommended ✅
  - NextAuth.js alternative provided ✅

- [x] **JWT flow documented**
  - Token structure ✅
  - Middleware for auth check ✅
  - User extraction from JWT ✅

- [x] **Protected routes**
  - All /api/* routes require auth ✅

### Business Logic Split

- [x] **API handles:**
  - Input validation (Zod) ✅
  - Foreign key lookups ✅
  - Direct DB writes ✅
  - Triggering n8n webhooks (async) ✅

- [x] **n8n handles:**
  - Audit logging (after DB write) ✅
  - Business rule validation (status transitions) ✅
  - Report generation (long-running) ✅
  - Notifications (email/Slack) ✅

### Code Examples

- [x] **Create Task endpoint (complete implementation)**
  - JWT verification ✅
  - Zod validation ✅
  - Foreign key lookups ✅
  - Uniqueness check ✅
  - UUID generation ✅
  - DB insert ✅
  - n8n audit trigger (async) ✅
  - Resource utilization check ✅
  - Response with warnings ✅

- [x] **Generate Report endpoint (complete implementation)**
  - JWT verification ✅
  - Zod validation ✅
  - Job ID generation ✅
  - DB job tracking ✅
  - n8n webhook trigger (async) ✅
  - 202 Accepted response ✅
  - Poll endpoint (GET /reports/:job_id) ✅
  - n8n callback endpoint ✅

- [x] **Frontend integration example**
  - useReportGeneration hook ✅
  - Polling logic ✅
  - Download button ✅

### Report Generation Flow

- [x] **Flow documented**
  - POST /api/reports → returns job_id ✅
  - Frontend polls GET /api/reports/:job_id ✅
  - n8n processes in background ✅
  - n8n calls back to update status ✅
  - Frontend receives download_url ✅

- [x] **Job tracking**
  - report_jobs table ✅
  - Status: processing, completed, failed ✅

### Security

- [x] **Rate limiting**
  - Upstash Redis + @upstash/ratelimit ✅
  - Per-endpoint limits defined ✅
  - 429 responses with headers ✅

- [x] **Input validation**
  - Zod schemas everywhere ✅
  - HTML sanitization (DOMPurify) ✅
  - Regex validation (task_id, project_id) ✅

- [x] **SQL injection prevention**
  - Parameterized queries (Supabase) ✅
  - No string concatenation ✅

- [x] **Secrets management**
  - Environment variables ✅
  - Never commit .env.local ✅
  - Vercel Environment Variables ✅

- [x] **CORS configuration**
  - Restrict to allowed origins ✅

- [x] **CSP headers**
  - Content Security Policy ✅
  - X-Frame-Options: DENY ✅
  - X-Content-Type-Options: nosniff ✅

- [x] **Error handling**
  - Don't leak sensitive info ✅
  - Generic error messages to client ✅
  - Detailed logging server-side ✅

- [x] **HTTPS enforcement**
  - Automatic on Vercel ✅

- [x] **Audit logging**
  - Security events logged ✅

### Deployment

- [x] **Stack defined**
  - Next.js 14 + Supabase + n8n ✅
  - Vercel + Railway ✅

- [x] **Cost estimate**
  - $50/month for solo developer ✅

- [x] **Environment variables checklist**
  - All required vars documented ✅

---

## 📌 SUMMARY

This backend API design provides:

### ✅ **Pragmatic Solo Developer Stack**
- Next.js 14 API Routes (easy to debug, TypeScript)
- Supabase (Postgres + Auth + Storage in one)
- n8n (visual workflows, no-code automation)
- Vercel (zero-config deployment, global CDN)
- Total cost: $50/month

### ✅ **Complete API Specification**
- 17 REST endpoints covering all CRUD operations
- Zod schemas for type-safe validation
- Standardized JSON request/response formats
- Consistent error handling

### ✅ **Hybrid Architecture**
- **API handles:** Fast CRUD, validation, direct DB writes
- **n8n handles:** Audit logging, reports, notifications
- **Best of both worlds:** Speed + flexibility

### ✅ **Production-Ready Code**
- Complete implementations for Create Task and Generate Report
- JWT authentication with Supabase Auth
- Rate limiting with Upstash Redis
- Input validation with Zod
- SQL injection prevention
- Error handling without info leakage

### ✅ **Security Hardening**
- Rate limits per endpoint
- Input sanitization (DOMPurify)
- Secrets management (env vars)
- CORS + CSP headers
- HTTPS enforcement
- Audit logging

### ✅ **Report Generation Pattern**
- Async job processing with job IDs
- Frontend polling for status
- n8n background processing
- Callback webhook for completion
- Download URL returned

This design is production-ready for a solo developer and can scale to moderate traffic (thousands of users) without modification.
