# Phase 2: Validation & Audit Logging - Setup & Testing Guide

## Overview

Phase 2 adds comprehensive validation and audit logging to the QC Scenario Planning system:

- **ValidationService.gs**: Business rule enforcement and data validation
- **AuditService.gs**: Append-only audit trail for compliance
- **Updated DataService.gs**: Integrated validation and audit logging in all CRUD operations
- **Updated Code.gs**: Phase 2 test functions and enhanced menu

## What's New in Phase 2

### 1. Comprehensive Validation

All data is validated before being written to the sheet:

**Project Validation:**
- Project ID format: `PRJ-XXX` (e.g., PRJ-001)
- Project ID uniqueness
- Total Weight: 1-5
- Priority: High/Medium/Low/Critical
- Target Date must be after Start Date
- Read-only fields protected

**Task Validation:**
- Task ID format: `TSK-XXX` (e.g., TSK-001)
- Task ID uniqueness
- Foreign key: Project ID must exist
- Status: Backlog/In Progress/Done/Cancelled
- Status transitions enforced (e.g., Done → Backlog is invalid)
- Resource names must exist in Assumptions
- Hours cannot be negative
- "Done" status requires Completed Date and actual hours
- Read-only formula fields protected

**Resource Validation:**
- Resource Name uniqueness
- Weekly Capacity must be > 0 and ≤ 168 hours
- Read-only fields protected

### 2. Status Transition Rules

Valid transitions enforced by the system:

```
Backlog → In Progress
Backlog → Cancelled

In Progress → Done
In Progress → Cancelled

Done → (no transitions allowed)
Cancelled → (no transitions allowed)
```

### 3. Audit Logging

Every data mutation is logged:

**AUDIT_LOG Sheet Columns:**
- **Timestamp**: When the change occurred
- **Action**: CREATE / UPDATE / DELETE
- **Entity**: Projects / Tasks / Resources
- **Record UUID**: The UUID of the affected record
- **User Email**: Who made the change
- **Before State**: JSON of data before change
- **After State**: JSON of data after change
- **Field Changes**: Human-readable summary

**Key Features:**
- Append-only (cannot be modified)
- Full before/after state capture
- User tracking
- Query by UUID, entity, or action
- Statistics and export capabilities

## Setup Instructions

### Prerequisites

Phase 1 must be completed and working:
- ✅ All 4 Phase 1 files deployed
- ✅ Sheet initialized with UUID columns
- ✅ AUDIT_LOG sheet created
- ✅ Phase 1 tests passing

### Step 1: Add Phase 2 Files

1. Open your Google Sheet
2. Go to **Extensions** → **Apps Script**
3. Add two new files:

**Add ValidationService.gs:**
- Click **+** next to "Files" → "Script"
- Name it: `ValidationService.gs`
- Paste the entire contents of `ValidationService.gs`

**Add AuditService.gs:**
- Click **+** next to "Files" → "Script"
- Name it: `AuditService.gs`
- Paste the entire contents of `AuditService.gs`

### Step 2: Update Existing Files

**Update DataService.gs:**
- Open existing `DataService.gs`
- Replace its contents with the updated version
- Save the file

**Update Code.gs:**
- Open existing `Code.gs`
- Replace its contents with the updated version (includes Phase 2 tests)
- Save the file

### Step 3: Save and Refresh

1. Click **Save** (disk icon or Ctrl+S)
2. Close Apps Script editor
3. **Refresh your Google Sheet** (F5)
4. The menu should now show "Run Phase 2 Tests"

## Testing Phase 2

### Test Suite 1: Validation Tests

#### Test 1: Invalid Project ID Format

**Run:** `QC Scenario Planning` → `Phase 2 Tests` → `Test Invalid Project`

**Expected:**
```
✓ Validation correctly rejected invalid project ID
Error message: Validation failed:
Project ID must match format: PRJ-XXX (e.g., PRJ-001)
```

#### Test 2: Duplicate Project ID

**Run:** `QC Scenario Planning` → `Phase 2 Tests` → `Test Duplicate ID`

**Expected:**
```
✓ Validation correctly rejected duplicate project ID
Error message: Validation failed:
Project ID PRJ-DUP already exists
```

#### Test 3: Invalid Foreign Key

**Run:** `QC Scenario Planning` → `Phase 2 Tests` → `Test Invalid Foreign Key`

**Expected:**
```
✓ Validation correctly rejected invalid project ID
Error message: Validation failed:
Project PRJ-NONEXISTENT does not exist
```

#### Test 4: Invalid Status Transition

**Run:** `QC Scenario Planning` → `Phase 2 Tests` → `Test Status Transition`

**Expected:**
```
✓ Validation correctly rejected invalid status transition
Error message: Validation failed:
Cannot transition from "Done" to "Backlog". Allowed transitions: None
```

### Test Suite 2: Audit Logging Tests

#### Test 5: Audit Log Create

**Run:** `QC Scenario Planning` → `Phase 2 Tests` → `Test Audit Log Create`

