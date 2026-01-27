# QC Management Tool - API Usage Guide

## Overview

This guide provides practical examples for interacting with the QC Management Tool REST API.

## Base URL

```
Development: http://localhost:3001/api
Production: https://your-domain.com/api
```

## Authentication

All API requests require a JWT token in the Authorization header:

```bash
Authorization: Bearer <your_jwt_token>
```

## Common Endpoints

### Projects

#### List All Projects
```bash
GET /api/projects

# Example with curl
curl -X GET "http://localhost:3001/api/projects" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-here",
      "project_id": "PRJ-001",
      "project_name": "CST",
      "status": "At Risk",
      "completion_pct": 16.22,
      "tasks_done_count": 2,
      "tasks_total_count": 6
    }
  ]
}
```

#### Create Project
```bash
POST /api/projects
Content-Type: application/json

{
  "project_id": "PRJ-003",
  "project_name": "New Project",
  "priority": "High",
  "start_date": "2025-02-01",
  "target_date": "2025-05-31"
}
```

### Tasks

#### List Tasks
```bash
GET /api/tasks?project_id=PRJ-001&status=In Progress

# Example
curl -X GET "http://localhost:3001/api/tasks?status=Backlog" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Create Task
```bash
POST /api/tasks
Content-Type: application/json

{
  "task_id": "TSK-010",
  "project_id": "PRJ-001",
  "task_name": "Implement authentication",
  "status": "Backlog",
  "estimate_days": 3.0,
  "resource1_name": "Basel",
  "r1_estimate_hrs": 24.0,
  "deadline": "2025-02-15",
  "tags": ["backend", "security"]
}
```

#### Update Task
```bash
PATCH /api/tasks/:id
Content-Type: application/json

{
  "status": "In Progress",
  "r1_actual_hrs": 8.0,
  "notes": "Started implementation"
}
```

### Resources

#### List Resources
```bash
GET /api/resources

# Response includes utilization metrics
{
  "success": true,
  "data": [
    {
      "resource_name": "Basel",
      "weekly_capacity_hrs": 40,
      "current_allocation_hrs": 38,
      "utilization_pct": 95.0,
      "active_tasks_count": 3
    }
  ]
}
```

#### Create Resource
```bash
POST /api/resources
Content-Type: application/json

{
  "resource_name": "John Doe",
  "weekly_capacity_hrs": 40,
  "email": "john@example.com",
  "department": "QA",
  "role": "Test Engineer"
}
```

### Reports

#### Generate Report
```bash
POST /api/reports
Content-Type: application/json

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

# Response (202 Accepted)
{
  "success": true,
  "message": "Report generation started",
  "data": {
    "job_id": "rpt-550e8400-...",
    "status": "processing",
    "status_url": "/api/reports/rpt-550e8400-..."
  }
}
```

#### Check Report Status
```bash
GET /api/reports/:job_id

# When complete:
{
  "success": true,
  "data": {
    "job_id": "rpt-550e8400-...",
    "status": "completed",
    "download_url": "https://drive.google.com/file/d/...",
    "filename": "Project_Status_Report_2025-01-15.xlsx"
  }
}
```

### Dashboard

#### Get Dashboard Metrics
```bash
GET /api/dashboard

# Response
{
  "success": true,
  "data": {
    "total_tasks": 24,
    "tasks_done": 8,
    "tasks_in_progress": 10,
    "overall_completion_rate_pct": 33.33,
    "total_projects": 3,
    "projects_at_risk": 1,
    "active_resources": 5,
    "overallocated_resources": 2
  }
}
```

## Error Handling

All errors follow this format:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "task_id",
        "message": "Must be format TSK-XXX"
      }
    ]
  }
}
```

**Common Error Codes:**
- `UNAUTHORIZED` (401): Missing or invalid token
- `VALIDATION_ERROR` (400): Invalid request data
- `NOT_FOUND` (404): Resource not found
- `CONFLICT` (409): Duplicate resource (e.g., task_id already exists)
- `INTERNAL_ERROR` (500): Server error

## Rate Limits

- **Development**: No limits
- **Production**: 100 requests/minute per user

## Best Practices

1. **Always validate input** before sending requests
2. **Handle errors gracefully** - check for `success: false`
3. **Use query parameters** for filtering and pagination
4. **Cache dashboard metrics** - they're expensive to calculate
5. **Poll report status** every 2-3 seconds (don't spam)
6. **Reuse JWT tokens** - they're valid for 24 hours

## JavaScript/TypeScript Examples

### Using Axios
```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3001/api',
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
  },
});

// Create task
const createTask = async (taskData) => {
  try {
    const response = await api.post('/tasks', taskData);
    return response.data;
  } catch (error) {
    console.error('Failed to create task:', error.response?.data);
    throw error;
  }
};

// Get projects
const getProjects = async (filters = {}) => {
  const response = await api.get('/projects', { params: filters });
  return response.data.data;
};
```

### Using Fetch
```javascript
const API_BASE = 'http://localhost:3001/api';
const token = localStorage.getItem('token');

async function createProject(projectData) {
  const response = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(projectData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error.message);
  }

  return response.json();
}
```

## Testing with Postman

1. **Import Collection**: Use the Postman collection in `docs/postman/`
2. **Set Environment Variables**:
   - `base_url`: `http://localhost:3001/api`
   - `token`: Your JWT token
3. **Run Collection**: Execute all endpoints sequentially

## Further Reading

- [Backend API Design](../02-architecture/api-specification.md) - Complete API specification
- [Development Guide](./development-guide.md) - Local development setup
- [Deployment Guide](./deployment-guide.md) - Production deployment

---

**Questions?** Check the [main README](../../README.md) or file an issue on GitHub.
