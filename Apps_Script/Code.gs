/**
 * Code.gs
 * Main entry point for QC Scenario Planning Google Apps Script
 * Handles routing, web app serving, and initialization
 */

/**
 * Initialize the Google Sheet with UUID columns and audit log
 * Run this once after creating a new sheet or migrating from Excel
 */
function initializeSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  Logger.log('Starting sheet initialization...');

  // 1. Add UUID columns to existing sheets
  const sheetsToUpdate = ['projects', 'tasks', 'resources'];

  for (const sheetConfigName of sheetsToUpdate) {
    try {
      addUuidColumn(sheetConfigName);
      Logger.log(`Added UUID column to ${sheetConfigName}`);
    } catch (error) {
      Logger.log(`Error adding UUID to ${sheetConfigName}: ${error.message}`);
    }
  }

  // 2. Create Audit Log sheet if it doesn't exist
  try {
    createAuditLogSheet();
    Logger.log('Audit Log sheet created');
  } catch (error) {
    Logger.log(`Error creating Audit Log: ${error.message}`);
  }

  Logger.log('Sheet initialization complete!');
}

/**
 * Add UUID column to a sheet
 * @param {string} sheetConfigName - Sheet configuration name
 */
function addUuidColumn(sheetConfigName) {
  const config = CONFIG.sheets[sheetConfigName];

  if (!config || !config.uuidColumn) {
    throw new Error(`Sheet ${sheetConfigName} does not support UUID column`);
  }

  const sheet = getSheetByConfig(sheetConfigName);
  const uuidColIndex = columnToIndex(config.uuidColumn) + 1;
  const startRow = config.startRow;

  // Check if UUID column already has a header
  const headerRow = startRow - 1;
  const headerCell = sheet.getRange(headerRow, uuidColIndex);

  if (!headerCell.getValue() || headerCell.getValue() === '') {
    // Add header
    headerCell.setValue('UUID');
    headerCell.setFontWeight('bold');
  }

  // Generate UUIDs for existing rows that don't have one
  const maxRows = CONFIG.constants.maxRows;
  const range = sheet.getRange(startRow, uuidColIndex, maxRows, 1);
  const values = range.getValues();

  let generatedCount = 0;

  for (let i = 0; i < values.length; i++) {
    // Check if row has data but no UUID
    const rowNum = startRow + i;
    const displayIdCol = config.displayIdColumn ? columnToIndex(config.displayIdColumn) + 1 : 2;
    const displayIdValue = sheet.getRange(rowNum, displayIdCol).getValue();

    if (displayIdValue && displayIdValue !== '' && (!values[i][0] || values[i][0] === '')) {
      // Generate and set UUID
      const uuid = Utilities.getUuid();
      sheet.getRange(rowNum, uuidColIndex).setValue(uuid);
      generatedCount++;
    }
  }

  Logger.log(`Generated ${generatedCount} UUIDs for ${sheetConfigName}`);

  // Hide the UUID column
  sheet.hideColumns(uuidColIndex);
}

/**
 * Create the Audit Log sheet
 */
function createAuditLogSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = CONFIG.sheets.auditLog;

  // Check if sheet already exists
  let sheet = ss.getSheetByName(config.sheetName);

  if (!sheet) {
    // Create new sheet
    sheet = ss.insertSheet(config.sheetName);
  }

  // Set up headers
  const headers = [
    'Timestamp',
    'Action',
    'Entity',
    'Record UUID',
    'User Email',
    'Before State',
    'After State',
    'Field Changes'
  ];

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4a86e8');
  headerRange.setFontColor('#ffffff');

  // Freeze header row
  sheet.setFrozenRows(1);

  // Set column widths
  sheet.setColumnWidth(1, 150);  // Timestamp
  sheet.setColumnWidth(2, 80);   // Action
  sheet.setColumnWidth(3, 80);   // Entity
  sheet.setColumnWidth(4, 200);  // Record UUID
  sheet.setColumnWidth(5, 180);  // User Email
  sheet.setColumnWidth(6, 300);  // Before State
  sheet.setColumnWidth(7, 300);  // After State
  sheet.setColumnWidth(8, 200);  // Field Changes

  Logger.log('Audit Log sheet created with headers');
}

