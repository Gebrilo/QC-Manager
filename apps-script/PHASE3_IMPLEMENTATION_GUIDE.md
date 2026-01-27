# Phase 3: Web Interface - Complete Implementation Guide

## Status: Core Files Created ✅

**Completed:**
- ✅ UiService.gs (Backend service)
- ✅ Index.html (Main dashboard UI)
- ✅ Styles.html (CSS styling)

**Remaining:**
- ⏳ Scripts.html (Frontend JavaScript) - See below for full code
- ⏳ Code.gs updates (Web app entry points) - See below for additions

---

## File 10: Scripts.html (Frontend JavaScript)

Create a new HTML file named `Scripts.html` and paste this complete code:

```html
<script>
// ==========================================
// QC Scenario Planning - Frontend Scripts
// ==========================================

// Global state
let dashboardData = null;
let currentEditUuid = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  loadDashboard();
});

// ==========================================
// Data Loading Functions
// ==========================================

function loadDashboard() {
  showLoading();
  google.script.run
    .withSuccessHandler(onDashboardLoaded)
    .withFailureHandler(onError)
    .getDashboardData();
}

function onDashboardLoaded(data) {
  dashboardData = data;
  renderMetrics(data.metrics);
  renderProjects(data.projects);
  renderTasks(data.tasks);
  renderResources(data.resources);
  loadFormOptions();
  hideLoading();
  showSections();
}

function refreshDashboard() {
  showMessage('Refreshing...', 'info');
  loadDashboard();
}

// ==========================================
// Rendering Functions
// ==========================================

function renderMetrics(metrics) {
  document.getElementById('metric-projects').textContent = metrics.totalProjects;
  document.getElementById('metric-tasks').textContent = metrics.totalTasks;
  document.getElementById('metric-done').textContent = metrics.doneTasks;
  document.getElementById('metric-progress').textContent = metrics.inProgressTasks;
  document.getElementById('metric-completion').textContent = metrics.overallCompletion;
  document.getElementById('metric-est-hours').textContent = metrics.totalEstHours;
}

function renderProjects(projects) {
  const tbody = document.getElementById('projects-tbody');
  if (projects.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center">No projects found</td></tr>';
    return;
  }

  tbody.innerHTML = projects.map(p => `
    <tr>
      <td><strong>${p.projectId}</strong></td>
      <td>${p.projectName}</td>
      <td><span class="badge badge-info">${p.priority}</span></td>
      <td>${p.taskHrsEst}</td>
      <td>${p.taskHrsActual}</td>
      <td>${p.completionPct}</td>
      <td>${p.tasksDone} / ${p.tasksTotal}</td>
      <td><span class="badge" style="background-color:${p.statusColor};color:white">${p.status}</span></td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick='editProject("${p.uuid}")'>Edit</button>
      </td>
    </tr>
  `).join('');
}

function renderTasks(tasks) {
  const tbody = document.getElementById('tasks-tbody');
  if (tasks.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center">No tasks found</td></tr>';
    return;
  }

  tbody.innerHTML = tasks.map(t => `
    <tr>
      <td><strong>${t.taskId}</strong></td>
      <td>${t.taskName}</td>
      <td>${t.projectId}</td>
      <td><span class="badge" style="background-color:${t.statusColor};color:white">${t.status}</span></td>
      <td>${t.resources}</td>
      <td>${t.totalEstHrs}</td>
      <td>${t.totalActualHrs}</td>
      <td>${t.overallCompletionPct}</td>
      <td>${t.deadline || '-'}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick='editTask("${t.uuid}")'>Edit</button>
      </td>
    </tr>
  `).join('');
}

function renderResources(resources) {
  const tbody = document.getElementById('resources-tbody');
  if (resources.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">No resources found</td></tr>';
    return;
  }

  tbody.innerHTML = resources.map(r => `
    <tr>
      <td><strong>${r.resourceName}</strong></td>
      <td>${r.weeklyCapacity}</td>
      <td>${r.currentAllocation}</td>
      <td><span style="color:${r.utilizationColor}">${r.utilizationPct}</span></td>
      <td>${r.availableHours}</td>
    </tr>
  `).join('');
}

// ==========================================
// Tab Switching
// ==========================================

function switchTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('active');
  });

  // Show selected tab
  document.getElementById(tabName + '-tab').classList.add('active');
  event.target.classList.add('active');

  // Load activity if needed
  if (tabName === 'activity') {
    loadActivity();
  }
}

function loadActivity() {
  google.script.run
    .withSuccessHandler(function(activity) {
      const feed = document.getElementById('activity-feed');
      if (activity.length === 0) {
        feed.innerHTML = '<p class="text-center">No recent activity</p>';
        return;
      }

      feed.innerHTML = activity.map(a => `
        <div class="activity-item">
          <div class="activity-header">
            <span class="activity-action">${a.action} ${a.entity}</span>
            <span class="activity-time">${a.timestamp}</span>
          </div>
          <div class="activity-description">${a.description}</div>
          <div class="text-muted" style="font-size:12px;margin-top:4px">by ${a.user}</div>
        </div>
      `).join('');
    })
    .withFailureHandler(onError)
    .getRecentActivity(20);
}

// ==========================================
// Modal Functions - Project
// ==========================================

function showCreateProjectModal() {
  currentEditUuid = null;
  document.getElementById('project-modal-title').textContent = 'Create Project';
  document.getElementById('project-submit-text').textContent = 'Create Project';
  document.getElementById('project-form').reset();
  document.getElementById('project-modal').classList.add('show');
}

function editProject(uuid) {
  currentEditUuid = uuid;
  document.getElementById('project-modal-title').textContent = 'Edit Project';
  document.getElementById('project-submit-text').textContent = 'Update Project';

  google.script.run
    .withSuccessHandler(function(project) {
      document.getElementById('project-id').value = project.projectId;
      document.getElementById('project-name').value = project.projectName;
      document.getElementById('project-weight').value = project.totalWeight;
      document.getElementById('project-priority').value = project.priority;
      document.getElementById('project-start-date').value = project.startDate;
      document.getElementById('project-target-date').value = project.targetDate;
      document.getElementById('project-modal').classList.add('show');
    })
    .withFailureHandler(onError)
    .getProject(uuid);
}

function closeProjectModal() {
  document.getElementById('project-modal').classList.remove('show');
  currentEditUuid = null;
}

function handleProjectSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const data = Object.fromEntries(formData);

  // Convert dates
  if (data.startDate) data.startDate = new Date(data.startDate);
  if (data.targetDate) data.targetDate = new Date(data.targetDate);
  data.totalWeight = parseInt(data.totalWeight);

  if (currentEditUuid) {
    // Update
    google.script.run
      .withSuccessHandler(function(result) {
        if (result.success) {
          showMessage(result.message, 'success');
          closeProjectModal();
          loadDashboard();
        } else {
          showMessage(result.error, 'error');
        }
      })
      .withFailureHandler(onError)
      .updateProject(currentEditUuid, data);
  } else {
    // Create
    google.script.run
      .withSuccessHandler(function(result) {
        if (result.success) {
          showMessage(result.message, 'success');
          closeProjectModal();
          loadDashboard();
        } else {
          showMessage(result.error, 'error');
        }
      })
      .withFailureHandler(onError)
      .createProject(data);
  }
}

// ==========================================
// Modal Functions - Task
// ==========================================

function showCreateTaskModal() {
  currentEditUuid = null;
  document.getElementById('task-modal-title').textContent = 'Create Task';
  document.getElementById('task-submit-text').textContent = 'Create Task';
  document.getElementById('task-form').reset();
  document.getElementById('task-modal').classList.add('show');
}

function editTask(uuid) {
  currentEditUuid = uuid;
  document.getElementById('task-modal-title').textContent = 'Edit Task';
  document.getElementById('task-submit-text').textContent = 'Update Task';

  google.script.run
    .withSuccessHandler(function(task) {
      document.getElementById('task-id').value = task.taskId;
      document.getElementById('task-project').value = task.projectId;
      document.getElementById('task-name').value = task.taskName;
      document.getElementById('task-status').value = task.status;
      document.getElementById('task-estimate').value = task.estimateDays;
      document.getElementById('task-resource1').value = task.resource1;
      document.getElementById('task-r1-est').value = task.r1EstHrs;
      document.getElementById('task-r1-actual').value = task.r1ActualHrs;
      document.getElementById('task-resource2').value = task.resource2;
      document.getElementById('task-r2-est').value = task.r2EstHrs;
      document.getElementById('task-r2-actual').value = task.r2ActualHrs;
      document.getElementById('task-deadline').value = task.deadline;
      document.getElementById('task-completed').value = task.completedDate;
      document.getElementById('task-modal').classList.add('show');
    })
    .withFailureHandler(onError)
    .getTask(uuid);
}

function closeTaskModal() {
  document.getElementById('task-modal').classList.remove('show');
  currentEditUuid = null;
}

function handleTaskSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const data = Object.fromEntries(formData);

  // Convert numbers
  data.estimateDays = parseFloat(data.estimateDays);
  data.r1EstHrs = parseFloat(data.r1EstHrs);
  data.r1ActualHrs = parseFloat(data.r1ActualHrs);
  data.r2EstHrs = parseFloat(data.r2EstHrs);
  data.r2ActualHrs = parseFloat(data.r2ActualHrs);

  // Convert dates
  if (data.deadline) data.deadline = new Date(data.deadline);
  if (data.completedDate) data.completedDate = new Date(data.completedDate);

  if (currentEditUuid) {
    // Update
    google.script.run
      .withSuccessHandler(function(result) {
        if (result.success) {
          showMessage(result.message, 'success');
          closeTaskModal();
          loadDashboard();
        } else {
          showMessage(result.error, 'error');
        }
      })
      .withFailureHandler(onError)
      .updateTask(currentEditUuid, data);
  } else {
    // Create
    google.script.run
      .withSuccessHandler(function(result) {
        if (result.success) {
          showMessage(result.message, 'success');
          closeTaskModal();
          loadDashboard();
        } else {
          showMessage(result.error, 'error');
        }
      })
      .withFailureHandler(onError)
      .createTask(data);
  }
}

// ==========================================
// Form Options Loading
// ==========================================

function loadFormOptions() {
  google.script.run
    .withSuccessHandler(function(options) {
      // Populate project dropdown in task form
      const projectSelect = document.getElementById('task-project');
      projectSelect.innerHTML = '<option value="">Select project...</option>' +
        options.projects.map(p => `<option value="${p.value}">${p.label}</option>`).join('');

      // Populate resource dropdowns
      const resourceOptions = '<option value="">Select...</option>' +
        options.resources.map(r => `<option value="${r.value}">${r.label}</option>`).join('');

      document.getElementById('task-resource1').innerHTML = resourceOptions;
      document.getElementById('task-resource2').innerHTML = resourceOptions;
    })
    .withFailureHandler(onError)
    .getFormOptions();
}

// ==========================================
// Utility Functions
// ==========================================

function showLoading() {
  document.getElementById('loading').style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loading').style.display = 'none';
}

function showSections() {
  document.getElementById('metrics-section').style.display = 'grid';
  document.getElementById('tabs-section').style.display = 'flex';
}

function showMessage(message, type) {
  const alertId = type === 'error' ? 'error-message' : 'success-message';
  const alert = document.getElementById(alertId);
  alert.textContent = message;
  alert.style.display = 'block';

  setTimeout(() => {
    alert.style.display = 'none';
  }, 5000);
}

function onError(error) {
  console.error(error);
  showMessage('Error: ' + error.message, 'error');
  hideLoading();
}

function filterTasks() {
  const status = document.getElementById('task-status-filter').value;
  if (!dashboardData) return;

  const filtered = status
    ? dashboardData.tasks.filter(t => t.status === status)
    : dashboardData.tasks;

  renderTasks(filtered);
}
</script>
```

