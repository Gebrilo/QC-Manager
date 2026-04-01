# tuleap-bug-source-classification-and-dashboard-plan.md

## Overview

This document provides a **complete implementation plan** to:

* Classify bugs based on **source of discovery**:
  * Test Case Execution
  * Exploratory / External Testing
* Extend the **Tuleap payload parsing via n8n**
* Store and manage this classification in QC-Manager
* Display results in the **Governance Dashboard → Bug Summary**
* Visualize data in a **"By Source" chart**

The goal is to enable **data-driven quality insights** without breaking existing flows.

---

## Codebase Reality (Pre-Implementation Findings)

> These findings from code exploration change what needs to be built vs. what can be reused.

### What Already Exists

| Existing Asset | Location | Relevance |
|---|---|---|
| `linked_test_case_ids UUID[]` column | `bugs` table | **Source classification signal already stored** |
| `linked_test_execution_ids UUID[]` column | `bugs` table | **Second signal — bug linked to a test execution** |
| `bugs_from_testing` in summary response | `GET /bugs/summary` | Classification concept already partially implemented |
| `has_test_link?: boolean` in Bug interface | `apps/web/src/lib/api.ts` | Frontend already aware of this concept |
| `raw_tuleap_payload JSONB` column | `bugs` table | Full Tuleap payload stored — can mine for linked artifact data |

### Key Implications

1. **The `source` column does not exist yet** — must be added, but classification logic can derive from existing arrays.
2. **`/bugs/summary` already returns `bugs_from_testing`** — check how this is calculated before adding a new endpoint; it may be reusable or just needs extending.
3. **n8n does not extract `linked_artifacts`** from Tuleap payloads — this needs to be investigated (see §1.3). The `raw_tuleap_payload` JSONB column stores the full webhook payload, so linked artifact data *may already be stored* and available for backfill without re-syncing from Tuleap.
4. **Governance dashboard** (`/projects/[id]/quality/page.tsx`) has no bug section at all — Overview tab shows widgets for test execution health only. A new "Bug Summary" widget/section needs to be built.
5. **Chart library** — confirm Recharts is already installed before writing chart code (`apps/web/package.json`).

---

## Key Requirements

1. Identify bug source from Tuleap payload
2. Store source classification in QC database
3. Display two categories:
   * Bugs from Test Cases
   * Bugs from Exploratory / External Testing
4. Render a chart in "By Source"
5. Maintain backward compatibility
6. Avoid breaking existing integrations

---

## Classification Approach Decision

Three options exist. **Option C is recommended.**

### Option A — Derive from Existing Arrays (No DB Change)

```sql
-- No new column. Query derived at read time:
SELECT
  CASE
    WHEN linked_test_case_ids != '{}' OR linked_test_execution_ids != '{}'
    THEN 'TEST_CASE'
    ELSE 'EXPLORATORY'
  END AS source,
  COUNT(*) FROM bugs GROUP BY source;
```

**Pros:** Zero migration risk, uses existing data immediately.
**Cons:** No index, slower queries at scale, source can't be manually overridden.

---

### Option B — Explicit `source` Column (Full Rebuild)

Add `source TEXT CHECK (source IN ('TEST_CASE', 'EXPLORATORY'))` and populate via n8n + backfill.

**Pros:** Explicit, indexable, allows manual correction.
**Cons:** Requires n8n change, unknown if Tuleap webhook actually sends `linked_artifacts`.

---

### Option C — Hybrid (Recommended)

Add explicit `source` column. **Populate it from existing `linked_test_case_ids` / `linked_test_execution_ids`** for backfill (no re-sync needed). Update n8n to populate it on new bugs. Later refine with real Tuleap `linked_artifacts` data if available.

**Pros:** Best of both — explicit column with index, backfill uses data already in DB, no dependency on unverified Tuleap field.
**Cons:** Small additional complexity.

**Recommendation: Option C.**

---

## SAFE EXECUTION ORDER

1. Investigate Tuleap linked_artifacts availability
2. Define classification logic
3. Extend database schema + backfill
4. Update n8n workflow (parse + send `source`)
5. Update backend: webhook endpoint + summary endpoint
6. Update frontend API client
7. Build Bug Summary section in Governance Dashboard
8. Add "By Source" chart
9. Testing & validation

---

# 1. SOURCE CLASSIFICATION STRATEGY

## 1.1 Possible Source Signals from Tuleap

| Field | Meaning | Availability |
|---|---|---|
| `linked_test_case_ids` (QC DB) | Already stored in bugs table | **Confirmed available** |
| `linked_test_execution_ids` (QC DB) | Already stored in bugs table | **Confirmed available** |
| `linked_artifacts` in Tuleap webhook | Linked test case/execution in Tuleap payload | **Unconfirmed — must check raw_tuleap_payload** |
| `tracker type` | Bug vs Test Execution tracker | Tuleap-side config |
| Custom fields: "Detected In", "Source" | Manual classification in Tuleap | Tuleap-side config |