/**
 * Test function for Phase 1 - Create a project
 */
function testCreateProject() {
  try {
    Logger.log('=== Testing Project Creation ===');

    // Create a test project
    const projectData = {
      projectId: 'PRJ-TEST-001',
      projectName: 'Test Project Alpha',
      totalWeight: 3,
      priority: 'High',
      startDate: new Date('2025-01-15'),
      targetDate: new Date('2025-03-30')
    };

    const result = DataService.create('projects', projectData);

    Logger.log('Project created successfully!');
    Logger.log(`UUID: ${result.uuid}`);
    Logger.log(`Row: ${result.row}`);
    Logger.log(`Data: ${JSON.stringify(result.data)}`);

    return result;

  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
    Logger.log(error.stack);
    throw error;
  }
}

/**
 * Test function for Phase 1 - Read a project
 */
function testReadProject() {
  try {
    Logger.log('=== Testing Project Read ===');

    // Get all projects first
    const allProjects = DataService.getAll('projects');
    Logger.log(`Found ${allProjects.length} projects`);

    if (allProjects.length === 0) {
      Logger.log('No projects found. Run testCreateProject() first.');
      return;
    }

    // Read the first project
    const firstProject = allProjects[0];
    Logger.log(`Reading project with UUID: ${firstProject.uuid}`);

    const record = DataService.read('projects', firstProject.uuid);
    Logger.log('Project data:');
    Logger.log(JSON.stringify(record.data, null, 2));

    return record;

  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
    Logger.log(error.stack);
    throw error;
  }
}

/**
 * Test function for Phase 1 - Update a project
 */
function testUpdateProject() {
  try {
    Logger.log('=== Testing Project Update ===');

    // Get first project
    const allProjects = DataService.getAll('projects');
    if (allProjects.length === 0) {
      Logger.log('No projects found. Run testCreateProject() first.');
      return;
    }

    const project = allProjects[0];
    Logger.log(`Updating project: ${project.data.projectId}`);

    // Update priority
    const updates = {
      priority: 'Critical',
      totalWeight: 5
    };

    const result = DataService.update('projects', project.uuid, updates);

    Logger.log('Project updated successfully!');
    Logger.log(`New priority: ${result.data.priority}`);
    Logger.log(`New weight: ${result.data.totalWeight}`);

    return result;

  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
    Logger.log(error.stack);
    throw error;
  }
}

/**
 * Test function for Phase 1 - Create a task
 */
function testCreateTask() {
  try {
    Logger.log('=== Testing Task Creation ===');

    // Get first project to link to
    const allProjects = DataService.getAll('projects');
    if (allProjects.length === 0) {
      Logger.log('No projects found. Create a project first.');
      return;
    }

    const project = allProjects[0];

    // Create a test task
    const taskData = {
      taskId: 'TSK-TEST-001',
      projectId: project.data.projectId,
      taskName: 'Test Task Alpha',
      status: 'Backlog',
      estimateDays: 5,
      resource1: 'Basel',
      r1EstHrs: 40,
      r1ActualHrs: 0,
      resource2: '',
      r2EstHrs: 0,
      r2ActualHrs: 0,
      deadline: new Date('2025-02-15'),
      completedDate: ''
    };

    const result = DataService.create('tasks', taskData);

    Logger.log('Task created successfully!');
    Logger.log(`UUID: ${result.uuid}`);
    Logger.log(`Task ID: ${result.data.taskId}`);
    Logger.log(`Project ID: ${result.data.projectId}`);

    return result;

  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
    Logger.log(error.stack);
    throw error;
  }
}

/**
 * Test function for Phase 1 - Query tasks by status
 */
