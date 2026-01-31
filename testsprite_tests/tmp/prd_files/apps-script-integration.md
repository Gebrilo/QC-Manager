# Phase 1: Core Infrastructure - Setup & Testing Guide

## Overview

Phase 1 implements the foundational infrastructure for the QC Scenario Planning Google Apps Script system:

- **Config.gs**: Central configuration for all sheet schemas
- **UuidService.gs**: UUID generation and record lookup
- **DataService.gs**: CRUD operations (Create, Read, Update, Delete)
- **Code.gs**: Entry point, routing, and test functions

## Prerequisites

1. A Google Account
2. The existing QC_Scenario_Planning.xlsx Excel file
3. Access to Google Sheets and Google Apps Script

## Setup Instructions

### Step 1: Create Google Sheet

1. Go to Google Sheets (https://sheets.google.com)
2. Create a new blank spreadsheet
3. Name it: **QC_Scenario_Planning**

### Step 2: Import Excel Data

1. Open your Excel file `QC_Scenario_Planning.xlsx`
2. Copy each sheet manually to Google Sheets:
   - **Assumptions** sheet → Copy all data to new sheet named "Assumptions"
   - **Projects** sheet → Copy all data to new sheet named "Projects"
   - **Tasks** sheet → Copy all data to new sheet named "Tasks"
   - **Resources** sheet → Copy all data to new sheet named "Resources"
   - **Dashboard** sheet → Copy all data to new sheet named "Dashboard"

**Important**: Keep the exact same sheet names as they appear in Excel.

### Step 3: Open Apps Script Editor

1. In your Google Sheet, click **Extensions** → **Apps Script**
2. Delete the default `Code.gs` content
3. You'll now add our four files

### Step 4: Add Script Files

1. **Rename the default file to Config.gs**:
   - Click on "Code.gs" in the left sidebar
   - Click the three dots → Rename
   - Name it: `Config.gs`
   - Paste the entire contents of `Config.gs`

2. **Add UuidService.gs**:
   - Click the **+** button next to "Files"
   - Choose "Script"
   - Name it: `UuidService.gs`
   - Paste the entire contents of `UuidService.gs`

3. **Add DataService.gs**:
   - Click the **+** button next to "Files"
   - Choose "Script"
   - Name it: `DataService.gs`
   - Paste the entire contents of `DataService.gs`

4. **Add Code.gs**:
   - Click the **+** button next to "Files"
   - Choose "Script"
   - Name it: `Code.gs`
   - Paste the entire contents of `Code.gs`

5. **Save the project**:
   - Click the disk icon or Ctrl+S
   - Name the project: "QC Scenario Planning"

### Step 5: Initial Setup

1. Close the Apps Script editor
2. **Refresh your Google Sheet** (F5 or reload the page)
3. After a few seconds, you should see a new menu: **"QC Scenario Planning"**
4. Click **QC Scenario Planning** → **Initialize Sheet (First Time)**
5. **Grant permissions when prompted**:
   - Click "Review permissions"
   - Choose your Google account
   - Click "Advanced" → "Go to QC Scenario Planning (unsafe)"
   - Click "Allow"

6. Wait for initialization to complete (check for completion toast notification)

### Step 6: Verify Initialization

After initialization, verify:

1. **Projects sheet**:
   - Column A should now be hidden (UUID column)
   - Existing projects should have UUIDs generated

2. **Tasks sheet**:
   - Column A should now be hidden (UUID column)
   - Existing tasks should have UUIDs generated

3. **Resources sheet**:
   - Column A should now be hidden (UUID column)
   - Existing resources should have UUIDs generated

4. **New sheet created**:
   - Sheet named **AUDIT_LOG** should exist
   - Header row with columns: Timestamp, Action, Entity, Record UUID, User Email, Before State, After State, Field Changes

## Testing Phase 1

### Test 1: Run All Tests

1. Click **QC Scenario Planning** → **Run Phase 1 Tests**
2. Check execution log:
   - Click **Extensions** → **Apps Script**
   - Click **Executions** in the left sidebar
   - Click the most recent execution
   - Review the log output

**Expected Results**:
- All tests should pass
- Log should show: "ALL TESTS PASSED!"

### Test 2: Individual Tests

Run each test individually to verify specific functionality:

#### Test Create Project

1. Click **QC Scenario Planning** → **Test: Create Project**
2. Check the Projects sheet - a new project should appear with:
   - UUID in column A (hidden)
   - Project ID: PRJ-TEST-001
   - Project Name: Test Project Alpha
   - Priority: High

#### Test Create Task

1. First, ensure at least one project exists
2. Click **QC Scenario Planning** → **Test: Create Task**
3. Check the Tasks sheet - a new task should appear with:
   - UUID in column A (hidden)
   - Task ID: TSK-TEST-001
   - Task Name: Test Task Alpha
   - Status: Backlog
   - Linked to the first project

#### Test Query Tasks

1. Click **QC Scenario Planning** → **Test: Query Tasks**
2. Check execution log - should show all backlog tasks sorted by deadline

### Test 3: Manual CRUD Operations

#### Create a Project Manually via Script

1. Open Apps Script editor
2. Add this function:

```javascript
function manualCreateProject() {
  const projectData = {
    projectId: 'PRJ-999',
    projectName: 'Manual Test Project',
    totalWeight: 2,
    priority: 'Medium',
    startDate: new Date('2025-02-01'),
    targetDate: new Date('2025-04-30')
  };

  const result = DataService.create('projects', projectData);
  Logger.log('Created project: ' + JSON.stringify(result.data));
}
```

3. Run the function
4. Check Projects sheet for the new project

#### Read a Project

1. Add this function:

```javascript
function manualReadProject() {
  // Replace with an actual UUID from your Projects sheet
  const uuid = 'YOUR-UUID-HERE';
  const record = DataService.read('projects', uuid);
  Logger.log('Project data: ' + JSON.stringify(record.data, null, 2));
}
```

2. Copy a UUID from column A of Projects sheet (unhide it temporarily)
3. Replace 'YOUR-UUID-HERE' with the actual UUID
4. Run the function
5. Check log for project data

#### Update a Project

1. Add this function:

```javascript
function manualUpdateProject() {
  const uuid = 'YOUR-UUID-HERE';
  const updates = {
    priority: 'Critical',
    totalWeight: 5
  };

  const result = DataService.update('projects', uuid, updates);
  Logger.log('Updated project: ' + JSON.stringify(result.data));
}
```

2. Run the function
3. Verify changes in Projects sheet

## Verifying Formulas

After creating tasks, verify that Project formulas are calculating correctly:

1. Create a few tasks linked to a project
2. Check the project row in Projects sheet:
   - **Column E (Task Hrs Est)**: Should sum all task estimated hours
   - **Column F (Task Hrs Actual)**: Should sum all task actual hours
   - **Column G (Task Hrs Done)**: Should sum hours from "Done" tasks only
   - **Column H (Completion %)**: Should show Done hours / Estimated hours
   - **Column I (Tasks Done)**: Should count "Done" tasks
   - **Column J (Tasks Total)**: Should count all tasks
   - **Column K (Status)**: Should show "On Track", "At Risk", or "Complete"

## Common Issues & Solutions

### Issue: Menu doesn't appear

**Solution**:
1. Refresh the page (F5)
2. Wait 10-20 seconds
3. If still not appearing, reopen the sheet

### Issue: Permission errors

**Solution**:
1. Ensure you've granted all permissions
2. Try: Extensions → Apps Script → Run → testCreateProject
3. Grant permissions in the popup

### Issue: UUID column visible

**Solution**:
1. The initialization should hide it automatically
2. If visible, manually hide column A in Projects, Tasks, and Resources sheets

### Issue: Formulas not calculating

**Solution**:
1. Check that formula columns (E-K in Projects) were not overwritten
2. Re-run initialization if needed
3. Manually verify formula syntax matches Config.gs

### Issue: "Sheet not found" error

**Solution**:
1. Verify sheet names exactly match: "Projects", "Tasks", "Resources", "Assumptions", "Dashboard"
2. Names are case-sensitive
3. No extra spaces

## Next Steps

Once Phase 1 is tested and working:

1. **Verify all CRUD operations work correctly**
2. **Confirm formulas are calculating properly**
3. **Check UUID generation and lookup**
4. **Proceed to Phase 2**: Validation & Audit Logging

## Phase 1 Success Criteria

✅ Phase 1 is complete when:

- [ ] All four script files are loaded without errors
- [ ] Custom menu appears in Google Sheets
- [ ] UUID columns exist in Projects, Tasks, Resources (hidden)
- [ ] AUDIT_LOG sheet exists with proper structure
- [ ] Can create projects and tasks via script
- [ ] Can read records by UUID
- [ ] Can update records by UUID
- [ ] Can query records with filters
- [ ] Project formulas calculate correctly
- [ ] All tests pass successfully

## Support

If you encounter issues:

1. Check the Execution log (Apps Script → Executions)
2. Review error messages carefully
3. Verify all sheet names match configuration
4. Ensure data structure matches schema in Config.gs

## Files Reference

- **Config.gs**: 400+ lines - Schema configuration
- **UuidService.gs**: 250+ lines - UUID operations
- **DataService.gs**: 350+ lines - CRUD operations
- **Code.gs**: 350+ lines - Entry point and tests

Total: ~1,350 lines of production-ready code for Phase 1.