## 1.2 Pre-Implementation Research (Do This First)

Before writing any code, check whether linked artifact data is already present in stored payloads:

```sql
-- Check if raw_tuleap_payload contains linked artifacts
SELECT
  id,
  tuleap_artifact_id,
  raw_tuleap_payload->'linked_artifacts' AS linked_artifacts
FROM bugs
WHERE raw_tuleap_payload IS NOT NULL
  AND deleted_at IS NULL
LIMIT 10;
```

If `linked_artifacts` is present in `raw_tuleap_payload`, the backfill can use that JSONB data for more accurate classification. If not, fall back to deriving from `linked_test_case_ids` / `linked_test_execution_ids`.

## 1.3 Classification Rules (STANDARDIZED)

```text
IF linked_test_case_ids is non-empty
   OR linked_test_execution_ids is non-empty
   → SOURCE = "TEST_CASE"
ELSE IF raw_tuleap_payload contains linked_artifacts with type "testcase" or "testexecution"
   → SOURCE = "TEST_CASE"
ELSE
   → SOURCE = "EXPLORATORY"
```

## 1.4 Future-Proof Enum

```ts
type BugSource = "TEST_CASE" | "EXPLORATORY";

// Reserved for future use (§11):
// type BugSource = "TEST_CASE" | "EXPLORATORY" | "AUTOMATION" | "UAT" | "PRODUCTION";
```

---

# 2. DATABASE SCHEMA UPDATE

## 2.1 Add Column

```sql
ALTER TABLE bugs
ADD COLUMN source TEXT DEFAULT 'EXPLORATORY';
```

## 2.2 Add Constraint

```sql
ALTER TABLE bugs
ADD CONSTRAINT source_check
CHECK (source IN ('TEST_CASE', 'EXPLORATORY'));
```

## 2.3 Index

```sql
CREATE INDEX idx_bug_source ON bugs(source);
```

## 2.4 Composite Index (for dashboard queries filtered by project)

```sql
CREATE INDEX idx_bug_project_source ON bugs(project_id, source)
WHERE deleted_at IS NULL;
```

> **Note:** The existing `idx_bugs_project_id`, `idx_bugs_status`, `idx_bugs_severity` indexes remain untouched.

---

# 3. BACKFILL EXISTING DATA

## 3.1 Strategy

Derive from existing `linked_test_case_ids` / `linked_test_execution_ids` — **no Tuleap re-sync required.**

```sql
-- scripts/backfill-bug-source.sql
BEGIN;

UPDATE bugs
SET source = CASE
  WHEN linked_test_case_ids IS NOT NULL AND linked_test_case_ids != '{}'
    THEN 'TEST_CASE'
  WHEN linked_test_execution_ids IS NOT NULL AND linked_test_execution_ids != '{}'
    THEN 'TEST_CASE'
  ELSE 'EXPLORATORY'
END,
updated_at = NOW()
WHERE deleted_at IS NULL;

COMMIT;

-- Verification
SELECT source, COUNT(*) FROM bugs WHERE deleted_at IS NULL GROUP BY source ORDER BY count DESC;
```

## 3.2 Optional: Refine from raw_tuleap_payload

If the JSONB research in §1.2 confirms `linked_artifacts` data is present, run a second pass:

```sql
UPDATE bugs
SET source = 'TEST_CASE'
WHERE deleted_at IS NULL
  AND source = 'EXPLORATORY'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(raw_tuleap_payload->'linked_artifacts') AS la
    WHERE la->>'type' ILIKE '%test%'
  );
```

---

# 4. N8N WORKFLOW UPDATE

## 4.1 Update tuleap-bug-sync.json — Transform Node

Add `source` extraction to the existing "Transform Bug Data" node. The current node already extracts all other fields; add this block:

```javascript
// After existing severity/status mapping:
const linkedArtifacts = payload.linked_artifacts || [];
const hasTestLink =
  (bugData.linked_test_case_ids && bugData.linked_test_case_ids.length > 0) ||
  (bugData.linked_test_execution_ids && bugData.linked_test_execution_ids.length > 0) ||
  linkedArtifacts.some(a =>
    a.type === 'testcase' || a.type === 'testexecution'
  );

const source = hasTestLink ? 'TEST_CASE' : 'EXPLORATORY';
```

## 4.2 Updated bugData Object

```javascript
bugData: {
  // ... existing fields (tuleap_artifact_id, title, severity, etc.) ...
  source: source || 'EXPLORATORY',   // NEW FIELD
}
```

## 4.3 Fallback Safety