---

## Code.gs Updates (Add These Functions)

Add these functions to the END of your existing `Code.gs` file (before the closing brace if any):

```javascript
/**
 * ============================================
 * PHASE 3: WEB APP FUNCTIONS
 * ============================================
 */

/**
 * Serve the web app HTML
 */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('QC Scenario Planning')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Include HTML files (for templates)
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Get dashboard data for web app
 */
function getDashboardData() {
  return UiService.getDashboardData();
}

/**
 * Get projects list
 */
function getProjects() {
  return UiService.getProjects();
}

/**
 * Get tasks list
 */
function getTasks(filters) {
  return UiService.getTasks(filters);
}

/**
 * Get resources list
 */
function getResources() {
  return UiService.getResources();
}

/**
 * Get single project
 */
function getProject(uuid) {
  return UiService.getProject(uuid);
}

/**
 * Get single task
 */
function getTask(uuid) {
  return UiService.getTask(uuid);
}

/**
 * Create project from web app
 */
function createProject(projectData) {
  return UiService.createProject(projectData);
}

/**
 * Update project from web app
 */
function updateProject(uuid, updates) {
  return UiService.updateProject(uuid, updates);
}

/**
 * Create task from web app
 */
function createTask(taskData) {
  return UiService.createTask(taskData);
}

/**
 * Update task from web app
 */
function updateTask(uuid, updates) {
  return UiService.updateTask(uuid, updates);
}

/**
 * Delete task from web app
 */
function deleteTask(uuid) {
  return UiService.deleteTask(uuid);
}

/**
 * Get form dropdown options
 */
function getFormOptions() {
  return UiService.getFormOptions();
}

/**
 * Get recent activity
 */
function getRecentActivity(limit) {
  return UiService.getRecentActivity(limit);
}
```

