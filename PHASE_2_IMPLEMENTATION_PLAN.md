# Phase 2: Governance Dashboard & Reporting - Implementation Plan

**Date:** 2026-01-21
**Phase:** 2 - Governance Dashboard & Reporting
**Goal:** Provide actionable decision-support views for QA Leads and visible health monitoring
**Status:** Planning Complete, Ready to Implement

---

## Overview

Phase 2 builds on the Phase 1 foundation to provide:
- **Governance Dashboard** - Executive-level quality visibility
- **Release Readiness** - Go/No-Go decision support
- **Risk Indicators** - Proactive problem identification
- **Quality Heatmaps** - Visual project health overview
- **Standard Reports** - PDF/Excel exports for stakeholders

---

## Architecture Design

### Data Flow
```
Phase 1 Data (test_result)
        ↓
Existing Views (v_project_quality_metrics, v_test_execution_trends)
        ↓
New Aggregation Views
        ↓
Governance Dashboard API
        ↓
Frontend Widgets & Reports
        ↓
PDF/Excel Export Engine
```

### New Components Required

1. **Backend:**
   - Quality thresholds configuration table
   - Release readiness calculation service
   - Risk detection algorithms
   - Report generation engine

2. **Frontend:**
   - Governance dashboard page
   - Release readiness widget
   - Project quality heatmap component
   - Risk indicator badges
   - Report viewer/downloader

3. **Database:**
   - Quality thresholds table
   - Release gates history
   - Report generation metadata

---

## 📋 Implementation Breakdown

### 2.1 Governance Dashboard

#### 2.1.1 Release Readiness Widget

**Purpose:** Visual Go/No-Go indicator for project releases

**Status Calculation Logic:**
```javascript
function calculateReleaseReadiness(metrics) {
  // GREEN (Ready to Release)
  if (
    metrics.latest_pass_rate_pct >= 95 &&
    metrics.latest_not_run_pct <= 5 &&
    metrics.days_since_latest_execution <= 3 &&
    metrics.latest_failed_count === 0
  ) return { status: 'GREEN', label: 'Ready to Release' };

  // AMBER (Needs Review)
  if (
    metrics.latest_pass_rate_pct >= 80 &&
    metrics.latest_not_run_pct <= 15 &&
    metrics.days_since_latest_execution <= 7 &&
    metrics.latest_failed_count <= 5
  ) return { status: 'AMBER', label: 'Needs Review' };

  // RED (Not Ready)
  return { status: 'RED', label: 'Not Ready' };
}
```

**Database View:**
```sql
CREATE OR REPLACE VIEW v_release_readiness AS
SELECT
    p.id AS project_id,
    p.name AS project_name,
    m.latest_pass_rate_pct,
    m.latest_not_run_pct,
    m.latest_failed_count,
    m.days_since_latest_execution,
    CASE
        WHEN m.latest_pass_rate_pct >= 95
         AND m.latest_not_run_pct <= 5
         AND m.days_since_latest_execution <= 3
         AND m.latest_failed_count = 0
        THEN 'GREEN'
        WHEN m.latest_pass_rate_pct >= 80
         AND m.latest_not_run_pct <= 15
         AND m.days_since_latest_execution <= 7
         AND m.latest_failed_count <= 5
        THEN 'AMBER'
        ELSE 'RED'
    END AS readiness_status,
    ARRAY_REMOVE(ARRAY[
        CASE WHEN m.latest_pass_rate_pct < 95 THEN 'Low pass rate' END,
        CASE WHEN m.latest_not_run_pct > 5 THEN 'Tests not executed' END,
        CASE WHEN m.days_since_latest_execution > 3 THEN 'Stale test results' END,
        CASE WHEN m.latest_failed_count > 0 THEN 'Failing tests' END
    ], NULL) AS blocking_issues
FROM projects p
LEFT JOIN v_project_quality_metrics m ON p.id = m.project_id
WHERE p.deleted_at IS NULL;
```

**Frontend Component:**
```typescript
// components/governance/ReleaseReadinessWidget.tsx
interface ReleaseReadiness {
  project_id: string;
  project_name: string;
  readiness_status: 'GREEN' | 'AMBER' | 'RED';
  blocking_issues: string[];
  latest_pass_rate_pct: number;
  latest_not_run_pct: number;
  latest_failed_count: number;
  days_since_latest_execution: number;
}

export default function ReleaseReadinessWidget({ projectId }: Props) {
  // Fetch data
  // Display status badge
  // Show blocking issues
  // Provide action buttons
}
```

