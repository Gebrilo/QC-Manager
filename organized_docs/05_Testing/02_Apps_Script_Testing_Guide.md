# Complete Testing Guide - QC Scenario Planning System

## Overview

This guide will walk you through testing all 3 phases of the QC Scenario Planning system.

---

## Pre-Test Checklist

Before starting, ensure:

- [ ] You have a Google Account
- [ ] You've created a Google Sheet named "QC_Scenario_Planning"
- [ ] You've copied your Excel data to Google Sheets (5 sheets: Assumptions, Projects, Tasks, Resources, Dashboard)
- [ ] All Apps Script files are uploaded:
  - Config.gs
  - UuidService.gs
  - DataService.gs
  - ValidationService.gs
  - AuditService.gs
  - UiService.gs
  - Code.gs
  - Index.html
  - Styles.html
  - Scripts.html

---

## Part 1: Initial Setup & Phase 1 Testing

### Step 1: Open Apps Script

1. Open your Google Sheet
2. Go to **Extensions** → **Apps Script**
3. Verify all 10 files are present in the left sidebar

### Step 2: Initialize the Sheet

1. **Close Apps Script editor**
2. **Refresh the Google Sheet** (F5)
3. Wait 10-20 seconds for the menu to appear
4. You should see **"QC Scenario Planning"** menu in the menu bar

**If menu doesn't appear:**
- Refresh again and wait longer
- Check Apps Script editor for any syntax errors (red underlines)
- Save all files in Apps Script

5. Click **QC Scenario Planning** → **Initialize Sheet (First Time)**
6. **Grant permissions when prompted:**
   - Click "Review permissions"
   - Choose your Google account
   - Click "Advanced"
   - Click "Go to QC Scenario Planning (unsafe)"
   - Click "Allow"

7. Wait for initialization to complete (~10-30 seconds)

### Step 3: Verify Initialization

Check these sheets:

**Projects Sheet:**
- Column A should be hidden (UUID column)
- If you had existing projects, they should have UUIDs

**Tasks Sheet:**
- Column A should be hidden (UUID column)
- Existing tasks should have UUIDs

**Resources Sheet:**
- Column A should be hidden (UUID column)
- Existing resources should have UUIDs

**AUDIT_LOG Sheet:**
- New sheet should exist
- Has headers: Timestamp, Action, Entity, Record UUID, User Email, Before State, After State, Field Changes

**✅ If all above are correct, Phase 1 initialization successful!**

### Step 4: Test Phase 1 CRUD Operations

1. Click **QC Scenario Planning** → **Run Phase 1 Tests**

2. Go to **Extensions** → **Apps Script** → **Executions** (in left sidebar)

3. Click the most recent execution

4. Review the log output

**Expected Output:**
```
========================================
RUNNING ALL PHASE 1 TESTS
========================================
=== Testing Display ID Generation ===
Next Project ID: PRJ-XXX
Next Task ID: TSK-XXX

=== Testing Project Creation ===
Project created successfully!
UUID: [some-uuid]
...

========================================
ALL TESTS PASSED!
========================================
```

**✅ If you see "ALL TESTS PASSED!", Phase 1 is working!**

**❌ If tests fail:**
- Read the error message in the log
- Check that sheet names match exactly: "Projects", "Tasks", "Resources"
- Verify formulas in Projects sheet columns E-K haven't been overwritten

---

## Part 2: Phase 2 Testing (Validation & Audit)

### Step 1: Test Validation

1. Click **QC Scenario Planning** → **Run Phase 2 Tests**

2. Check **Executions** log again

**Expected Output:**
```
========================================
RUNNING ALL PHASE 2 TESTS
========================================

=== Testing Validation - Invalid Project ===
✓ Validation correctly rejected invalid project ID
Error message: Validation failed:
Project ID must match format: PRJ-XXX (e.g., PRJ-001)

=== Testing Validation - Duplicate Project ID ===
✓ Validation correctly rejected duplicate project ID
...

========================================
ALL PHASE 2 TESTS PASSED!
========================================
```

**✅ If you see "ALL PHASE 2 TESTS PASSED!", validation is working!**

### Step 2: Check Audit Log

1. Open the **AUDIT_LOG** sheet
2. You should see multiple entries from the tests
3. Verify entries have:
   - Recent timestamps
   - Actions: CREATE, UPDATE
   - Entities: Projects, Tasks
   - Your email address
   - JSON in Before/After State columns

**✅ If audit log has entries, Phase 2 is working!**

---

## Part 3: Phase 3 Testing (Web App)

### Step 1: Deploy Web App