The `|| 'EXPLORATORY'` fallback ensures:
- Missing `linked_artifacts` in Tuleap payload → safe default
- Network issues or unexpected payload shape → safe default
- Backward compatibility for older Tuleap versions → safe default

---

# 5. BACKEND API UPDATE

## 5.1 Update tuleapWebhook.js — Bug INSERT

Add `source` to the INSERT statement (currently 18 parameters):

```javascript
// Add to destructured body:
const { ..., source = 'EXPLORATORY' } = req.body;

// Add to INSERT columns and VALUES:
INSERT INTO bugs (..., source) VALUES (..., $19)
// bind: source
```

Also add `source` to the ON CONFLICT UPDATE clause for upserts.

## 5.2 Update bugs.js — PATCH Endpoint

Add `source` to allowed update fields:

```javascript
const allowedFields = [
  'title', 'description', 'status', 'severity', 'priority',
  'bug_type', 'component', 'assigned_to', 'resolved_date',
  'linked_test_case_ids', 'linked_test_execution_ids',
  'raw_tuleap_payload',
  'source'  // NEW
];
```

## 5.3 Update GET /bugs/summary

The existing summary returns `bugs_from_testing` (based on unknown logic — verify before touching). **Extend it to also return `by_source`:**

```javascript
// Add to existing summary query:
const sourceQuery = `
  SELECT source, COUNT(*)::int AS count
  FROM bugs
  WHERE deleted_at IS NULL
  ${projectId ? 'AND project_id = $1' : ''}
  GROUP BY source
`;

// Merge into response:
by_source: {
  test_case: sourceRows.find(r => r.source === 'TEST_CASE')?.count || 0,
  exploratory: sourceRows.find(r => r.source === 'EXPLORATORY')?.count || 0,
}
```

> **Check first:** If `bugs_from_testing` in the existing summary already uses `linked_test_case_ids != '{}'`, verify whether it should be replaced by or reconciled with the new `source` column.

## 5.4 Update Bug List Response

Include `source` in the bug list and single-bug responses (should come automatically once the column is added to SELECT *).

---

# 6. FRONTEND API CLIENT UPDATE

## 6.1 Update Bug Interface (api.ts)

```typescript
interface Bug {
  // ... existing fields ...
  source?: 'TEST_CASE' | 'EXPLORATORY';  // NEW
  has_test_link?: boolean;  // existing — keep for backward compat, derive from source
}
```

## 6.2 Update BugSummary Type

```typescript
interface BugSummary {
  totals: {
    total_bugs: number;
    open_bugs: number;
    closed_bugs: number;
    bugs_from_testing: number;   // existing
    standalone_bugs: number;     // existing
  };
  by_severity: { critical: number; high: number; medium: number; low: number };
  by_source: {                   // NEW
    test_case: number;
    exploratory: number;
  };
  by_project: any[];
  recent_bugs: Bug[];
}
```

---

# 7. GOVERNANCE DASHBOARD UI UPDATE

## 7.1 Location

**File:** `apps/web/app/projects/[id]/quality/page.tsx`
**Tab:** Overview (currently has ReleaseReadiness, RiskIndicators, TrendAnalysis widgets)

The bug summary section will be added as a new row **below the existing widgets** in the Overview tab.

## 7.2 New API Call

Add to the existing `useEffect` parallel fetch block:

```typescript
getBugSummary(projectId)  // uses bugsApi.summary(projectId)
```

Add state:

```typescript
const [bugSummary, setBugSummary] = useState<BugSummary | null>(null);
```

## 7.3 Bug Summary Cards

Two summary cards matching the existing card style in the dashboard:

```tsx
{/* Bug Summary Row */}
<div className="grid grid-cols-2 gap-4 mt-4">
  <Card>
    <CardHeader>
      <CardTitle className="text-sm font-medium">Bugs from Test Cases</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">
        {bugSummary?.by_source.test_case ?? '—'}
      </div>
      <p className="text-xs text-muted-foreground">Linked to test execution</p>
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle className="text-sm font-medium">Exploratory / External</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">
        {bugSummary?.by_source.exploratory ?? '—'}
      </div>
      <p className="text-xs text-muted-foreground">Found outside test cases</p>
    </CardContent>
  </Card>
</div>
```

## 7.4 "By Source" Chart

Create as a standalone component: `apps/web/src/components/BugsBySourceChart.tsx`