**API Endpoint:**
```javascript
// GET /governance/release-readiness/:projectId
router.get('/release-readiness/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const result = await db.query(
    'SELECT * FROM v_release_readiness WHERE project_id = $1',
    [projectId]
  );
  res.json(result.rows[0]);
});

// GET /governance/release-readiness (all projects)
router.get('/release-readiness', async (req, res) => {
  const result = await db.query('SELECT * FROM v_release_readiness ORDER BY project_name');
  res.json(result.rows);
});
```

#### 2.1.2 Risk Indicators

**Purpose:** Highlight projects with quality risks

**Risk Categories:**
1. **Low Pass Rate** - Pass rate < 80%
2. **High Not Run** - Not run % > 20%
3. **Stale Tests** - No execution in 14+ days
4. **High Failure Count** - 10+ failing tests
5. **Declining Trend** - Pass rate dropped > 10% in last week

**Database View:**
```sql
CREATE OR REPLACE VIEW v_quality_risks AS
WITH trend_comparison AS (
    SELECT
        project_id,
        AVG(CASE
            WHEN executed_at >= CURRENT_DATE - INTERVAL '7 days'
            THEN (passed_count::FLOAT / NULLIF(tests_executed, 0) * 100)
        END) AS recent_pass_rate,
        AVG(CASE
            WHEN executed_at >= CURRENT_DATE - INTERVAL '14 days'
             AND executed_at < CURRENT_DATE - INTERVAL '7 days'
            THEN (passed_count::FLOAT / NULLIF(tests_executed, 0) * 100)
        END) AS previous_pass_rate
    FROM v_test_execution_trends
    GROUP BY project_id
)
SELECT
    p.id AS project_id,
    p.name AS project_name,
    m.latest_pass_rate_pct,
    m.latest_not_run_pct,
    m.latest_failed_count,
    m.days_since_latest_execution,
    tc.recent_pass_rate,
    tc.previous_pass_rate,
    (tc.recent_pass_rate - tc.previous_pass_rate) AS pass_rate_change,
    ARRAY_REMOVE(ARRAY[
        CASE WHEN m.latest_pass_rate_pct < 80 THEN 'LOW_PASS_RATE' END,
        CASE WHEN m.latest_not_run_pct > 20 THEN 'HIGH_NOT_RUN' END,
        CASE WHEN m.days_since_latest_execution > 14 THEN 'STALE_TESTS' END,
        CASE WHEN m.latest_failed_count > 10 THEN 'HIGH_FAILURE_COUNT' END,
        CASE WHEN (tc.recent_pass_rate - tc.previous_pass_rate) < -10 THEN 'DECLINING_TREND' END
    ], NULL) AS risk_flags,
    CASE
        WHEN ARRAY_LENGTH(ARRAY_REMOVE(ARRAY[
            CASE WHEN m.latest_pass_rate_pct < 80 THEN 'LOW_PASS_RATE' END,
            CASE WHEN m.latest_not_run_pct > 20 THEN 'HIGH_NOT_RUN' END,
            CASE WHEN m.days_since_latest_execution > 14 THEN 'STALE_TESTS' END,
            CASE WHEN m.latest_failed_count > 10 THEN 'HIGH_FAILURE_COUNT' END,
            CASE WHEN (tc.recent_pass_rate - tc.previous_pass_rate) < -10 THEN 'DECLINING_TREND' END
        ], NULL), 1) >= 3 THEN 'CRITICAL'
        WHEN ARRAY_LENGTH(ARRAY_REMOVE(ARRAY[
            CASE WHEN m.latest_pass_rate_pct < 80 THEN 'LOW_PASS_RATE' END,
            CASE WHEN m.latest_not_run_pct > 20 THEN 'HIGH_NOT_RUN' END,
            CASE WHEN m.days_since_latest_execution > 14 THEN 'STALE_TESTS' END,
            CASE WHEN m.latest_failed_count > 10 THEN 'HIGH_FAILURE_COUNT' END,
            CASE WHEN (tc.recent_pass_rate - tc.previous_pass_rate) < -10 THEN 'DECLINING_TREND' END
        ], NULL), 1) >= 1 THEN 'WARNING'
        ELSE 'NORMAL'
    END AS risk_level
FROM projects p
LEFT JOIN v_project_quality_metrics m ON p.id = m.project_id
LEFT JOIN trend_comparison tc ON p.id = tc.project_id
WHERE p.deleted_at IS NULL;
```