**Expected:**
```
Project created: PRJ-AUDIT-001
Audit log entries: 1
✓ Audit log entry created
Action: CREATE
User: your-email@domain.com
Changes: Record created
```

**Verify:**
1. Open the AUDIT_LOG sheet
2. You should see a new row with:
   - Recent timestamp
   - Action: CREATE
   - Entity: Projects
   - Your email address
   - After State: JSON with project data

#### Test 6: Audit Log Update

**Run:** `QC Scenario Planning` → `Phase 2 Tests` → `Test Audit Log Update`

**Expected:**
```
Updating project: [project-id]
Project updated
✓ Audit log entry created for update
Changes: priority: "High" → "Critical"; totalWeight: "3" → "5"
```

**Verify:**
1. Open the AUDIT_LOG sheet
2. You should see an UPDATE entry with field changes

#### Test 7: Audit Log Queries

**Run:** `QC Scenario Planning` → `Phase 2 Tests` → `Test Audit Queries`

**Expected:**
```
Recent activity: X entries
- CREATE Projects by your-email@domain.com
- UPDATE Projects by your-email@domain.com
- CREATE Tasks by your-email@domain.com

Audit Log Statistics:
Total entries: X
Actions: {"CREATE":X,"UPDATE":Y}
Entities: {"Projects":X,"Tasks":Y}
✓ Audit log queries working
```

### Test Suite 3: Run All Tests

**Run:** `QC Scenario Planning` → `Run Phase 2 Tests`

This runs all 7 tests in sequence. All should pass.

**Expected output:**
```
========================================
RUNNING ALL PHASE 2 TESTS
========================================
[... test outputs ...]
========================================
ALL PHASE 2 TESTS PASSED!
========================================
```

## Manual Testing Scenarios

### Scenario 1: Try to Create Invalid Task

```javascript
function manualTestInvalidTask() {
  // This should fail - invalid task ID
  const taskData = {
    taskId: 'WRONG-FORMAT',  // Invalid format
    projectId: 'PRJ-001',
    taskName: 'Test Task',
    status: 'Backlog',
    estimateDays: 5,
    resource1: 'Basel',
    r1EstHrs: 40,
    r1ActualHrs: 0,
    deadline: new Date('2025-02-15')
  };

  try {
    DataService.create('tasks', taskData);
    Logger.log('ERROR: Should have failed!');
  } catch (error) {
    Logger.log('✓ Correctly rejected: ' + error.message);
  }
}
```

### Scenario 2: Check Task Status Transition

```javascript
function manualTestStatusFlow() {
  // Create task in Backlog
  const taskData = {
    taskId: 'TSK-FLOW',
    projectId: 'PRJ-001',  // Replace with existing project
    taskName: 'Status Flow Test',
    status: 'Backlog',
    estimateDays: 3,
    resource1: 'Basel',
    r1EstHrs: 24,
    r1ActualHrs: 0,
    deadline: new Date('2025-02-15')
  };

  const task = DataService.create('tasks', taskData);
  Logger.log('Created: ' + task.data.status);

  // Valid: Backlog → In Progress
  DataService.update('tasks', task.uuid, { status: 'In Progress' });
  Logger.log('Updated to: In Progress ✓');

  // Valid: In Progress → Done
  DataService.update('tasks', task.uuid, {
    status: 'Done',
    r1ActualHrs: 24,
    completedDate: new Date()
  });
  Logger.log('Updated to: Done ✓');

  // Invalid: Done → Backlog (should fail)
  try {
    DataService.update('tasks', task.uuid, { status: 'Backlog' });
    Logger.log('ERROR: Should have failed!');
  } catch (error) {
    Logger.log('✓ Correctly rejected: ' + error.message);
  }
}
```

### Scenario 3: View Audit History

```javascript
function manualViewAuditHistory() {
  // Get first project
  const projects = DataService.getAll('projects');
  if (projects.length === 0) return;

  const project = projects[0];
  Logger.log('Project: ' + project.data.projectId);

  // Get full history
  const history = AuditService.getRecordHistory(project.uuid);

  Logger.log('\nAudit History (' + history.length + ' entries):');
  history.forEach(entry => {
    Logger.log(`${entry.timestamp} - ${entry.action} by ${entry.userEmail}`);
    Logger.log(`  Changes: ${entry.fieldChanges}`);
  });
}
```

## Validation Rules Reference

### Project Validation Rules

| Rule | Description | Error Message |
|------|-------------|---------------|
| ID Format | Must be PRJ-XXX | "Project ID must match format: PRJ-XXX" |
| ID Unique | No duplicates | "Project ID {id} already exists" |
| Name Required | Cannot be empty | "Project Name is required" |
| Name Length | Max 100 chars | "Project Name must be 100 characters or less" |
| Weight Range | 1-5 | "Total Weight must be between 1 and 5" |
| Priority Enum | High/Medium/Low/Critical | "Priority must be one of: ..." |
| Date Logic | Target > Start | "Target Date must be after Start Date" |

### Task Validation Rules