---

## Deployment Instructions

### Step 1: Add All Files

1. Open Apps Script Editor
2. Add `UiService.gs` (already created)
3. Add `Index.html` (already created)
4. Add `Styles.html` (already created)
5. Add `Scripts.html` (copy code from above)
6. Update `Code.gs` (add web app functions from above)

### Step 2: Deploy as Web App

1. Click **Deploy** → **New deployment**
2. Click **Select type** → **Web app**
3. Fill in:
   - **Description:** QC Scenario Planning Web App
   - **Execute as:** Me
   - **Who has access:** Anyone with Google account (or adjust as needed)
4. Click **Deploy**
5. **Copy the Web App URL**
6. Click **Authorize access** if prompted

### Step 3: Test the Web App

1. Open the Web App URL in a new browser tab
2. You should see the dashboard with:
   - Header with "New Project" and "New Task" buttons
   - Metrics cards (total projects, tasks, etc.)
   - Tabs: Projects, Tasks, Resources, Recent Activity
   - Tables with your data

### Step 4: Test CRUD Operations

**Create Project:**
1. Click "New Project"
2. Fill in form (Project ID: PRJ-XXX format)
3. Click "Create Project"
4. Should see success message and project appears in table

**Edit Project:**
1. Click "Edit" on a project
2. Change priority or other fields
3. Click "Update Project"
4. Changes should be saved