**Frontend Component:**
```typescript
// components/governance/RiskIndicator.tsx
interface QualityRisk {
  risk_level: 'CRITICAL' | 'WARNING' | 'NORMAL';
  risk_flags: string[];
  pass_rate_change: number;
}

export default function RiskIndicator({ risk }: { risk: QualityRisk }) {
  const icons = {
    LOW_PASS_RATE: '📉',
    HIGH_NOT_RUN: '⏭️',
    STALE_TESTS: '⏰',
    HIGH_FAILURE_COUNT: '❌',
    DECLINING_TREND: '📊'
  };

  const colors = {
    CRITICAL: 'red',
    WARNING: 'yellow',
    NORMAL: 'green'
  };

  // Render risk badge with tooltip
}
```

#### 2.1.3 Project Quality Heatmap

**Purpose:** Visual overview of all projects' quality status

**Implementation Approach:**
```typescript
// components/governance/QualityHeatmap.tsx
interface HeatmapProject {
  project_id: string;
  project_name: string;
  pass_rate: number;
  risk_level: string;
  readiness_status: string;
}

export default function QualityHeatmap() {
  // Grid layout: 4-6 projects per row
  // Color coding: Green (>=95%), Yellow (>=80%), Red (<80%)
  // Click to drill down to project details
  // Hover for quick stats
}
```

**CSS Grid Layout:**
```css
.heatmap-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}

.heatmap-cell {
  aspect-ratio: 1;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  transition: transform 0.2s;
}

.heatmap-cell:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.heatmap-cell.green { background: #10b981; }
.heatmap-cell.yellow { background: #f59e0b; }
.heatmap-cell.red { background: #ef4444; }
```

#### 2.1.4 Trend Analysis Charts

**Purpose:** Visual charts for execution trends

**Chart Types:**
1. **Pass Rate Over Time** - Line chart
2. **Test Execution Volume** - Bar chart
3. **Status Distribution** - Stacked bar chart
4. **Failure Trends** - Area chart

**Implementation:**
```typescript
// components/governance/TrendCharts.tsx
import { Line, Bar, Area } from 'recharts'; // Or use existing SVG approach

interface TrendData {
  date: string;
  pass_rate: number;
  tests_executed: number;
  passed: number;
  failed: number;
}

export default function TrendCharts({ projectId, days = 30 }: Props) {
  // Fetch trend data from v_test_execution_trends
  // Render multiple chart types
  // Support time range selection (7/30/90 days)
}
```

---

### 2.2 Workload & Quality Health

#### 2.2.1 Resource Balance View

**Purpose:** Compare test coverage vs task backlog

**Metrics:**
- Tasks with test results / Total tasks
- Test coverage percentage by project
- Tasks without tests (gap analysis)

**Database View:**
```sql
CREATE OR REPLACE VIEW v_workload_balance AS
SELECT
    p.id AS project_id,
    p.name AS project_name,
    COUNT(DISTINCT t.id) AS total_tasks,
    COUNT(DISTINCT tr.test_case_id) AS total_tests,
    COUNT(DISTINCT CASE
        WHEN tr.test_case_id IS NOT NULL
        THEN t.id
    END) AS tasks_with_tests,
    ROUND(
        COUNT(DISTINCT CASE WHEN tr.test_case_id IS NOT NULL THEN t.id END)::NUMERIC
        / NULLIF(COUNT(DISTINCT t.id), 0) * 100,
        2
    ) AS task_test_coverage_pct,
    COUNT(DISTINCT t.id) - COUNT(DISTINCT CASE
        WHEN tr.test_case_id IS NOT NULL
        THEN t.id
    END) AS tasks_without_tests
FROM projects p
LEFT JOIN tasks t ON p.id = t.project_id AND t.deleted_at IS NULL
LEFT JOIN test_result tr ON p.id = tr.project_id
    AND tr.deleted_at IS NULL
    AND LOWER(tr.test_case_id) LIKE '%' || LOWER(t.name) || '%'
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.name;
```

**Frontend Component:**
```typescript
// components/governance/WorkloadBalance.tsx
interface WorkloadBalance {
  project_name: string;
  total_tasks: number;
  total_tests: number;
  tasks_with_tests: number;
  task_test_coverage_pct: number;
  tasks_without_tests: number;
}

export default function WorkloadBalanceWidget({ projectId }: Props) {
  // Display task vs test comparison
  // Show gap analysis
  // Highlight tasks without tests
}
```

#### 2.2.2 Project Health Cards

