# Report Subsystem Acceptance Criteria

## Overview

This document defines the acceptance criteria for the QC Management Tool reporting subsystem.

---

## 1. Project Summary PDF Report

### Functional Requirements

| ID | Requirement | Test Method |
|----|-------------|-------------|
| PDF-001 | Webhook endpoint `/qc/reports/project-summary` accepts POST requests | Manual API test |
| PDF-002 | Validates `project_id` is present and returns 400 if missing | API test with empty body |
| PDF-003 | Returns 404 if project not found or deleted | API test with invalid UUID |
| PDF-004 | Queries project details from database | DB query verification |
| PDF-005 | Queries all non-deleted tasks for project | DB query verification |
| PDF-006 | Calculates correct statistics (total, completed, pending, in_progress, failed) | Manual verification |
| PDF-007 | Calculates correct completion percentage | Manual verification |
| PDF-008 | Generates valid HTML with all project data | HTML inspection |
| PDF-009 | Converts HTML to PDF successfully | PDF opens without error |
| PDF-010 | Uploads PDF to S3/storage | S3 console verification |
| PDF-011 | Returns signed URL that allows download | URL download test |
| PDF-012 | Signed URL expires after specified time (default: 1 hour) | Expired URL test |

### Content Requirements

| ID | Requirement | Verification |
|----|-------------|--------------|
| PDF-C01 | Header contains company name and report metadata | Visual inspection |
| PDF-C02 | Project details section shows: name, ID, owner, status, dates | Visual inspection |
| PDF-C03 | Statistics section shows all 5 task counts | Visual inspection |
| PDF-C04 | Progress bar shows correct completion percentage | Visual inspection |
| PDF-C05 | Task table shows all tasks with correct columns | Visual inspection |
| PDF-C06 | Status badges display with appropriate colors | Visual inspection |
| PDF-C07 | Footer contains confidentiality notice | Visual inspection |

### Response Format

```json
{
  "success": true,
  "download_url": "https://...",
  "filename": "project-summary-{uuid}-{timestamp}.pdf",
  "expires_in": 3600,
  "report_id": "RPT-...",
  "generated_at": "ISO timestamp"
}
```

---

## 2. Task Export Excel Report

### Functional Requirements

| ID | Requirement | Test Method |
|----|-------------|-------------|
| XLS-001 | Webhook endpoint `/qc/reports/task-export` accepts POST requests | Manual API test |
| XLS-002 | Accepts optional filters: project_id, status[], date_from, date_to, assignee | API test with filters |
| XLS-003 | Returns 404 if no tasks match filters | API test with restrictive filters |
| XLS-004 | Builds correct SQL query based on filters | Query inspection |
| XLS-005 | Returns all matching tasks as Excel rows | Row count verification |
| XLS-006 | Excel file has correct headers | File inspection |
| XLS-007 | Date columns are properly formatted | File inspection |
| XLS-008 | Uploads Excel to S3/storage | S3 console verification |
| XLS-009 | Returns signed URL that allows download | URL download test |
| XLS-010 | Response includes row count | Response verification |

### Column Requirements

| Column Name | Type | Present |
|-------------|------|---------|
| Task ID | UUID | ✓ |
| Task Name | String | ✓ |
| Project ID | UUID | ✓ |
| Project Name | String | ✓ |
| Status | String | ✓ |
| Assignee | String | ✓ |
| Created At | DateTime | ✓ |
| Due Date | Date | ✓ |
| Completed At | DateTime | ✓ |
| Priority | String | ✓ |
| Notes | String | ✓ |

### Response Format

```json
{
  "success": true,
  "download_url": "https://...",
  "filename": "task-export-{timestamp}.xlsx",
  "expires_in": 3600,
  "generated_at": "ISO timestamp",
  "row_count": 47,
  "filters_applied": { ... }
}
```

---

## 3. Cleanup Workflow

### Functional Requirements

| ID | Requirement | Test Method |
|----|-------------|-------------|
| CLN-001 | Runs daily at 2:00 AM | Schedule verification |
| CLN-002 | Deletes on-demand reports older than 7 days | File age check |
| CLN-003 | Deletes scheduled reports older than 90 days | File age check |
| CLN-004 | Deletes temp files older than 1 day | File age check |
| CLN-005 | Logs all deletions to audit_log table | DB verification |
| CLN-006 | Does not delete files within retention period | Non-deletion check |

---

## 4. Frontend Integration

### Functional Requirements

| ID | Requirement | Test Method |
|----|-------------|-------------|
| FE-001 | Download button triggers API call on click | Browser dev tools |
| FE-002 | Shows loading state during generation | Visual inspection |
| FE-003 | Opens download URL in new tab on success | Browser behavior |
| FE-004 | Displays error message on failure | Error scenario test |
| FE-005 | Error message can be dismissed | UI interaction |
| FE-006 | Filter panel allows date range selection | UI interaction |
| FE-007 | Filter panel allows multi-status selection | UI interaction |
| FE-008 | Filter panel allows assignee selection | UI interaction |
| FE-009 | Clear filters button resets all filters | UI interaction |
| FE-010 | "Filtered" badge shows when filters active | Visual inspection |

---

## 5. Error Handling

### Error Scenarios

| Scenario | Expected Code | Expected Message |
|----------|---------------|------------------|
| Missing project_id | 400 | project_id is required |
| Invalid project_id | 404 | Project not found or has been deleted |
| No matching tasks | 404 | No tasks match the specified filters |
| PDF generation failure | 500 | Report generation failed |
| S3 upload failure | 500 | Failed to store report |
| Rate limit exceeded | 429 | Rate limit exceeded |

---

## 6. Performance Requirements

| Metric | Target |
|--------|--------|
| PDF generation time | < 10 seconds for projects with < 100 tasks |
| Excel generation time | < 15 seconds for exports with < 1000 rows |
| Signed URL validity | Configurable, default 1 hour |
| Cleanup workflow duration | < 5 minutes |

---

## 7. Security Requirements

| ID | Requirement |
|----|-------------|
| SEC-001 | Webhook endpoints require authentication |
| SEC-002 | Users can only generate reports for projects they have access to |
| SEC-003 | Signed URLs are time-limited |
| SEC-004 | No sensitive data in URL paths or query strings |
| SEC-005 | Audit log captures all report generation events |

---

## Test Execution Checklist

### Pre-Test Setup
- [ ] n8n workflows imported and active
- [ ] Database populated with test data
- [ ] S3 bucket created with correct permissions
- [ ] AWS credentials configured in n8n
- [ ] PDF generation service (PDFShift) credentials configured

### PDF Report Tests
- [ ] PDF-001 through PDF-012 pass
- [ ] PDF-C01 through PDF-C07 pass
- [ ] Response matches expected format

### Excel Report Tests
- [ ] XLS-001 through XLS-010 pass
- [ ] All columns present and correctly formatted
- [ ] Response matches expected format

### Cleanup Tests
- [ ] CLN-001 through CLN-006 pass

### Frontend Tests
- [ ] FE-001 through FE-010 pass

### Error Handling Tests
- [ ] All error scenarios return correct codes and messages

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| QA | | | |
| Product Owner | | | |