```tsx
// Confirm Recharts is in package.json before implementing
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';

const COLORS = {
  TEST_CASE: '#3b82f6',    // blue-500
  EXPLORATORY: '#f59e0b',  // amber-500
};

const DARK_COLORS = {
  TEST_CASE: '#60a5fa',    // blue-400
  EXPLORATORY: '#fbbf24',  // amber-400
};

interface Props {
  testCase: number;
  exploratory: number;
}

export function BugsBySourceChart({ testCase, exploratory }: Props) {
  const data = [
    { name: 'Test Cases', value: testCase, key: 'TEST_CASE' },
    { name: 'Exploratory', value: exploratory, key: 'EXPLORATORY' },
  ];

  if (testCase + exploratory === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        No bug data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={70}
          label={({ name, percent }) =>
            `${name} ${(percent * 100).toFixed(0)}%`
          }
        >
          {data.map((entry) => (
            <Cell key={entry.key} fill={COLORS[entry.key as keyof typeof COLORS]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

> **Zero-state handling:** If both values are 0, render a placeholder message instead of an empty chart.

## 7.5 Dark Mode

Follow the existing pattern in the governance dashboard (dark mode already implemented in commit `6872378`):

```tsx
// Card backgrounds
className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"

// Text
className="text-gray-900 dark:text-white"
className="text-gray-500 dark:text-gray-400"
```

---

# 8. DATA FLOW SUMMARY

```text
Tuleap webhook
     ↓
n8n "Transform Bug Data" node
     ↓  (adds source field based on linked_artifacts / linked_test_*_ids)
POST /tuleap-webhook/bug  ← tuleapWebhook.js
     ↓  (INSERTs or UPSERTs with source column)
bugs table  ← Supabase Postgres
     ↓
GET /bugs/summary?project_id=...  ← bugs.js
     ↓  (returns by_source aggregation)
bugsApi.summary()  ← api.ts
     ↓
Governance Dashboard Overview tab
     ↓
BugsBySourceChart + summary cards
```

---

# 9. TESTING PLAN

## 9.1 Pre-Implementation Checks

- [ ] Run JSONB query from §1.2 — confirm whether `linked_artifacts` exists in stored payloads
- [ ] Check `GET /bugs/summary` response — understand how `bugs_from_testing` is currently calculated
- [ ] Confirm Recharts is in `apps/web/package.json`

## 9.2 Manual Testing

### Classification

- [ ] Bug with `linked_test_case_ids` populated → source = `TEST_CASE`
- [ ] Bug with `linked_test_execution_ids` populated → source = `TEST_CASE`
- [ ] Bug with empty arrays → source = `EXPLORATORY`
- [ ] Bug created via Tuleap webhook with test link → source = `TEST_CASE`
- [ ] Bug created via Tuleap webhook without test link → source = `EXPLORATORY`

### Dashboard

- [ ] Summary cards show correct counts matching DB
- [ ] Chart segments match card values (test_case + exploratory = total active bugs)
- [ ] Zero-state: chart shows placeholder when no bugs exist
- [ ] Dark mode: chart colors visible in dark theme

### Backward Compatibility

- [ ] Existing `GET /bugs`, `GET /bugs/:id` still return all existing fields
- [ ] `GET /bugs/summary` still returns `bugs_from_testing` and `standalone_bugs`
- [ ] n8n bug sync still works for bugs without linked artifacts
- [ ] Deletion sync workflow unaffected

## 9.3 Edge Cases

- [ ] `source = NULL` before constraint is added → backfill sets `EXPLORATORY`
- [ ] n8n sends `source` field that is neither `TEST_CASE` nor `EXPLORATORY` → constraint rejects + logs error
- [ ] Tuleap payload with malformed `linked_artifacts` array → fallback to `EXPLORATORY`
- [ ] `project_id` filter on `/bugs/summary` — `by_source` respects project scope

---

# 10. REGRESSION SAFETY

- [ ] Run existing bug test suite (`T018–T020b`) after backend changes
- [ ] Verify n8n tuleap-bug-sync workflow still triggers and syncs correctly
- [ ] Confirm tuleap-bug-deletion-sync workflow unaffected
- [ ] `/governance` and `/bugs` pages render without errors
- [ ] No TypeScript compile errors (`tsc --noEmit`)

---

# 11. DEPLOYMENT STEPS

1. **Run migration SQL** against Supabase DB (add column, constraint, indexes)
2. **Run backfill script** `scripts/backfill-bug-source.sql`
3. **Import updated `tuleap-bug-sync.json`** into n8n — re-activate after import (import deactivates it)
4. **Git push + CI/CD deploy**
5. **Rebuild web image locally** (required — GitHub Actions lacks Supabase build args)
6. **Verify** dashboard renders correctly + spot-check a few bugs in DB

---

# 12. FUTURE ENHANCEMENTS

* Additional source types:
  * `AUTOMATION` — from automated test pipeline
  * `UAT` — user acceptance testing
  * `PRODUCTION` — found in production post-release

* Time-based trends:
  * Bugs by source over time (line chart in TrendAnalysisWidget)

* Filter bugs by source in the `/bugs` page table

* Quality gate: fail release if `exploratory / total > threshold`

---

## END OF DOCUMENT
