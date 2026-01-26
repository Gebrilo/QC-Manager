# QC Scenario Planning - Google Apps Script Project Context
## Complete System Knowledge Transfer for Claude Code

**Date:** January 2025  
**Purpose:** Build UUID-based Google Apps Script web app for QC Scenario Planning  
**Target:** Claude Code agent for implementation

---

## 📋 **TABLE OF CONTENTS**

1. [System Overview](#system-overview)
2. [Current Excel Implementation](#current-excel-implementation)
3. [Sheet Structure & Schema](#sheet-structure--schema)
4. [Formulas & Calculations](#formulas--calculations)
5. [Dashboard & Visualizations](#dashboard--visualizations)
6. [Business Logic & Workflows](#business-logic--workflows)
7. [Google Apps Script Requirements](#google-apps-script-requirements)
8. [MASTER META-PROMPT Specifications](#master-meta-prompt-specifications)
9. [Implementation Roadmap](#implementation-roadmap)

---

## 📊 **SYSTEM OVERVIEW**

### **What This System Does**

QC Scenario Planning is a **task-driven project management system** designed for quality assurance teams. It:

- **Manages Projects** as containers that automatically aggregate task data
- **Tracks Tasks** with detailed hours, resources, and status
- **Monitors Resources** and their utilization across projects
- **Visualizes Progress** through real-time dashboards and charts
- **Reports Metrics** for quality management and capacity planning

### **Core Philosophy: Single Source of Truth**

```
Tasks Sheet = Primary Data Entry
    ↓
Projects Sheet = Automatic Aggregation
    ↓
Dashboard = Real-Time Visualization
    ↓
Reports = Exportable Insights
```

**Key Innovation:** Projects don't store hours manually. They calculate everything from their tasks, ensuring data consistency.

---

## 📑 **CURRENT EXCEL IMPLEMENTATION**

### **File Structure**

The current system is an Excel workbook (`QC_Scenario_Planning.xlsx`) with 5 sheets:

1. **Assumptions** - Configuration constants
2. **Projects** - Project containers (13 columns)
3. **Tasks** - Task details (21 columns)
4. **Resources** - Resource pool (5 columns)
5. **Dashboard** - Metrics, tables, and 4 charts

### **System Evolution**

The system evolved through several iterations:

**Version 1-3:** Complex resource allocation in Projects  
**Version 4:** Task-driven with dual completion views  
**Version 5-6 (Current):** Simplified - Projects as pure containers

### **Current State**

- **263 formulas** across all sheets
- **0 errors**
- **6 tasks** in system (example data)
- **2 projects** defined (CST, FRA)
- **4 resources** available (Basel, Belal, Mahmoud, Hany)
- **4 interactive charts** on Dashboard

---

## 🗂️ **SHEET STRUCTURE & SCHEMA**

### **SHEET 1: Assumptions**

**Purpose:** Configuration constants and lookup values

**Columns:**

| Column | Name | Type | Description |
|--------|------|------|-------------|
| A | Resource Name | Text | List of available resources |
| B | Hourly Capacity | Number | Weekly capacity (default: 40) |
| C | Status Options | Text | Valid task statuses |

**Data:**

```
Resources:
  Basel (40 hrs/week)
  Belal (40 hrs/week)
  Mahmoud (40 hrs/week)
  Hany (40 hrs/week)

Statuses:
  Backlog
  In Progress
  Done
  Cancelled
```

**Purpose in Apps Script:**
- Populate dropdown options
- Validate resource assignments
- Define capacity constraints

---

### **SHEET 2: Projects**

**Purpose:** Project containers that aggregate task data

**Columns (13 total):**

| Col | Name | Type | Editable | Formula | Description |
|-----|------|------|----------|---------|-------------|
| A | Project ID | Text | ✅ Yes | ❌ | Unique identifier (e.g., PRJ-001) |
| B | Project Name | Text | ✅ Yes | ❌ | Display name (e.g., CST) |
| C | Total Weight | Number | ✅ Yes | ❌ | Priority weighting (1-5) |
| D | Task Hrs Est | Number | ❌ No | ✅ | Sum of task estimated hours |
| E | Task Hrs Actual | Number | ❌ No | ✅ | Sum of task actual hours |
| F | Task Hrs Done | Number | ❌ No | ✅ | Sum of Done task hours |
| G | Completion % | Number | ❌ No | ✅ | Done / Estimated |
| H | Tasks Done | Number | ❌ No | ✅ | Count of Done tasks |
| I | Tasks Total | Number | ❌ No | ✅ | Count of all tasks |
| J | Status | Text | ❌ No | ✅ | Complete / On Track / At Risk / No Tasks |
| K | Priority | Text | ✅ Yes | ❌ | High / Medium / Low |
| L | Start Date | Date | ✅ Yes | ❌ | Project start date |
| M | Target Date | Date | ✅ Yes | ❌ | Project target completion |

**Key Formulas:**

```excel
D (Task Hrs Est):
=SUMIF(Tasks!$B$4:$B$50, A4, Tasks!$M$4:$M$50)

E (Task Hrs Actual):
=SUMIF(Tasks!$B$4:$B$50, A4, Tasks!$N$4:$N$50)

F (Task Hrs Done):
=SUMIFS(Tasks!$N$4:$N$50, Tasks!$B$4:$B$50, A4, Tasks!$D$4:$D$50, "Done")

G (Completion %):
=IF(D4>0, F4/D4, 0)

H (Tasks Done):
=COUNTIFS(Tasks!$B$4:$B$50, A4, Tasks!$D$4:$D$50, "Done")

I (Tasks Total):
=COUNTIF(Tasks!$B$4:$B$50, A4)

J (Status):
=IF(I4=0, "No Tasks", IF(H4=I4, "Complete", IF(G4>=0.7, "On Track", "At Risk")))
```

**Business Rules:**

1. **Project ID must be unique** across all projects
2. **Columns D-J are READ-ONLY** - calculated from tasks
3. **Manual edits:** Only A, B, C, K, L, M
4. **Status Logic:**
   - "No Tasks" if no tasks exist
   - "Complete" if all tasks done
   - "On Track" if ≥70% complete
   - "At Risk" if <70% complete

**Example Data:**

```
PRJ-001, CST, 1, 62, 12, 12, 19.4%, 2, 6, At Risk, Medium, 2025-01-01, 2025-03-31
PRJ-002, FRA, 3, 0, 0, 0, 0%, 0, 0, No Tasks, High, 2025-02-01, 2025-04-30
```

---

### **SHEET 3: Tasks**

**Purpose:** Primary data entry for all work

**Columns (21 total):**

| Col | Name | Type | Editable | Formula | Description |
|-----|------|------|----------|---------|-------------|
| A | Task ID | Text | ✅ Yes | ❌ | Unique identifier (TSK-001) |
| B | Project ID | Text | ✅ Yes | ❌ | Links to Projects sheet |
| C | Task Name | Text | ✅ Yes | ❌ | Description of work |
| D | Status | Enum | ✅ Yes | ❌ | Backlog/In Progress/Done/Cancelled |
| E | Estimate (days) | Number | ✅ Yes | ❌ | Estimated duration in days |
| F | Estimate (hours) | Number | ❌ No | ✅ | Days × 8 |
| G | Resource 1 | Text | ✅ Yes | ❌ | Primary resource assigned |
| H | R1 Estimate (hrs) | Number | ✅ Yes | ❌ | Hours allocated to R1 |
| I | R1 Actual (hrs) | Number | ✅ Yes | ❌ | Hours worked by R1 |
| J | Resource 2 | Text | ✅ Yes | ❌ | Secondary resource (optional) |
| K | R2 Estimate (hrs) | Number | ✅ Yes | ❌ | Hours allocated to R2 |
| L | R2 Actual (hrs) | Number | ✅ Yes | ❌ | Hours worked by R2 |
| M | Total Est (hrs) | Number | ❌ No | ✅ | Sum of R1 + R2 estimates |
| N | Total Actual (hrs) | Number | ❌ No | ✅ | Sum of R1 + R2 actuals |
| O | R1 Completion % | Number | ❌ No | ✅ | R1 Actual / R1 Estimate |
| P | R2 Completion % | Number | ❌ No | ✅ | R2 Actual / R2 Estimate |
| Q | Hours Variance | Number | ❌ No | ✅ | Actual - Estimate |
| R | Variance % | Number | ❌ No | ✅ | Variance / Estimate |
| S | Overall Completion % | Number | ❌ No | ✅ | Total Actual / Total Est |
| T | Deadline | Date | ✅ Yes | ❌ | Task due date |
| U | Completed Date | Date | ✅ Yes | ❌ | When marked Done |

**Key Formulas:**

```excel
F (Estimate hours):
=E4*8

M (Total Est):
=H4+K4

N (Total Actual):
=I4+L4

O (R1 Completion %):
=IF(H4>0, I4/H4, 0)

P (R2 Completion %):
=IF(K4>0, L4/K4, 0)

Q (Hours Variance):
=N4-M4

R (Variance %):
=IF(M4>0, Q4/M4, 0)

S (Overall Completion %):
=IF(M4>0, N4/M4, 0)
```

**Business Rules:**

1. **Task ID must be unique**
2. **Project ID must exist in Projects sheet** (foreign key)
3. **Status must be valid** (from Assumptions)
4. **Resource names must exist** (from Assumptions)
5. **Completed Date required when Status = "Done"**
6. **Hours cannot be negative**
7. **Columns F, M-S are READ-ONLY** (calculated)

**Validation Rules:**

```javascript
// Status transitions
Backlog → In Progress → Done
Backlog → Cancelled
In Progress → Cancelled

// Completion logic
Status = "Done" requires:
  - Completed Date filled
  - Total Actual > 0

// Resource validation
Resource 1/2 must be in Assumptions.ResourceName list
```

**Example Data:**

```
TSK-001, PRJ-001, Mobile View Testing, In Progress, 5, 40, Mahmoud, 40, 0, , 0, 0, 40, 0, 0%, 0%, -40, -100%, 0%, 2025-01-31, 
TSK-002, PRJ-001, حذف اسم المفوض, Done, 1.5, 12, Belal, 12, 8, , 0, 0, 12, 8, 67%, 0%, -4, -33%, 67%, 2025-01-20, 2025-01-18
TSK-003, PRJ-001, missing punch updates, Backlog, 0.25, 2, Basel, 2, 0, , 0, 0, 2, 0, 0%, 0%, -2, -100%, 0%, 2025-01-25,
```

**Critical for Apps Script:**
- **Column B (Project ID)** is the foreign key linking to Projects
- **Column D (Status)** drives project completion calculations
- **Columns M, N** (Total hours) are what Projects aggregate

---

### **SHEET 4: Resources**

**Purpose:** Resource pool and capacity tracking

**Columns (5 total):**

| Col | Name | Type | Editable | Formula | Description |
|-----|------|------|----------|---------|-------------|
| A | Resource Name | Text | ✅ Yes | ❌ | Person's name |
| B | Weekly Capacity | Number | ✅ Yes | ❌ | Available hours/week (default: 40) |
| C | Current Allocation | Number | ❌ No | ✅ | Hours assigned to active tasks |
| D | Utilization % | Number | ❌ No | ✅ | Allocation / Capacity |
| E | Available Hours | Number | ❌ No | ✅ | Capacity - Allocation |

**Key Formulas:**

```excel
C (Current Allocation):
=SUMIF(Tasks!$G$4:$G$50, A4, Tasks!$H$4:$H$50) + 
 SUMIF(Tasks!$J$4:$J$50, A4, Tasks!$K$4:$K$50)
 
// Explanation: Sum hours where person is Resource 1 OR Resource 2

D (Utilization %):
=IF(B4>0, C4/B4, 0)

E (Available Hours):
=B4-C4
```

**Business Rules:**

1. **Resource Name must match Assumptions**
2. **Weekly Capacity > 0**
3. **Utilization > 100%** = Overloaded (warning)
4. **Columns C-E are READ-ONLY**

**Example Data:**

```
Basel, 40, 0, 0%, 40
Belal, 40, 2, 5%, 38
Mahmoud, 40, 40, 100%, 0
Hany, 40, 0, 0%, 40
```

---

### **SHEET 5: Dashboard**

**Purpose:** Real-time metrics, tables, and visualizations

**Structure:**

```
Rows 1-14:   Header & Title
Rows 15-19:  Resource Utilization Table
Rows 20-22:  Spacer
Rows 23-27:  Project Portfolio Table
Rows 24-29:  Task Status Summary (feeds Pie Chart)
Rows 30:     PIE CHART - Task Status Distribution
Rows 31-34:  Project Completion Data (feeds Bar Chart)
Rows 35:     Spacer
Rows 36-41:  Resource Hours Breakdown (feeds Stacked Bar)
Rows 42:     Spacer
Rows 43-46:  Tasks by Project (feeds Stacked Bar)
Rows 45:     BAR CHART - Project Completion %
Rows 30:     STACKED BAR - Resource Hours (at column I)
Rows 45:     STACKED BAR - Tasks by Project (at column I)
Rows 60-71:  Task Details (first 10 tasks)
Rows 73-81:  Summary Metrics
```

**Section 1: Resource Utilization Table (Rows 15-19)**

| Col | Content | Formula |
|-----|---------|---------|
| A | Resource Name | =Resources!A4 |
| D | Project Hours | (Legacy, now 0) |
| E | Active Task Hours | =SUMIF(Tasks!G:G, A16, Tasks!H:H) + SUMIF(Tasks!J:J, A16, Tasks!K:K) |
| F | Total Hours | =D16+E16 |
| G | Utilization % | =IF(40>0, F16/40, 0) |

**Section 2: Project Portfolio Table (Rows 23-27)**

| Col | Content | Formula |
|-----|---------|---------|
| A | Project Name | =Projects!B4 |
| B | Task Hrs Est | =Projects!D4 |
| C | Task Hrs Done | =Projects!F4 |
| D | Completion % | =Projects!G4 |
| E | Tasks Done/Total | =Projects!H4&"/"&Projects!I4 |
| F | Status | =Projects!J4 |

**Section 3: Task Status Summary (Rows 24-29)**

Data for Pie Chart:

| Col | Content | Formula |
|-----|---------|---------|
| J | Status Label | Done / In Progress / Backlog / Cancelled |
| K | Count | =COUNTIF(Tasks!D:D, "Done") |

**Section 4: Project Completion Data (Rows 31-34)**

Data for Bar Chart:

| Col | Content | Formula |
|-----|---------|---------|
| J | Project Name | =Projects!B4 |
| K | Completion % | =Projects!G4 |

**Section 5: Resource Hours Breakdown (Rows 36-41)**

Data for Stacked Bar:

| Col | Content | Formula |
|-----|---------|---------|
| J | Resource | Basel / Belal / Mahmoud / Hany |
| K | Project Hrs | =D16 |
| L | Active Task Hrs | =E16 |
| M | Total | =K38+L38 |

**Section 6: Tasks by Project (Rows 43-46)**

Data for Stacked Bar:

| Col | Content | Formula |
|-----|---------|---------|
| J | Project | =Projects!B4 |
| K | Done | =COUNTIFS(Tasks!B:B, Projects!A4, Tasks!D:D, "Done") |
| L | In Progress | =COUNTIFS(Tasks!B:B, Projects!A4, Tasks!D:D, "In Progress") |
| M | Backlog | =COUNTIFS(Tasks!B:B, Projects!A4, Tasks!D:D, "Backlog") |

**Section 7: Task Details (Rows 60-71)**

First 10 tasks displayed:

| Col | Content | Formula |
|-----|---------|---------|
| A | Task ID | =IF(Tasks!A4<>"", Tasks!A4, "") |
| B | Project ID | =IF(Tasks!A4<>"", Tasks!B4, "") |
| C | Task Name | =IF(Tasks!A4<>"", Tasks!C4, "") |
| D | Status | =IF(Tasks!A4<>"", Tasks!D4, "") |
| E | Est Hrs | =IF(Tasks!A4<>"", Tasks!M4, "") |
| F | Actual Hrs | =IF(Tasks!A4<>"", Tasks!N4, "") |
| G | Resources | =IF(Tasks!A4<>"", IF(Tasks!J4<>"", Tasks!G4&", "&Tasks!J4, Tasks!G4), "") |
| H | Due Date | =IF(Tasks!A4<>"", Tasks!T4, "") |

**Section 8: Summary Metrics (Rows 73-81)**

| Row | Metric | Formula |
|-----|--------|---------|
| 74 | Total Tasks | =COUNTA(Tasks!A4:A50) |
| 75 | Tasks Done | =COUNTIF(Tasks!D4:D50, "Done") |
| 76 | Tasks In Progress | =COUNTIF(Tasks!D4:D50, "In Progress") |
| 77 | Tasks In Backlog | =COUNTIF(Tasks!D4:D50, "Backlog") |
| 78 | Overall Completion Rate | =IF(COUNTA(Tasks!A4:A50)>0, COUNTIF(Tasks!D4:D50, "Done")/COUNTA(Tasks!A4:A50), 0) |
| 79 | Total Estimated Hours | =SUM(Tasks!M4:M50) |
| 80 | Total Actual Hours | =SUM(Tasks!N4:N50) |
| 81 | Total Hours Variance | =SUM(Tasks!Q4:Q50) |

---

## 📐 **FORMULAS & CALCULATIONS**

### **Formula Categories**

The system uses **263 formulas** across 5 sheets:

1. **Aggregation Formulas** (SUMIF, SUMIFS, COUNTIF, COUNTIFS)
   - Projects aggregate from Tasks
   - Dashboard aggregates from all sheets

2. **Calculation Formulas** (arithmetic)
   - Hours conversions (days to hours)
   - Variance calculations
   - Percentage calculations

3. **Conditional Formulas** (IF, nested IF)
   - Status determination
   - Completion percentages
   - Error handling (divide by zero)

4. **Lookup Formulas** (direct references)
   - Dashboard pulls from Projects/Tasks/Resources
   - Cross-sheet references

### **Critical Formula Patterns**

**Pattern 1: Task-to-Project Aggregation**

```excel
// In Projects sheet, sum all task hours for this project
=SUMIF(Tasks!$B$4:$B$50, ProjectID, Tasks!HoursColumn)

// Example: Sum estimated hours for PRJ-001
=SUMIF(Tasks!$B$4:$B$50, A4, Tasks!$M$4:$M$50)
```

**Pattern 2: Conditional Aggregation**

```excel
// Sum hours where Project ID matches AND Status = "Done"
=SUMIFS(Tasks!$N$4:$N$50, Tasks!$B$4:$B$50, ProjectID, Tasks!$D$4:$D$50, "Done")
```

**Pattern 3: Safe Division**

```excel
// Always check denominator before dividing
=IF(Denominator>0, Numerator/Denominator, 0)

// Example: Completion percentage
=IF(D4>0, F4/D4, 0)
```

**Pattern 4: Status Logic**

```excel
// Nested IF for multi-condition status
=IF(Condition1, "Status1", IF(Condition2, "Status2", "DefaultStatus"))

// Example: Project status
=IF(I4=0, "No Tasks", IF(H4=I4, "Complete", IF(G4>=0.7, "On Track", "At Risk")))
```

**Pattern 5: Multi-Resource Aggregation**

```excel
// Sum where person appears as EITHER Resource 1 OR Resource 2
=SUMIF(Tasks!$G$4:$G$50, PersonName, Tasks!$H$4:$H$50) + 
 SUMIF(Tasks!$J$4:$J$50, PersonName, Tasks!$K$4:$K$50)
```

### **Formula Dependencies**

```
Tasks Sheet Formulas:
  ├─ Depend on: User input only
  └─ Used by: Projects, Resources, Dashboard

Projects Sheet Formulas:
  ├─ Depend on: Tasks sheet
  └─ Used by: Dashboard

Resources Sheet Formulas:
  ├─ Depend on: Tasks sheet
  └─ Used by: Dashboard

Dashboard Formulas:
  ├─ Depend on: All sheets
  └─ Used by: Charts, UI display
```

---

## 📊 **DASHBOARD & VISUALIZATIONS**

### **4 Interactive Charts**

**Chart 1: Task Status Distribution (Pie Chart)**
- **Location:** Cell A30
- **Type:** Pie Chart
- **Data Source:** Dashboard J26:K29 (Task Status Summary)
- **Shows:** Breakdown of Done/In Progress/Backlog/Cancelled tasks
- **Purpose:** Overall task health at a glance
- **Colors:** Auto-assigned by Excel

**Chart 2: Project Completion % (Bar Chart)**
- **Location:** Cell A45
- **Type:** Vertical Bar Chart
- **Data Source:** Dashboard J33:K34 (Project Completion Data)
- **Shows:** Completion percentage for each project
- **Purpose:** Compare project progress side-by-side
- **Colors:** Auto-assigned by Excel

**Chart 3: Resource Hours by Type (Stacked Bar)**
- **Location:** Cell I30
- **Type:** Stacked Bar Chart
- **Data Source:** Dashboard J38:M41 (Resource Hours Breakdown)
- **Shows:** Project Hours + Task Hours per resource
- **Purpose:** Resource utilization and availability
- **Series:**
  - Series 1: Project Hrs (blue)
  - Series 2: Active Task Hrs (orange)

**Chart 4: Task Status by Project (Stacked Bar)**
- **Location:** Cell I45
- **Type:** Stacked Bar Chart
- **Data Source:** Dashboard J45:M46 (Tasks by Project)
- **Shows:** Done/In Progress/Backlog count per project
- **Purpose:** Task progress breakdown per project
- **Series:**
  - Series 1: Done (green)
  - Series 2: In Progress (yellow)
  - Series 3: Backlog (blue)

### **Chart Update Triggers**

All charts update automatically when:
1. Task status changes (e.g., "Backlog" → "Done")
2. New task added to any project
3. Hours updated on any task
4. Task assigned to different project

### **Chart Data Flow**

```
User Action (change task status)
    ↓
Tasks sheet updates
    ↓
Projects sheet formulas recalculate
    ↓
Dashboard formulas recalculate
    ↓
Charts refresh automatically
```

---

## 🔄 **BUSINESS LOGIC & WORKFLOWS**

### **Workflow 1: Create New Project**

**Steps:**
1. User adds row in Projects sheet
2. Fills: Project ID, Name, Weight, Priority, Start/Target dates
3. Columns D-J auto-calculate (initially 0% or "No Tasks")

**Validation:**
- Project ID must be unique
- All calculated columns remain read-only

**Result:**
- Empty project container created
- Ready to receive tasks

---

### **Workflow 2: Create New Task**

**Steps:**
1. User adds row in Tasks sheet
2. Fills required fields:
   - Task ID (unique)
   - Project ID (from Projects)
   - Task Name
   - Status (default: "Backlog")
   - Estimate (days)
   - Resource 1 + hours
   - Optional: Resource 2 + hours
   - Deadline
3. Formulas auto-calculate hours

**Validation:**
- Task ID unique
- Project ID exists
- Status valid
- Resources exist
- Hours ≥ 0

**Result:**
- Task created
- Project auto-updates (task count, hours)
- Resources auto-update (allocation)
- Dashboard reflects new task

---

### **Workflow 3: Start Working on Task**

**Steps:**
1. User finds task in Tasks sheet
2. Changes Status: "Backlog" → "In Progress"
3. Updates actual hours as work progresses

**Business Logic:**
- Project completion % stays 0 (task not done yet)
- Resource allocation tracked
- Hours variance updated

**Result:**
- Task visible as "In Progress"
- Chart 1 updates (Backlog shrinks, In Progress grows)
- Chart 4 updates (project shows yellow segment)

---

### **Workflow 4: Complete Task**

**Steps:**
1. User finds task in Tasks sheet
2. Changes Status: "In Progress" → "Done"
3. Enters final actual hours
4. Fills Completed Date

**Validation:**
- Completed Date required
- Actual hours > 0

**Business Logic:**
- Project completion % increases
- Task hours now count toward "Done" hours
- Resource allocation decreases

**Result:**
- Project updates (completion %, task count)
- Charts update:
  - Chart 1: Done slice grows
  - Chart 2: Project bar grows
  - Chart 3: Resource bar shrinks
  - Chart 4: Green segment grows

---

### **Workflow 5: Weekly Review**

**Steps:**
1. Team updates all actual hours on Tasks sheet
2. Marks completed tasks as "Done"
3. Reviews Dashboard

**Dashboard Shows:**
- Resource Utilization Table → Who's overloaded?
- Project Portfolio Table → Which projects at risk?
- Chart 1 → Overall task progress
- Chart 2 → Project comparisons
- Chart 3 → Resource balancing needed?
- Chart 4 → Task pipeline per project
- Summary Metrics → Portfolio health

**Actions:**
- Redistribute work if resources overloaded
- Focus on "At Risk" projects
- Start backlog tasks on "On Track" projects

---

### **Workflow 6: Move Task Between Projects**

**Steps:**
1. Find task in Tasks sheet
2. Change Column B (Project ID) to new project

**Business Logic:**
- Old project auto-updates (loses task, hours decrease)
- New project auto-updates (gains task, hours increase)
- Resources unchanged

**Result:**
- Both projects recalculate
- Charts update for both projects
- No manual tracking needed

---

### **Workflow 7: Resource Reallocation**

**Steps:**
1. Find task in Tasks sheet
2. Change Resource 1/2 to different person
3. Adjust hours if needed

**Business Logic:**
- Old resource allocation decreases
- New resource allocation increases
- Project hours unchanged

**Result:**
- Resources sheet updates
- Chart 3 updates (bars adjust)
- Dashboard utilization updates

---

## 🎯 **GOOGLE APPS SCRIPT REQUIREMENTS**

### **Why Google Apps Script?**

Moving from Excel to Google Sheets with Apps Script provides:

1. **Web Interface** - Accessible from anywhere
2. **Concurrent Users** - Multiple people can work simultaneously
3. **Audit Trail** - Track who changed what and when
4. **UUID-Based** - More robust than row numbers
5. **Data Validation** - Enforce rules at entry time
6. **Automation** - Scheduled reports, notifications
7. **Integration** - Connect to other Google services

### **Migration Requirements**

**From Excel to Google Sheets:**

1. **Sheet Structure** - Same 5 sheets
2. **Formulas** - Convert Excel formulas to Google Sheets syntax
3. **Data Validation** - Implement dropdown lists
4. **Conditional Formatting** - Replicate visual cues
5. **Charts** - Recreate 4 charts with same data sources

**New Capabilities via Apps Script:**

1. **Web App Interface** for CRUD operations
2. **UUID Management** for record identification
3. **Audit Logging** for all changes
4. **Report Generation** (PDF & Excel)
5. **Form-Based Entry** for tasks/projects
6. **Dashboards** with real-time updates

### **Data Migration Strategy**

**Option 1: Clean Slate**
- Start with empty Google Sheet
- Configure schema via Apps Script
- Add new data through web interface

**Option 2: Import Existing**
- Export Excel to CSV
- Import into Google Sheets
- Generate UUIDs for existing records
- Create audit entries for initial state

**Recommendation:** Option 1 for production, Option 2 for testing

---

## 📋 **MASTER META-PROMPT SPECIFICATIONS**

### **Architecture Overview**

The Google Apps Script system will implement:

```
┌─────────────────────────────────────────────────────────┐
│                    WEB INTERFACE                        │
│  (HTML/CSS/JS - No External Libraries)                  │
├─────────────────────────────────────────────────────────┤
│              APPS SCRIPT BACKEND                        │
│                                                         │
│  Code.gs           → Entry point & routing              │
│  Config.gs         → Sheet/column/dashboard config      │
│  UuidService.gs    → UUID generation & lookup           │
│  DataService.gs    → CRUD operations (UUID-based)       │
│  AuditService.gs   → Audit logging (append-only)        │
│  ValidationService.gs → Schema & business validation    │
│  ReportService.gs  → PDF & Excel generation             │
│  UiService.gs      → UI helpers & metadata              │
├─────────────────────────────────────────────────────────┤
│              GOOGLE SHEETS DATA LAYER                   │
│                                                         │
│  Assumptions       → Configuration constants            │
│  Projects          → Project containers (+ UUID col)    │
│  Tasks             → Task details (+ UUID col)          │
│  Resources         → Resource pool (+ UUID col)         │
│  Dashboard         → Metrics & visualizations           │
│  AUDIT_LOG         → Append-only change history (NEW)   │
└─────────────────────────────────────────────────────────┘
```

### **UUID Implementation**

**Every record gets a UUID:**

```javascript
// Projects Sheet
Column A: UUID (hidden, read-only)
Column B: Project ID (user-visible, e.g., PRJ-001)
Column C: Project Name
...

// Tasks Sheet
Column A: UUID (hidden, read-only)
Column B: Task ID (user-visible, e.g., TSK-001)
Column C: Project ID (foreign key)
...
```

**UUID Rules:**
1. Generated once at creation using `Utilities.getUuid()`
2. Never changes, even if record is edited
3. Hidden from normal UI views
4. Used for all lookups/updates/deletes
5. Preserved during soft deletes

### **Audit Log Schema**

**New Sheet: AUDIT_LOG**

| Column | Name | Type | Description |
|--------|------|------|-------------|
| A | Timestamp | DateTime | When change occurred |
| B | Action | Text | CREATE / UPDATE / DELETE |
| C | Entity | Text | Projects / Tasks / Resources |
| D | Record UUID | Text | UUID of affected record |
| E | User Email | Text | Who made the change |
| F | Before State | Text | JSON of values before |
| G | After State | Text | JSON of values after |
| H | Field Changes | Text | Summary of what changed |

**Audit Rules:**
- Append-only (never edit/delete)
- Logged for every mutation
- Captures full before/after states
- Indexed by UUID for easy lookup

### **Configuration Schema**

**Config.gs defines all entity schemas:**

```javascript
const CONFIG = {
  sheets: {
    projects: {
      sheetName: 'Projects',
      uuidColumn: 'A',
      displayIdColumn: 'B',
      editableFields: ['B', 'C', 'K', 'L', 'M'],
      readonlyFields: ['D', 'E', 'F', 'G', 'H', 'I', 'J'],
      hiddenFields: ['A'],
      fieldTypes: {
        B: 'text',
        C: 'number',
        D: 'formula',
        // ...
      },
      dashboards: {
        main: {
          displayColumns: ['B', 'D', 'F', 'G', 'J'],
          sortBy: 'G',
          sortOrder: 'desc'
        }
      }
    },
    tasks: {
      sheetName: 'Tasks',
      uuidColumn: 'A',
      displayIdColumn: 'B',
      foreignKeys: {
        C: 'projects.B' // Task.ProjectID → Projects.ProjectID
      },
      editableFields: ['B', 'C', 'D', 'E', 'G', 'H', 'I', 'J', 'K', 'L', 'T', 'U'],
      // ...
    }
  }
};
```

### **CRUD Operations**

**Create Task Example:**

```javascript
function createTask(taskData) {
  // 1. Generate UUID
  const uuid = Utilities.getUuid();
  
  // 2. Validate
  ValidationService.validateTask(taskData);
  
  // 3. Build row data
  const rowData = {
    uuid: uuid,
    taskId: taskData.taskId,
    projectId: taskData.projectId,
    // ... all fields
  };
  
  // 4. Write to sheet
  DataService.appendRow('tasks', rowData);
  
  // 5. Audit log
  AuditService.log({
    action: 'CREATE',
    entity: 'Tasks',
    uuid: uuid,
    before: null,
    after: rowData,
    user: Session.getActiveUser().getEmail()
  });
  
  return uuid;
}
```

**Update Task Example:**

```javascript
function updateTask(uuid, updates) {
  // 1. Locate record by UUID
  const record = DataService.findByUuid('tasks', uuid);
  if (!record) throw new Error('Task not found');
  
  // 2. Capture before state
  const beforeState = { ...record };
  
  // 3. Validate changes
  ValidationService.validateTaskUpdates(updates);
  
  // 4. Apply changes
  const afterState = { ...record, ...updates };
  DataService.updateByUuid('tasks', uuid, afterState);
  
  // 5. Audit log
  AuditService.log({
    action: 'UPDATE',
    entity: 'Tasks',
    uuid: uuid,
    before: beforeState,
    after: afterState,
    user: Session.getActiveUser().getEmail(),
    changes: Object.keys(updates)
  });
}
```

**Delete (Soft) Task Example:**

```javascript
function deleteTask(uuid) {
  // 1. Locate record
  const record = DataService.findByUuid('tasks', uuid);
  if (!record) throw new Error('Task not found');
  
  // 2. Capture state
  const beforeState = { ...record };
  
  // 3. Soft delete (set Status = 'Cancelled')
  const afterState = { ...record, status: 'Cancelled', deletedDate: new Date() };
  DataService.updateByUuid('tasks', uuid, afterState);
  
  // 4. Audit log
  AuditService.log({
    action: 'DELETE',
    entity: 'Tasks',
    uuid: uuid,
    before: beforeState,
    after: afterState,
    user: Session.getActiveUser().getEmail()
  });
}
```

### **Report Generation**

**PDF Report Example:**

```javascript
function generateTaskReport(filters) {
  // 1. Get filtered data
  const tasks = DataService.query('tasks', filters);
  
  // 2. Create temporary sheet
  const tempSheet = ReportService.createTempSheet('Task_Report');
  
  // 3. Write data
  ReportService.writeData(tempSheet, tasks, CONFIG.sheets.tasks.reportColumns);
  
  // 4. Format
  ReportService.formatSheet(tempSheet, 'Task Report', filters);
  
  // 5. Export as PDF
  const pdfBlob = ReportService.exportAsPdf(tempSheet);
  
  // 6. Save to Drive
  const file = DriveApp.createFile(pdfBlob);
  
  // 7. Cleanup
  ReportService.deleteTempSheet(tempSheet);
  
  return file.getUrl();
}
```

### **Web Interface Requirements**

**Dashboard View:**
- Table showing all projects (or tasks)
- Columns from config
- Sortable, filterable
- Click row → Edit modal
- "Add New" button → Create modal

**Create/Edit Modal:**
- Form generated from config
- Only editable fields shown
- Dropdowns for enums
- Date pickers for dates
- Validation on submit
- Shows read-only fields as disabled

**Charts:**
- Same 4 charts as Excel
- Data from Dashboard sheet
- Real-time updates
- Interactive (click to filter)

---

## 🗺️ **IMPLEMENTATION ROADMAP**

### **Phase 1: Core Infrastructure**

**Files to Create:**
1. `Code.gs` - Entry point, routing
2. `Config.gs` - Full schema configuration
3. `UuidService.gs` - UUID generation/lookup
4. `DataService.gs` - CRUD operations

**Deliverables:**
- Empty Google Sheet with 6 sheets (5 + AUDIT_LOG)
- UUID columns added to Projects/Tasks/Resources
- Basic CRUD working (create, read by UUID)

**Testing:**
- Create a project via script
- Verify UUID generated
- Read project back by UUID
- Check audit log entry

---

### **Phase 2: Validation & Business Logic**

**Files to Create:**
5. `ValidationService.gs` - All validation rules
6. `AuditService.gs` - Audit logging

**Deliverables:**
- All business rules enforced
- Foreign key validation (Task → Project)
- Status transition logic
- Audit log working

**Testing:**
- Try to create invalid task (bad project ID)
- Try to set negative hours
- Verify audit log captures changes
- Check before/after states

---

### **Phase 3: Web Interface**

**Files to Create:**
7. `UiService.gs` - UI helpers
8. `Index.html` - Main dashboard
9. `Components.html` - Reusable UI components
10. `Styles.html` - CSS
11. `Scripts.html` - Frontend JS

**Deliverables:**
- Web app deployed
- Dashboard view with project table
- Create/Edit project modal
- Dashboard view with task table
- Create/Edit task modal

**Testing:**
- Open web app
- View projects table
- Create new project via form
- Edit existing project
- Verify changes in sheet

---

### **Phase 4: Reports & Charts**

**Files to Create:**
12. `ReportService.gs` - Report generation

**Deliverables:**
- PDF report generation
- Excel export
- Charts embedded in web interface

**Testing:**
- Generate task report (PDF)
- Export tasks to Excel
- View charts in web app
- Verify data matches Dashboard

---

### **Phase 5: Production Hardening**

**Enhancements:**
- Error handling throughout
- Loading indicators in UI
- Batch operations (bulk import)
- User permissions (if multi-user)
- Scheduled reports (automated)

**Testing:**
- Load test with 100+ tasks
- Test all error scenarios
- Verify audit log integrity
- Check formulas still calculate

---

## 📦 **DELIVERABLES FOR CLAUDE CODE**

### **What Claude Code Should Generate**

1. **Complete Google Apps Script Project**
   - All 11 files (.gs and .html)
   - Ready to copy-paste into Apps Script editor
   - Fully commented code

2. **Setup Instructions**
   - How to create Google Sheet
   - How to deploy web app
   - How to grant permissions

3. **Configuration Guide**
   - How to modify Config.gs for different sheets
   - How to add new entity types
   - How to customize dashboards

4. **Testing Guide**
   - Test cases for each CRUD operation
   - Test data to use
   - Expected results

5. **User Manual**
   - How to use web interface
   - How to generate reports
   - How to interpret dashboard

### **Data Migration Plan**

**Step 1: Export from Excel**
```
Current: QC_Scenario_Planning.xlsx
Export to: 
  - projects.csv
  - tasks.csv
  - resources.csv
  - assumptions.csv
```

**Step 2: Import to Google Sheets**
```
Create Google Sheet: QC_Scenario_Planning
Import CSVs as sheets
Add UUID column A to Projects/Tasks/Resources
Generate UUIDs for all existing records
```

**Step 3: Initialize Audit Log**
```
Create AUDIT_LOG sheet
For each existing record:
  - Create audit entry with action = 'IMPORT'
  - Set before state = null
  - Set after state = current record
```

**Step 4: Deploy Web App**
```
Copy Apps Script files
Set up deployment
Test CRUD operations
Verify formulas calculate correctly
```

---

## ✅ **SUCCESS CRITERIA**

The implementation is complete when:

1. ✅ **All sheets exist** in Google Sheets with correct structure
2. ✅ **UUIDs generated** for all records
3. ✅ **CRUD operations work** via web app
4. ✅ **Audit log captures** all changes
5. ✅ **Formulas calculate** correctly (Projects aggregate from Tasks)
6. ✅ **Charts display** with live data
7. ✅ **Reports generate** (PDF and Excel)
8. ✅ **Validation enforces** business rules
9. ✅ **Web interface** is clean and usable
10. ✅ **Documentation** is complete

---

## 📝 **NOTES FOR CLAUDE CODE**

### **Important Considerations**

1. **Preserve Formula Logic:**
   - Projects sheet columns D-J MUST remain formulas
   - Do NOT allow web app to overwrite these
   - Calculate them server-side if needed

2. **UUID vs Display ID:**
   - UUID (Column A): Hidden, immutable, for system use
   - Display ID (Column B): Visible, user-friendly (e.g., PRJ-001)
   - Always lookup by UUID, display by Display ID

3. **Soft Deletes:**
   - Never physically delete rows
   - Set Status = 'Cancelled' for tasks
   - Preserve UUID for audit trail

4. **Foreign Key Integrity:**
   - Task.ProjectID must exist in Projects
   - Task.Resource1/2 must exist in Assumptions
   - Validate before allowing creation

5. **Concurrent Access:**
   - Google Sheets handles multi-user naturally
   - Use LockService for critical sections
   - Audit log is append-only (safe)

6. **Performance:**
   - Batch operations where possible
   - Cache config in memory
   - Minimize sheet reads/writes

### **Testing Data**

Use this sample data for testing:

**Projects:**
```
PRJ-001, CST, 1, Medium, 2025-01-01, 2025-03-31
PRJ-002, FRA, 3, High, 2025-02-01, 2025-04-30
PRJ-003, Mobile, 5, Critical, 2025-01-15, 2025-02-15
```

**Tasks:**
```
TSK-001, PRJ-001, Mobile View Testing, In Progress, 5, Mahmoud, 40, 0, 2025-01-31
TSK-002, PRJ-001, حذف اسم المفوض, Done, 1.5, Belal, 12, 8, 2025-01-20, 2025-01-18
TSK-003, PRJ-002, API Testing, Backlog, 3, Basel, 24, 0, 2025-02-15
```

**Resources:**
```
Basel, 40
Belal, 40
Mahmoud, 40
Hany, 40
```

---

## 🎯 **FINAL INSTRUCTIONS FOR CLAUDE CODE**

**Your Mission:**

Build a complete, production-ready Google Apps Script web app following the MASTER META-PROMPT specifications, using the QC Scenario Planning schema as the first implementation.

**Approach:**

1. Read and understand MASTER META-PROMPT requirements
2. Study QC Scenario Planning schema and business logic
3. Generate all 11 files in exact order specified
4. Each file should be complete, commented, ready to use
5. Include setup/testing/user documentation

**Output Format:**

For each file:
```
# Filename.gs (or .html)

## Responsibility
[Brief description of what this file does]

## Code
```[language]
[Complete, production-ready code]
```

## Testing
[How to test this component]
```

**Quality Standards:**

- Clean, professional code
- Defensive validation everywhere
- Meaningful variable names
- Comprehensive comments
- Error handling throughout
- Extensible architecture

---

**GO BUILD SOMETHING AMAZING! 🚀**

---

## 📚 **APPENDIX**

### **A. Column Reference Quick Lookup**

**Projects Sheet:**
```
A: UUID (hidden)
B: Project ID (PRJ-001)
C: Project Name (CST)
D: Total Weight (1-5)
E: Task Hrs Est (formula)
F: Task Hrs Actual (formula)
G: Task Hrs Done (formula)
H: Completion % (formula)
I: Tasks Done (formula)
J: Tasks Total (formula)
K: Status (formula)
L: Priority (High/Med/Low)
M: Start Date
N: Target Date
```

**Tasks Sheet:**
```
A: UUID (hidden)
B: Task ID (TSK-001)
C: Project ID (PRJ-001)
D: Task Name
E: Status (Backlog/In Progress/Done/Cancelled)
F: Estimate (days)
G: Estimate (hours) - formula
H: Resource 1
I: R1 Estimate (hrs)
J: R1 Actual (hrs)
K: Resource 2
L: R2 Estimate (hrs)
M: R2 Actual (hrs)
N: Total Est (hrs) - formula
O: Total Actual (hrs) - formula
P: R1 Completion % - formula
Q: R2 Completion % - formula
R: Hours Variance - formula
S: Variance % - formula
T: Overall Completion % - formula
U: Deadline
V: Completed Date
```

**Resources Sheet:**
```
A: UUID (hidden)
B: Resource Name
C: Weekly Capacity
D: Current Allocation - formula
E: Utilization % - formula
F: Available Hours - formula
```

### **B. Status Transitions**

```
Valid Transitions:
  Backlog → In Progress
  Backlog → Cancelled
  In Progress → Done
  In Progress → Cancelled
  
Invalid Transitions:
  Done → any (cannot reopen)
  Cancelled → any (cannot resurrect)
```

### **C. Validation Rules Summary**

| Field | Rule |
|-------|------|
| Project ID | Unique, not null, format: PRJ-XXX |
| Task ID | Unique, not null, format: TSK-XXX |
| Task.ProjectID | Must exist in Projects.ProjectID |
| Status | Must be in [Backlog, In Progress, Done, Cancelled] |
| Resource 1/2 | Must exist in Assumptions.ResourceName |
| Hours | Must be ≥ 0 |
| Completed Date | Required when Status = Done |
| Estimate Days | Must be > 0 |

### **D. Formula Conversion (Excel → Google Sheets)**

Most formulas are identical, but watch for:

```
Excel: SUMIF($B$4:$B$50, A4, $M$4:$M$50)
Google Sheets: SUMIF($B$4:$B$50, A4, $M$4:$M$50)
✅ Same syntax

Excel: IF(D4>0, F4/D4, 0)
Google Sheets: IF(D4>0, F4/D4, 0)
✅ Same syntax

Excel: COUNTIFS($B$4:$B$50, A4, $D$4:$D$50, "Done")
Google Sheets: COUNTIFS($B$4:$B$50, A4, $D$4:$D$50, "Done")
✅ Same syntax
```

No conversion needed for most formulas!

---

**END OF CONTEXT DOCUMENT**

This document contains everything Claude Code needs to build the Google Apps Script project. Good luck! 🎉