**Purpose:** RAG status cards for all active projects

**Card Components:**
- Project name
- RAG status badge (Red/Amber/Green)
- Key metrics (pass rate, test count, last execution)
- Risk flags
- Quick actions

**Implementation:**
```typescript
// components/governance/ProjectHealthCard.tsx
interface ProjectHealth {
  project_id: string;
  project_name: string;
  rag_status: 'RED' | 'AMBER' | 'GREEN';
  latest_pass_rate_pct: number;
  total_test_cases: number;
  days_since_latest_execution: number;
  risk_flags: string[];
}

export default function ProjectHealthCard({ project }: { project: ProjectHealth }) {
  // Card layout with RAG color coding
  // Metrics display
  // Risk flags
  // Click to view details
}
```

---

### 2.3 Reporting Framework

#### 2.3.1 Report Types

**1. Release Readiness Report**
- Executive summary
- Project status (Green/Amber/Red)
- Test execution summary
- Blocking issues
- Recommendation

**2. Weekly Quality Health Report**
- All projects overview
- Quality trends (week over week)
- Risk alerts
- Action items

**3. Test Coverage Gap Report**
- Tasks without tests
- Coverage by project/module
- Recommendations for improvement

#### 2.3.2 Report Generation Service

**Backend Service:**
```javascript
// services/reportGenerator.js
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

class ReportGenerator {
  async generateReleaseReadinessReport(projectId, format = 'pdf') {
    // Fetch data from views
    const readiness = await this.getReadinessData(projectId);
    const metrics = await this.getMetrics(projectId);
    const trends = await this.getTrends(projectId);

    if (format === 'pdf') {
      return this.generatePDF({
        title: 'Release Readiness Report',
        data: { readiness, metrics, trends }
      });
    } else {
      return this.generateExcel({
        title: 'Release Readiness Report',
        data: { readiness, metrics, trends }
      });
    }
  }

  async generateWeeklyHealthReport(format = 'pdf') {
    // All projects health summary
    const projects = await this.getAllProjectsHealth();
    const risks = await this.getAllRisks();
    const trends = await this.getWeeklyTrends();

    // Generate report
  }

  async generateCoverageGapReport(projectId, format = 'pdf') {
    // Tasks without tests
    const gaps = await this.getCoverageGaps(projectId);

    // Generate report
  }

  generatePDF(reportData) {
    const doc = new PDFDocument();
    // PDF generation logic
    return doc;
  }

  generateExcel(reportData) {
    const workbook = new ExcelJS.Workbook();
    // Excel generation logic
    return workbook;
  }
}
```

**API Endpoints:**
```javascript
// routes/reports.js
router.get('/reports/release-readiness/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const { format = 'pdf' } = req.query;

  const report = await reportGenerator.generateReleaseReadinessReport(projectId, format);

  res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="release-readiness-${projectId}.${format}"`);

  report.pipe(res);
});

router.get('/reports/weekly-health', async (req, res) => {
  // Weekly health report for all projects
});

