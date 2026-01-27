# QC Management Tool - Software Requirements Specification (SRS)

**Version:** 2.0
**Date:** January 2026
**Status:** Approved for Development

---

## 1. Introduction

This Software Requirements Specification (SRS) provides a comprehensive description of the `QC Management Tool`. It details the functional and non-functional requirements, system architecture, database schema, API specifications, and workflow logic required to build the platform.

### 1.1 Purpose
The purpose of this document is to serve as the "Build Blueprint" for developers. It aggregates all distributed design documents into a single logical package.

### 1.2 Scope
This SRS covers:
- **Database Layer**: PostgreSQL schema, views, and security.
- **Backend Layer**: Next.js API routes, authentication, and validation.
- **Frontend Layer**: Next.js UI, React components, and state management.
- **Automation Layer**: n8n workflows for complex business logic.

---

## 2. System Architecture

The system follows a "Hybrid Thin-API" architecture:
- **Frontend**: Next.js 14 (App Router)
- **Backend API**: Next.js API Routes (handling CRUD & Auth)
- **Automation Engine**: n8n (handling complex logic, reports, notifications)
- **Database**: PostgreSQL (Supabase)

---

## 3. Detailed Specifications

The detailed requirements are broken down into the following specialized documents. These files are located in this directory and contain the "every detail" specifications requested.

| Section | Document | Description |
|:---|:---|:---|
| **3.1 Database** | [SRS_1_Database_Design.md](./SRS_1_Database_Design.md) | Full SQL Schema (DDL), Entity-Relationship Models, Views, and Trigger Logic. |
| **3.2 API** | [SRS_2_API_Specification.md](./SRS_2_API_Specification.md) | REST API Endpoints, Request/Response JSON schemas, Auth flows, and n8n webhook triggers. |
| **3.3 Frontend** | [SRS_3_Frontend_Design.md](./SRS_3_Frontend_Design.md) | React Component hierarchy, Page specifications, UI State management, and Starter Code. |
| **3.4 Workflows** | [SRS_4_Workflow_Design.md](./SRS_4_Workflow_Design.md) | Logic for the 38 n8n workflows covering CRUD, Reporting, and Notifications. |

---

## 4. Product Requirements (PRD)

For the high-level business goals, user personas, and success metrics, refer to the **Product Requirements Document**:
- [PRD.md](./PRD.md)

---

## 5. Non-Functional Requirements

### 5.1 Performance
- **Dashboard Load**: < 3.0 seconds (P95)
- **API Response**: < 500ms for CRUD operations
- **Report Generation**: Async processing for heavy reports

### 5.2 Security
- **Authentication**: JWT-based (Supabase Auth)
- **Authorization**: Row-Level Security (RLS) in PostgreSQL
- **Audit**: Immutable, append-only logs for ALL mutations (See *SRS_1_Database_Design.md - Section 7*)

### 5.3 Reliability
- **Data Integrity**: Enforced via Foreign Keys and Check Constraints at DB level.
- **Availability**: 99.9% uptime target.

---

**End of SRS Master Document**