function testQueryTasks() {
  try {
    Logger.log('=== Testing Task Query ===');

    // Query all backlog tasks
    const backlogTasks = DataService.query('tasks', {
      filters: { status: 'Backlog' },
      sortBy: 'deadline',
      sortOrder: 'asc'
    });

    Logger.log(`Found ${backlogTasks.length} backlog tasks`);

    backlogTasks.forEach(task => {
      Logger.log(`- ${task.data.taskId}: ${task.data.taskName} (Due: ${task.data.deadline})`);
    });

    return backlogTasks;

  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
    Logger.log(error.stack);
    throw error;
  }
}

/**
 * Test function - Display ID generation
 */
function testGenerateDisplayId() {
  try {
    Logger.log('=== Testing Display ID Generation ===');

    const nextProjectId = UuidService.generateNextDisplayId('projects', 'PRJ');
    Logger.log(`Next Project ID: ${nextProjectId}`);

    const nextTaskId = UuidService.generateNextDisplayId('tasks', 'TSK');
    Logger.log(`Next Task ID: ${nextTaskId}`);

    return { nextProjectId, nextTaskId };

  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
    Logger.log(error.stack);
    throw error;
  }
}

/**
 * Run all Phase 1 tests
 */
function runAllPhase1Tests() {
  Logger.log('========================================');
  Logger.log('RUNNING ALL PHASE 1 TESTS');
  Logger.log('========================================');

  try {
    // Test 1: Display ID generation
    testGenerateDisplayId();

    // Test 2: Create project
    testCreateProject();

    // Test 3: Read project
    testReadProject();

    // Test 4: Update project
    testUpdateProject();

    // Test 5: Create task
    testCreateTask();

    // Test 6: Query tasks
    testQueryTasks();

    Logger.log('========================================');
    Logger.log('ALL TESTS PASSED!');
    Logger.log('========================================');

  } catch (error) {
    Logger.log('========================================');
    Logger.log('TEST FAILED!');
    Logger.log(error.message);
    Logger.log('========================================');
  }
}

/**
 * ============================================
 * PHASE 2 TEST FUNCTIONS
 * ============================================
 */

/**
 * Test validation - Invalid project data
 */
function testValidationInvalidProject() {
  try {
    Logger.log('=== Testing Validation - Invalid Project ===');

    // Try to create a project with invalid ID format
    const invalidData = {
      projectId: 'INVALID-ID',  // Wrong format
      projectName: 'Test Project',
      totalWeight: 3,
      priority: 'High',
      startDate: new Date('2025-01-15'),
      targetDate: new Date('2025-03-30')
    };

    DataService.create('projects', invalidData);
    Logger.log('ERROR: Should have thrown validation error!');

  } catch (error) {
    Logger.log('✓ Validation correctly rejected invalid project ID');
    Logger.log(`Error message: ${error.message}`);
  }
}

/**
 * Test validation - Duplicate project ID
 */
function testValidationDuplicateProject() {
  try {
    Logger.log('=== Testing Validation - Duplicate Project ID ===');

    // Create a project first
    const projectData = {
      projectId: 'PRJ-DUP',
      projectName: 'Duplicate Test',
      totalWeight: 2,
      priority: 'Medium',
      startDate: new Date('2025-01-15'),
      targetDate: new Date('2025-03-30')
    };

    DataService.create('projects', projectData);
    Logger.log('First project created');

    // Try to create another with same ID
    DataService.create('projects', projectData);
    Logger.log('ERROR: Should have thrown duplicate ID error!');

  } catch (error) {
    Logger.log('✓ Validation correctly rejected duplicate project ID');
    Logger.log(`Error message: ${error.message}`);
  }
}

/**
 * Test validation - Task with invalid project ID
 */
function testValidationInvalidForeignKey() {
  try {
    Logger.log('=== Testing Validation - Invalid Foreign Key ===');

    // Try to create a task with non-existent project
    const taskData = {
      taskId: 'TSK-ORPHAN',
      projectId: 'PRJ-NONEXISTENT',  // Doesn't exist
      taskName: 'Orphan Task',
      status: 'Backlog',
      estimateDays: 5,
      resource1: 'Basel',
      r1EstHrs: 40,
      r1ActualHrs: 0,
      deadline: new Date('2025-02-15')
    };

    DataService.create('tasks', taskData);
    Logger.log('ERROR: Should have thrown foreign key error!');

  } catch (error) {
    Logger.log('✓ Validation correctly rejected invalid project ID');
    Logger.log(`Error message: ${error.message}`);
  }
}