| Rule | Description | Error Message |
|------|-------------|---------------|
| ID Format | Must be TSK-XXX | "Task ID must match format: TSK-XXX" |
| ID Unique | No duplicates | "Task ID {id} already exists" |
| Project FK | Must exist | "Project {id} does not exist" |
| Name Required | Cannot be empty | "Task Name is required" |
| Name Length | Max 200 chars | "Task Name must be 200 characters or less" |
| Status Enum | Valid status only | "Status must be one of: ..." |
| Status Transition | Enforced flow | "Cannot transition from {old} to {new}" |
| Resource Valid | In Assumptions | "Resource {name} is not valid" |
| Hours Positive | >= 0 | "{field} cannot be negative" |
| Hours Max | <= 1000 | "{field} cannot exceed 1000 hours" |
| Done Rules | Requires date & hours | "Completed Date is required when Status is Done" |

### Resource Validation Rules

| Rule | Description | Error Message |
|------|-------------|---------------|
| Name Unique | No duplicates | "Resource {name} already exists" |
| Name Required | Cannot be empty | "Resource Name is required" |
| Name Length | Max 50 chars | "Resource Name must be 50 characters or less" |
| Capacity Positive | > 0 | "Weekly Capacity must be greater than 0" |
| Capacity Max | <= 168 | "Weekly Capacity cannot exceed 168 hours" |

## Troubleshooting

### Issue: Validation always passes (no errors thrown)

**Solution:**
1. Check that ValidationService.gs is loaded
2. Verify DataService.gs has been updated with validation calls
3. Look for JavaScript errors in execution log

### Issue: Audit log not recording entries

**Solution:**
1. Check AUDIT_LOG sheet exists
2. Verify AuditService.gs is loaded
3. Check execution log for audit errors (they don't break main operations)
4. Ensure DataService.gs has audit logging calls

### Issue: Status transitions not working correctly

**Solution:**
1. Check CONFIG.validation.statusTransitions in Config.gs
2. Verify task has a status field
3. Check ValidationService.validateStatusTransition logic

### Issue: Foreign key validation not working

**Solution:**
1. Ensure the referenced project exists
2. Check project ID matches exactly (case-sensitive)
3. Verify UUID lookup is working (Phase 1 test)

## Integration with Phase 1

Phase 2 enhances Phase 1 without breaking it:

**DataService Changes:**
- `create()` now validates and audits
- `update()` now validates and audits
- `delete()` now audits
- All other functions unchanged

**Backward Compatibility:**
- Existing Phase 1 tests still work
- No changes to sheet structure
- UUID system unchanged
- Formula preservation intact

## Next Steps

Once Phase 2 is tested and working:

1. **Verify all validation rules work**
2. **Confirm audit log captures all changes**
3. **Test status transitions thoroughly**
4. **Review audit log in sheet**
5. **Proceed to Phase 3**: Web Interface (coming next)

## Phase 2 Success Criteria

✅ Phase 2 is complete when:

- [ ] ValidationService.gs loaded without errors
- [ ] AuditService.gs loaded without errors
- [ ] DataService.gs updated and working
- [ ] Code.gs updated with Phase 2 tests
- [ ] All 7 Phase 2 tests pass
- [ ] Invalid data is rejected with clear error messages
- [ ] Status transitions are enforced
- [ ] Foreign keys are validated
- [ ] Every create/update/delete is logged to AUDIT_LOG
- [ ] Audit log can be queried by UUID and entity
- [ ] Audit statistics are accurate
- [ ] Phase 1 tests still pass

## Files Reference

### New Files (Phase 2):
- **ValidationService.gs**: 450+ lines - Comprehensive validation
- **AuditService.gs**: 400+ lines - Audit trail management

### Updated Files:
- **DataService.gs**: Now 390+ lines (added validation & audit calls)
- **Code.gs**: Now 690+ lines (added Phase 2 tests)

### Unchanged Files:
- **Config.gs**: No changes needed
- **UuidService.gs**: No changes needed

Total Phase 2 additions: ~850 new lines + ~40 lines of updates = ~890 lines

## Advanced Usage

### Export Audit Log to CSV

```javascript
function exportAuditLog() {
  const csv = AuditService.exportToCsv();
  Logger.log(csv);
  // Or save to Google Drive
  const blob = Utilities.newBlob(csv, 'text/csv', 'audit_log.csv');
  const file = DriveApp.createFile(blob);
  Logger.log('Saved to: ' + file.getUrl());
}
```

### Get Activity for Specific Entity

```javascript
function getProjectActivity() {
  const activity = AuditService.getEntityHistory('Projects', { limit: 20 });
  activity.forEach(entry => {
    Logger.log(`${entry.timestamp}: ${entry.action} by ${entry.userEmail}`);
  });
}
```

### Custom Validation

To add custom validation rules, edit ValidationService.gs and add checks in the appropriate validate function (validateProject, validateTask, or validateResource).

## Support

If you encounter issues:

1. Check execution logs (Apps Script → Executions)
2. Review error messages - they're descriptive
3. Verify Phase 1 is still working
4. Check that all files are saved
5. Refresh the Google Sheet

Remember: Validation errors are **expected** for invalid data - that's the system working correctly!