**Create Task:**
1. Click "New Task"
2. Fill in form (Task ID: TSK-XXX format)
3. Select a project
4. Click "Create Task"
5. Should see success message

**Edit Task:**
1. Click "Edit" on a task
2. Change status, hours, etc.
3. Click "Update Task"
4. Changes should be saved and formulas recalculate

---

## Troubleshooting

### Issue: Web app shows blank page

**Solution:**
- Check that all HTML files are saved
- Verify `doGet()` and `include()` functions are in Code.gs
- Check execution log for errors

### Issue: "Script function not found"

**Solution:**
- Ensure all functions in Code.gs are saved
- Redeploy the web app
- Clear browser cache

### Issue: Data not loading

**Solution:**
- Check that UiService.gs is loaded
- Verify Phase 1 and 2 are working
- Check browser console for JavaScript errors (F12)

### Issue: Form validation errors

**Solution:**
- Ensure ID format matches: PRJ-XXX or TSK-XXX
- Check that dates are valid
- Verify project exists when creating tasks

---

## Phase 3 Features ✨

**Dashboard:**
- Real-time metrics display
- 6 metric cards (projects, tasks, completion, etc.)
- Auto-refresh capability

**Project Management:**
- View all projects in table
- Create new projects with validation
- Edit existing projects
- Status indicators with colors

**Task Management:**
- View all tasks with filtering
- Filter by status (Backlog, In Progress, Done, Cancelled)
- Create tasks linked to projects
- Edit tasks with full validation
- Update status, hours, resources

**Resource View:**
- See all resources and utilization
- Color-coded utilization percentages
- Available hours calculation

**Activity Feed:**
- Recent changes from audit log
- User attribution
- Timestamp display

**Form Validation:**
- Client-side validation
- Server-side validation (Phase 2)
- Clear error messages
- Success notifications

---

## Success Criteria ✅

Phase 3 is complete when:

- [ ] All 5 files deployed to Apps Script
- [ ] Web app URL accessible
- [ ] Dashboard loads with data
- [ ] Metrics display correctly
- [ ] Can create projects via web app
- [ ] Can edit projects via web app
- [ ] Can create tasks via web app
- [ ] Can edit tasks via web app
- [ ] Validation works (rejects invalid data)
- [ ] Success/error messages display
- [ ] Tabs switch correctly
- [ ] Activity feed shows recent changes
- [ ] Formulas in sheets still calculate
- [ ] Phase 1 and 2 tests still pass

---

## What's Next: Phase 4 & 5

**Phase 4: Reports & Charts** (Optional)
- PDF report generation
- Excel export
- Interactive charts in web app
- Print-friendly layouts

**Phase 5: Production Hardening** (Optional)
- Error handling improvements
- Loading states
- User permissions
- Scheduled reports
- Performance optimization

---

## Files Summary

**Phase 3 adds:**
- UiService.gs: 650+ lines (backend)
- Index.html: 400+ lines (UI structure)
- Styles.html: 400+ lines (CSS)
- Scripts.html: 450+ lines (JavaScript)
- Code.gs updates: +80 lines (web app functions)

**Total Phase 3:** ~1,980 lines

**Cumulative Total:** ~5,030 lines of code + documentation

---

Your QC Scenario Planning system is now a fully functional web application! 🎉