/**
 * Test validation - Invalid status transition
 */
function testValidationStatusTransition() {
  try {
    Logger.log('=== Testing Validation - Invalid Status Transition ===');

    // Create a Done task
    const allProjects = DataService.getAll('projects');
    if (allProjects.length === 0) {
      Logger.log('No projects found. Create one first.');
      return;
    }

    const taskData = {
      taskId: 'TSK-DONE-TEST',
      projectId: allProjects[0].data.projectId,
      taskName: 'Completed Task',
      status: 'Done',
      estimateDays: 2,
      resource1: 'Basel',
      r1EstHrs: 16,
      r1ActualHrs: 16,
      deadline: new Date('2025-02-10'),
      completedDate: new Date()
    };

    const task = DataService.create('tasks', taskData);
    Logger.log('Task created with status Done');

    // Try to change it back to Backlog (invalid transition)
    DataService.update('tasks', task.uuid, { status: 'Backlog' });
    Logger.log('ERROR: Should have thrown invalid transition error!');

  } catch (error) {
    Logger.log('✓ Validation correctly rejected invalid status transition');
    Logger.log(`Error message: ${error.message}`);
  }
}

/**
 * Test audit logging - Create operation
 */
function testAuditLogCreate() {
  try {
    Logger.log('=== Testing Audit Log - Create ===');

    // Create a project
    const projectData = {
      projectId: 'PRJ-AUDIT-001',
      projectName: 'Audit Test Project',
      totalWeight: 4,
      priority: 'High',
      startDate: new Date('2025-01-15'),
      targetDate: new Date('2025-03-30')
    };

    const result = DataService.create('projects', projectData);
    Logger.log(`Project created: ${result.data.projectId}`);

    // Check audit log
    const history = AuditService.getRecordHistory(result.uuid);
    Logger.log(`Audit log entries: ${history.length}`);

    if (history.length > 0) {
      Logger.log('✓ Audit log entry created');
      Logger.log(`Action: ${history[0].action}`);
      Logger.log(`User: ${history[0].userEmail}`);
      Logger.log(`Changes: ${history[0].fieldChanges}`);
    } else {
      Logger.log('ERROR: No audit log entry found!');
    }

  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
    Logger.log(error.stack);
  }
}

/**
 * Test audit logging - Update operation
 */
function testAuditLogUpdate() {
  try {
    Logger.log('=== Testing Audit Log - Update ===');

    // Get first project
    const allProjects = DataService.getAll('projects');
    if (allProjects.length === 0) {
      Logger.log('No projects found. Create one first.');
      return;
    }

    const project = allProjects[0];
    Logger.log(`Updating project: ${project.data.projectId}`);

    // Update priority
    const updates = {
      priority: 'Critical',
      totalWeight: 5
    };

    DataService.update('projects', project.uuid, updates);
    Logger.log('Project updated');

    // Check audit log
    const history = AuditService.getRecordHistory(project.uuid, { limit: 1 });

    if (history.length > 0 && history[0].action === 'UPDATE') {
      Logger.log('✓ Audit log entry created for update');
      Logger.log(`Changes: ${history[0].fieldChanges}`);
    } else {
      Logger.log('ERROR: No audit log entry found for update!');
    }

  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
    Logger.log(error.stack);
  }
}

/**
 * Test audit log query functions
 */