router.get('/reports/coverage-gap/:projectId', async (req, res) => {
  // Coverage gap report
});
```

**Frontend Report Viewer:**
```typescript
// components/reports/ReportViewer.tsx
export default function ReportViewer() {
  const downloadReport = async (reportType: string, format: string) => {
    const response = await fetch(`/reports/${reportType}?format=${format}`);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report.${format}`;
    a.click();
  };

  return (
    <div>
      <h2>Reports</h2>
      <button onClick={() => downloadReport('release-readiness', 'pdf')}>
        Release Readiness (PDF)
      </button>
      <button onClick={() => downloadReport('release-readiness', 'excel')}>
        Release Readiness (Excel)
      </button>
      {/* More report options */}
    </div>
  );
}
```

---

## Database Migration for Phase 2

```sql
-- Phase 2: Governance Dashboard & Reporting
-- File: database/migrations/004_phase2_governance.sql

-- Drop existing views if updating
DROP VIEW IF EXISTS v_release_readiness CASCADE;
DROP VIEW IF EXISTS v_quality_risks CASCADE;
DROP VIEW IF EXISTS v_workload_balance CASCADE;

-- Release Readiness View
CREATE OR REPLACE VIEW v_release_readiness AS
SELECT
    p.id AS project_id,
    p.name AS project_name,
    m.latest_pass_rate_pct,
    m.latest_not_run_pct,
    m.latest_failed_count,
    m.days_since_latest_execution,
    m.total_test_cases,
    CASE
        WHEN m.latest_pass_rate_pct >= 95
         AND m.latest_not_run_pct <= 5
         AND m.days_since_latest_execution <= 3
         AND m.latest_failed_count = 0
        THEN 'GREEN'
        WHEN m.latest_pass_rate_pct >= 80
         AND m.latest_not_run_pct <= 15
         AND m.days_since_latest_execution <= 7
         AND m.latest_failed_count <= 5
        THEN 'AMBER'
        ELSE 'RED'
    END AS readiness_status,
    ARRAY_REMOVE(ARRAY[
        CASE WHEN m.latest_pass_rate_pct < 95 THEN 'Low pass rate' END,
        CASE WHEN m.latest_not_run_pct > 5 THEN 'Tests not executed' END,
        CASE WHEN m.days_since_latest_execution > 3 THEN 'Stale test results' END,
        CASE WHEN m.latest_failed_count > 0 THEN 'Failing tests' END
    ], NULL) AS blocking_issues,
    CASE
        WHEN m.latest_pass_rate_pct >= 95 AND m.latest_not_run_pct <= 5
         AND m.days_since_latest_execution <= 3 AND m.latest_failed_count = 0
        THEN 'All quality gates passed. Project is ready for release.'
        WHEN m.latest_pass_rate_pct >= 80 AND m.latest_not_run_pct <= 15
        THEN 'Some quality concerns. Review blocking issues before release.'
        ELSE 'Quality gates failed. Not recommended for release.'
    END AS recommendation
FROM projects p
LEFT JOIN v_project_quality_metrics m ON p.id = m.project_id
WHERE p.deleted_at IS NULL;

-- Quality Risks View
CREATE OR REPLACE VIEW v_quality_risks AS
WITH trend_comparison AS (
    SELECT
        project_id,
        AVG(CASE
            WHEN executed_at >= CURRENT_DATE - INTERVAL '7 days'
            THEN (passed_count::FLOAT / NULLIF(tests_executed, 0) * 100)
        END) AS recent_pass_rate,
        AVG(CASE
            WHEN executed_at >= CURRENT_DATE - INTERVAL '14 days'
             AND executed_at < CURRENT_DATE - INTERVAL '7 days'
            THEN (passed_count::FLOAT / NULLIF(tests_executed, 0) * 100)
        END) AS previous_pass_rate
    FROM v_test_execution_trends
    GROUP BY project_id
)
SELECT
    p.id AS project_id,
    p.name AS project_name,
    m.latest_pass_rate_pct,
    m.latest_not_run_pct,
    m.latest_failed_count,
    m.days_since_latest_execution,
    tc.recent_pass_rate,
    tc.previous_pass_rate,
    COALESCE(tc.recent_pass_rate - tc.previous_pass_rate, 0) AS pass_rate_change,
    ARRAY_REMOVE(ARRAY[
        CASE WHEN m.latest_pass_rate_pct < 80 THEN 'LOW_PASS_RATE' END,
        CASE WHEN m.latest_not_run_pct > 20 THEN 'HIGH_NOT_RUN' END,
        CASE WHEN m.days_since_latest_execution > 14 THEN 'STALE_TESTS' END,
        CASE WHEN m.latest_failed_count > 10 THEN 'HIGH_FAILURE_COUNT' END,
        CASE WHEN COALESCE(tc.recent_pass_rate - tc.previous_pass_rate, 0) < -10 THEN 'DECLINING_TREND' END
    ], NULL) AS risk_flags,
    CASE
        WHEN ARRAY_LENGTH(ARRAY_REMOVE(ARRAY[
            CASE WHEN m.latest_pass_rate_pct < 80 THEN 1 END,
            CASE WHEN m.latest_not_run_pct > 20 THEN 1 END,
            CASE WHEN m.days_since_latest_execution > 14 THEN 1 END,
            CASE WHEN m.latest_failed_count > 10 THEN 1 END,
            CASE WHEN COALESCE(tc.recent_pass_rate - tc.previous_pass_rate, 0) < -10 THEN 1 END
        ], NULL), 1) >= 3 THEN 'CRITICAL'
        WHEN ARRAY_LENGTH(ARRAY_REMOVE(ARRAY[
            CASE WHEN m.latest_pass_rate_pct < 80 THEN 1 END,
            CASE WHEN m.latest_not_run_pct > 20 THEN 1 END,
            CASE WHEN m.days_since_latest_execution > 14 THEN 1 END,
            CASE WHEN m.latest_failed_count > 10 THEN 1 END,
            CASE WHEN COALESCE(tc.recent_pass_rate - tc.previous_pass_rate, 0) < -10 THEN 1 END
        ], NULL), 1) >= 1 THEN 'WARNING'
        ELSE 'NORMAL'
    END AS risk_level
FROM projects p
LEFT JOIN v_project_quality_metrics m ON p.id = m.project_id
LEFT JOIN trend_comparison tc ON p.id = tc.project_id
WHERE p.deleted_at IS NULL;

-- Workload Balance View
CREATE OR REPLACE VIEW v_workload_balance AS
SELECT
    p.id AS project_id,
    p.name AS project_name,
    COUNT(DISTINCT t.id) AS total_tasks,
    COUNT(DISTINCT tr.test_case_id) AS total_tests,
    ROUND(
        COUNT(DISTINCT tr.test_case_id)::NUMERIC
        / NULLIF(COUNT(DISTINCT t.id), 0) * 100,
        2
    ) AS test_per_task_ratio,
    COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'Done') AS completed_tasks,
    COUNT(DISTINCT tr.test_case_id) FILTER (WHERE tr.status = 'passed') AS passed_tests
FROM projects p
LEFT JOIN tasks t ON p.id = t.project_id AND t.deleted_at IS NULL
LEFT JOIN test_result tr ON p.id = tr.project_id AND tr.deleted_at IS NULL
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.name;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_test_result_status ON test_result(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status) WHERE deleted_at IS NULL;

-- Comments
COMMENT ON VIEW v_release_readiness IS 'Release readiness assessment for all projects based on quality gates';
COMMENT ON VIEW v_quality_risks IS 'Quality risk assessment with trend analysis and risk flags';
COMMENT ON VIEW v_workload_balance IS 'Workload balance between tasks and test coverage';

SELECT 'Phase 2 governance views created successfully' AS result;
```

---

## Implementation Order

### Sprint 1 (Week 1-2): Database & Backend
1. ✅ Create Phase 2 database migration
2. ✅ Apply migration and test views
3. ✅ Create API endpoints for governance data
4. ✅ Test all endpoints with sample data

### Sprint 2 (Week 3-4): Release Readiness & Risk
1. ✅ Implement Release Readiness Widget (frontend)
2. ✅ Implement Risk Indicators (frontend)
3. ✅ Create Governance Dashboard page
4. ✅ Integrate with existing navigation

### Sprint 3 (Week 5-6): Heatmap & Charts
1. ✅ Implement Project Quality Heatmap
2. ✅ Implement Trend Analysis Charts
3. ✅ Add time range selectors
4. ✅ Polish UI/UX

### Sprint 4 (Week 7-8): Reporting
1. ✅ Set up report generation dependencies (PDFKit, ExcelJS)
2. ✅ Implement PDF report generator
3. ✅ Implement Excel report generator
4. ✅ Create report download UI
5. ✅ Test report generation

---

## Testing Plan

### Unit Tests
- View query correctness
- Status calculation logic
- Risk flag detection
- Report generation

### Integration Tests
- API endpoint responses
- Data flow from database to frontend
- Report download workflow

### User Acceptance Tests
- Dashboard usability
- Report quality and accuracy
- Performance (page load < 3s)

---

## Success Criteria

### Functional
- ✅ All projects show release readiness status
- ✅ Risk indicators highlight problem areas
- ✅ Heatmap provides visual overview
- ✅ Reports generate in < 5 seconds
- ✅ PDF and Excel formats work correctly

### Performance
- ✅ Dashboard loads in < 3 seconds
- ✅ Heatmap supports 50+ projects
- ✅ Report generation < 5 seconds

### Usability
- ✅ Intuitive navigation
- ✅ Clear visual indicators
- ✅ Actionable insights provided

---

## Dependencies

### Backend
```json
{
  "pdfkit": "^0.15.0",
  "exceljs": "^4.4.0",
  "recharts": "^2.12.0" // OR continue with SVG approach
}
```

### Database
- PostgreSQL 15+ (already available)
- Existing Phase 1 views

### Frontend
- React 18 (already available)
- TypeScript (already available)
- Tailwind CSS (already available)

---

## Next Steps

1. **Review this plan** - Confirm approach and priorities
2. **Create database migration** - Implement Phase 2 views
3. **Start Sprint 1** - Backend API endpoints
4. **Build frontend components** - Dashboard widgets
5. **Iterate based on feedback** - Refine as needed

---

**Ready to proceed?** Let's start with the database migration for Phase 2!