1. In Apps Script editor, click **Deploy** → **New deployment**

2. Click **Select type** → **Web app**

3. Fill in:
   - **Description:** QC Scenario Planning Web App
   - **Execute as:** Me (your-email@domain.com)
   - **Who has access:** Anyone with Google account

4. Click **Deploy**

5. Click **Authorize access** (grant permissions again if prompted)

6. **Copy the Web App URL** (looks like: https://script.google.com/macros/s/...../exec)

7. Click **Done**

### Step 2: Open the Web App

**Method 1:** Direct URL
1. Paste the Web App URL in a new browser tab
2. Press Enter

**Method 2:** From Google Sheets
1. Go back to your Google Sheet
2. Click **QC Scenario Planning** → **Open Web App**
3. The web app should open in a new tab

### Step 3: Verify Dashboard Loads

The web app should display:

**✅ Checklist:**
- [ ] Header with "QC Scenario Planning" title
- [ ] "New Project" and "New Task" buttons
- [ ] "Refresh" button
- [ ] 6 metric cards showing numbers (Total Projects, Total Tasks, etc.)
- [ ] Tabs: Projects, Tasks, Resources, Recent Activity
- [ ] Projects table with your existing projects
- [ ] Data appears in the table (not just "No projects found")

**❌ If you see a blank page or errors:**
- Check browser console (F12 → Console tab)
- Look for JavaScript errors
- Verify all HTML files (Index, Styles, Scripts) are saved in Apps Script
- Try refreshing the page (F5)

### Step 4: Test Creating a Project

1. Click **"New Project"** button

2. A modal should appear with a form

3. Fill in the form:
   - **Project ID:** PRJ-TEST-WEB
   - **Project Name:** Test Web Project
   - **Total Weight:** 3
   - **Priority:** High
   - **Start Date:** 2025-01-15
   - **Target Date:** 2025-03-30

4. Click **"Create Project"**

**Expected:**
- Green success message: "Project PRJ-TEST-WEB created successfully"
- Modal closes
- Dashboard refreshes
- New project appears in the Projects table

**✅ If project appears in table, web app CREATE is working!**

5. **Verify in Google Sheet:**
   - Open the Projects sheet
   - Scroll to the bottom
   - You should see PRJ-TEST-WEB in the list
   - Formulas in columns E-K should be working (showing 0s since no tasks yet)

### Step 5: Test Editing a Project

1. In the web app, find PRJ-TEST-WEB in the Projects table

2. Click the **"Edit"** button

3. Modal should open with the form pre-filled

4. Change:
   - **Priority:** High → Critical
   - **Total Weight:** 3 → 5

5. Click **"Update Project"**

**Expected:**
- Success message: "Project updated successfully"
- Table refreshes
- Priority badge shows "Critical"

**✅ If changes appear, web app UPDATE is working!**

6. **Verify in AUDIT_LOG sheet:**
   - Should have a new entry
   - Action: UPDATE
   - Entity: Projects
   - Field Changes: Shows priority and totalWeight changes

### Step 6: Test Creating a Task

1. Click **"New Task"** button

2. Fill in the form:
   - **Task ID:** TSK-TEST-WEB
   - **Project:** Select "PRJ-TEST-WEB - Test Web Project"
   - **Task Name:** Test Web Task
   - **Status:** Backlog
   - **Estimate (days):** 3
   - **Resource 1:** Select one (e.g., Basel)
   - **R1 Est Hours:** 24
   - **R1 Actual Hours:** 0
   - **Deadline:** 2025-02-15

3. Click **"Create Task"**

**Expected:**
- Success message: "Task TSK-TEST-WEB created successfully"
- Task appears in Tasks table
- Switch to Projects tab → PRJ-TEST-WEB should now show:
  - Task Hrs Est: 24.00
  - Tasks Total: 1
  - Status: "At Risk" (since 0% complete)

**✅ If task appears and project updates, formulas are working!**

4. **Verify in Google Sheet:**
   - Tasks sheet should have TSK-TEST-WEB
   - Column N (Total Est Hrs) should show 24 (formula working!)
   - Projects sheet → PRJ-TEST-WEB row:
     - Column E (Task Hrs Est): 24 (SUMIF formula working!)
     - Column J (Tasks Total): 1 (COUNTIF formula working!)

### Step 7: Test Editing a Task (Status Change)

1. In Tasks table, find TSK-TEST-WEB

2. Click **"Edit"**

3. Change:
   - **Status:** Backlog → In Progress
   - **R1 Actual Hours:** 0 → 8

4. Click **"Update Task"**

**Expected:**
- Task status badge changes to "In Progress" (blue)
- Actual Hours shows 8.00
- Projects tab → PRJ-TEST-WEB:
  - Task Hrs Actual: 8.00
  - Completion: 33.3%

**✅ If status changes and hours update, validation passed!**

### Step 8: Test Invalid Data (Validation)

**Test Invalid Status Transition:**

1. Edit TSK-TEST-WEB again

2. Change **Status:** In Progress → Done

3. Click **"Update Task"**

**Expected:**
- **Red error message:** "Validation failed: Completed Date is required when Status is Done"
- Modal stays open
- Changes NOT saved

**✅ If error appears and data not saved, validation is working!**

4. Fix it:
   - Add **Completed Date:** Today's date
   - Change **R1 Actual Hours:** 24
   - Click **"Update Task"**

**Expected:**
- Success message
- Status changes to "Done" (green)
- Projects tab → PRJ-TEST-WEB:
  - Completion: 100%
  - Status: "Complete" (green badge)

**✅ If project shows 100% complete, formulas are calculating correctly!**

### Step 9: Test Activity Feed

1. Click the **"Recent Activity"** tab

2. You should see a list of recent changes:
   - CREATE Projects
   - UPDATE Projects
   - CREATE Tasks
   - UPDATE Tasks
   - User email
   - Timestamps
   - Change descriptions

**✅ If activity appears, audit log integration working!**

### Step 10: Test Task Filtering

1. Go to **Tasks** tab

2. Use the **"Filter by Status"** dropdown

3. Select **"Done"**

**Expected:**
- Table filters to show only Done tasks
- Should see TSK-TEST-WEB

4. Select **"Backlog"**
- Table should update to show only Backlog tasks

**✅ If filtering works, client-side filtering working!**

### Step 11: Test Resources Tab

1. Click **"Resources"** tab

2. You should see your resources with:
   - Weekly Capacity (40.00)
   - Current Allocation (should show hours from tasks)
   - Utilization % (color-coded)
   - Available Hours

3. Find the resource you assigned (e.g., Basel)
   - Current Allocation should show 24.00 (if task is Done, might show 0)
   - Utilization should be calculated

**✅ If resources show data, resource tracking is working!**

---

## Part 4: Stress Testing

### Test 1: Create Multiple Projects

Create 3 more projects:
- PRJ-101 (Medium priority)
- PRJ-102 (High priority)
- PRJ-103 (Critical priority)

**Verify:**
- All appear in table
- All have UUIDs in Google Sheet
- All have audit log entries

### Test 2: Create Multiple Tasks

Create 5 tasks across different projects:
- 2 tasks for PRJ-101
- 2 tasks for PRJ-102
- 1 task for PRJ-103

**Verify:**
- All tasks link to correct projects
- Project metrics update correctly
- Resource allocations update
- Formulas still calculate

### Test 3: Test Invalid Data

Try to create:
- Project with ID: "INVALID" (should fail - wrong format)
- Task with Project ID: "PRJ-999" (should fail - project doesn't exist)
- Task with negative hours (should fail - hours must be ≥ 0)

**Verify:**
- All show error messages
- Data NOT saved
- Audit log doesn't have failed attempts

---

## Part 5: Formula Verification

### Test Project Formulas

Open Projects sheet, verify formulas are working:

1. Find PRJ-TEST-WEB row
2. Check columns:
   - **E (Task Hrs Est):** Should match sum of all task estimated hours
   - **F (Task Hrs Actual):** Should match sum of all task actual hours
   - **G (Task Hrs Done):** Should match hours from Done tasks only
   - **H (Completion %):** Should be (Done hours / Est hours)
   - **I (Tasks Done):** Should count Done tasks
   - **J (Tasks Total):** Should count all tasks
   - **K (Status):** Should show "Complete", "On Track", or "At Risk"

**✅ If all formulas show correct values, Phase 1 formula preservation working!**

### Test Task Formulas

Open Tasks sheet, find TSK-TEST-WEB:

1. Check columns:
   - **G (Estimate hours):** Should be (days × 8)
   - **N (Total Est Hrs):** Should be (R1 Est + R2 Est)
   - **O (Total Actual Hrs):** Should be (R1 Actual + R2 Actual)
   - **P (R1 Completion %):** Should be (R1 Actual / R1 Est)
   - **R (Hours Variance):** Should be (Total Actual - Total Est)
   - **T (Overall Completion %):** Should be (Total Actual / Total Est)

**✅ If all formulas calculate correctly, task formulas working!**

---

## Part 6: Dashboard Sheet Verification

Open the Dashboard sheet (if you have it from Excel):

1. Verify sections still work:
   - Resource Utilization Table (pulls from Resources)
   - Project Portfolio Table (pulls from Projects)
   - Task Status Summary (counts by status)
   - Summary Metrics (totals)

2. If you have charts in Dashboard:
   - They should update automatically
   - Data should match web app

**✅ If Dashboard still works, Excel compatibility maintained!**

---

## Troubleshooting Common Issues

### Issue: Web app shows "Script function not found"

**Solution:**
1. Open Apps Script editor
2. Ensure all functions in Code.gs are saved
3. Check for typos in function names
4. **Redeploy the web app:**
   - Deploy → Manage deployments
   - Click edit icon (pencil)
   - Click "Deploy"

### Issue: Formulas show #REF! errors

**Solution:**
1. Check sheet names are exact: "Projects", "Tasks", "Resources"
2. Verify UUID columns weren't deleted
3. Check formula ranges (should be $B$4:$B$100, not smaller)
4. Re-run initialization if needed

### Issue: Validation not working (accepts invalid data)

**Solution:**
1. Check ValidationService.gs is loaded
2. Verify DataService.gs has validation calls
3. Check browser console for JavaScript errors
4. Test from Google Sheets directly (Phase 2 tests)

### Issue: Audit log not recording

**Solution:**
1. Check AUDIT_LOG sheet exists
2. Verify AuditService.gs is loaded
3. Audit logging failures don't break main operations (check execution log)

### Issue: Web app loads slowly

**Solution:**
- Normal on first load (10-20 seconds)
- Subsequent loads should be faster
- If very slow, check if you have 100+ tasks (consider pagination)

---

## Final Verification Checklist

Go through this checklist to confirm everything works:

### Phase 1: Core Infrastructure
- [ ] UUID columns exist and hidden
- [ ] Can create projects via script
- [ ] Can create tasks via script
- [ ] Can read records by UUID
- [ ] Can update records by UUID
- [ ] Formulas calculate correctly
- [ ] Phase 1 tests pass

### Phase 2: Validation & Audit
- [ ] Invalid project IDs rejected
- [ ] Duplicate IDs rejected
- [ ] Foreign keys validated
- [ ] Status transitions enforced
- [ ] Every change logged to AUDIT_LOG
- [ ] Audit log has before/after states
- [ ] Phase 2 tests pass

### Phase 3: Web App
- [ ] Web app URL accessible
- [ ] Dashboard loads with data
- [ ] Metrics display correctly
- [ ] Can create projects via web app
- [ ] Can edit projects via web app
- [ ] Can create tasks via web app
- [ ] Can edit tasks via web app
- [ ] Validation works in web app
- [ ] Formulas still calculate
- [ ] Activity feed shows changes
- [ ] All tabs work (Projects/Tasks/Resources/Activity)
- [ ] Filtering works
- [ ] Success/error messages display

### Integration Tests
- [ ] Creating task updates project metrics
- [ ] Updating task hours updates project completion
- [ ] Changing task status updates project status
- [ ] Resource allocation updates when tasks change
- [ ] Dashboard sheet (if exists) still works
- [ ] Can switch between web app and Google Sheets seamlessly

---

## Success! 🎉

If you've completed all tests above and everything works:

**Congratulations!** Your QC Scenario Planning system is fully operational!

You have:
- ✅ A UUID-based data system
- ✅ Comprehensive validation
- ✅ Complete audit trail
- ✅ Modern web interface
- ✅ Real-time dashboard
- ✅ Formula preservation
- ✅ ~5,000 lines of production code

Your system is ready for your team to use!

---

## Next Steps

**For Production Use:**
1. Share the Web App URL with your team
2. Set up user permissions in deployment settings
3. Add more projects and tasks
4. Monitor the audit log for compliance
5. Consider Phase 4 (Reports & Charts) if needed

**For Development:**
1. Customize the UI colors/branding
2. Add more validation rules if needed
3. Create custom reports
4. Add email notifications (optional)
5. Implement Phase 4 & 5 features

---

## Support

If you encounter issues not covered in this guide:
1. Check the execution log (Apps Script → Executions)
2. Check browser console (F12 → Console)
3. Review error messages carefully - they're descriptive
4. Verify all 10 files are saved in Apps Script
5. Try redeploying the web app

**Remember:** The system is designed to be robust. Most issues are due to:
- Missing files
- Permission issues
- Typos in sheet names
- Not saving files in Apps Script

Good luck testing! 🚀