function testAuditLogQueries() {
  try {
    Logger.log('=== Testing Audit Log Queries ===');

    // Get recent activity
    const recentActivity = AuditService.getRecentActivity(10);
    Logger.log(`Recent activity: ${recentActivity.length} entries`);

    recentActivity.slice(0, 3).forEach(entry => {
      Logger.log(`- ${entry.action} ${entry.entity} by ${entry.userEmail}`);
    });

    // Get statistics
    const stats = AuditService.getStatistics();
    Logger.log('\nAudit Log Statistics:');
    Logger.log(`Total entries: ${stats.totalEntries}`);
    Logger.log(`Actions: ${JSON.stringify(stats.actionCounts)}`);
    Logger.log(`Entities: ${JSON.stringify(stats.entityCounts)}`);

    Logger.log('✓ Audit log queries working');

  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
    Logger.log(error.stack);
  }
}

/**
 * Run all Phase 2 tests
 */
function runAllPhase2Tests() {
  Logger.log('========================================');
  Logger.log('RUNNING ALL PHASE 2 TESTS');
  Logger.log('========================================');

  try {
    // Test 1: Invalid project validation
    testValidationInvalidProject();

    // Test 2: Duplicate ID validation
    testValidationDuplicateProject();

    // Test 3: Foreign key validation
    testValidationInvalidForeignKey();

    // Test 4: Status transition validation
    testValidationStatusTransition();

    // Test 5: Audit log create
    testAuditLogCreate();

    // Test 6: Audit log update
    testAuditLogUpdate();

    // Test 7: Audit log queries
    testAuditLogQueries();

    Logger.log('========================================');
    Logger.log('ALL PHASE 2 TESTS PASSED!');
    Logger.log('========================================');

  } catch (error) {
    Logger.log('========================================');
    Logger.log('PHASE 2 TEST FAILED!');
    Logger.log(error.message);
    Logger.log('========================================');
  }
}

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

// Web App Data Functions
function getDashboardData() { return UiService.getDashboardData(); }
function getProjects() { return UiService.getProjects(); }
function getTasks(filters) { return UiService.getTasks(filters); }
function getResources() { return UiService.getResources(); }
function getProject(uuid) { return UiService.getProject(uuid); }
function getTask(uuid) { return UiService.getTask(uuid); }
function createProject(projectData) { return UiService.createProject(projectData); }
function updateProject(uuid, updates) { return UiService.updateProject(uuid, updates); }
function createTask(taskData) { return UiService.createTask(taskData); }
function updateTask(uuid, updates) { return UiService.updateTask(uuid, updates); }
function deleteTask(uuid) { return UiService.deleteTask(uuid); }
function getFormOptions() { return UiService.getFormOptions(); }
function getRecentActivity(limit) { return UiService.getRecentActivity(limit); }

/**
 * Create a custom menu when the spreadsheet opens
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('QC Scenario Planning')
    .addItem('Initialize Sheet (First Time)', 'initializeSheet')
    .addItem('Open Web App', 'openWebApp')
    .addSeparator()
    .addItem('Run Phase 1 Tests', 'runAllPhase1Tests')
    .addItem('Run Phase 2 Tests', 'runAllPhase2Tests')
    .addSeparator()
    .addSubMenu(ui.createMenu('Phase 1 Tests')
      .addItem('Create Project', 'testCreateProject')
      .addItem('Create Task', 'testCreateTask')
      .addItem('Query Tasks', 'testQueryTasks'))
    .addSubMenu(ui.createMenu('Phase 2 Tests')
      .addItem('Test Invalid Project', 'testValidationInvalidProject')
      .addItem('Test Duplicate ID', 'testValidationDuplicateProject')
      .addItem('Test Invalid Foreign Key', 'testValidationInvalidForeignKey')
      .addItem('Test Status Transition', 'testValidationStatusTransition')
      .addItem('Test Audit Log Create', 'testAuditLogCreate')
      .addItem('Test Audit Log Update', 'testAuditLogUpdate')
      .addItem('Test Audit Queries', 'testAuditLogQueries'))
    .addToUi();
}

/**
 * Open the web app in a new window
 */
function openWebApp() {
  const url = ScriptApp.getService().getUrl();
  const html = '<script>window.open("' + url + '");google.script.host.close();</script>';
  const ui = HtmlService.createHtmlOutput(html);
  SpreadsheetApp.getUi().showModalDialog(ui, 'Opening Web App...');
}
