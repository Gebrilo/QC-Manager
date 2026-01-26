/**
 * Config.gs
 * Central configuration for QC Scenario Planning system
 * Defines all sheet schemas, column mappings, and field types
 */

const CONFIG = {
  // Spreadsheet configuration
  spreadsheet: {
    id: null, // Will be set at runtime via SpreadsheetApp.getActiveSpreadsheet()
    name: 'QC_Scenario_Planning'
  },

  // Sheet definitions
  sheets: {
    assumptions: {
      sheetName: 'Assumptions',
      startRow: 2,
      columns: {
        resourceName: 'A',
        hourlyCapacity: 'B',
        statusOptions: 'C'
      }
    },

    projects: {
      sheetName: 'Projects',
      startRow: 4,
      uuidColumn: 'A',
      displayIdColumn: 'B',
      columns: {
        uuid: 'A',              // Hidden, system-generated
        projectId: 'B',         // User-visible ID (PRJ-001)
        projectName: 'C',
        totalWeight: 'D',
        taskHrsEst: 'E',        // Formula
        taskHrsActual: 'F',     // Formula
        taskHrsDone: 'G',       // Formula
        completionPct: 'H',     // Formula
        tasksDone: 'I',         // Formula
        tasksTotal: 'J',        // Formula
        status: 'K',            // Formula
        priority: 'L',
        startDate: 'M',
        targetDate: 'N'
      },
      editableFields: ['B', 'C', 'D', 'L', 'M', 'N'],
      readonlyFields: ['E', 'F', 'G', 'H', 'I', 'J', 'K'],
      hiddenFields: ['A'],
      fieldTypes: {
        B: 'text',      // projectId
        C: 'text',      // projectName
        D: 'number',    // totalWeight
        E: 'formula',   // taskHrsEst
        F: 'formula',   // taskHrsActual
        G: 'formula',   // taskHrsDone
        H: 'formula',   // completionPct
        I: 'formula',   // tasksDone
        J: 'formula',   // tasksTotal
        K: 'formula',   // status
        L: 'enum',      // priority
        M: 'date',      // startDate
        N: 'date'       // targetDate
      },
      enums: {
        priority: ['High', 'Medium', 'Low', 'Critical']
      },
      formulas: {
        // Row 4 formulas as templates
        taskHrsEst: '=SUMIF(Tasks!$B$4:$B$100, A{row}, Tasks!$M$4:$M$100)',
        taskHrsActual: '=SUMIF(Tasks!$B$4:$B$100, A{row}, Tasks!$N$4:$N$100)',
        taskHrsDone: '=SUMIFS(Tasks!$N$4:$N$100, Tasks!$B$4:$B$100, A{row}, Tasks!$D$4:$D$100, "Done")',
        completionPct: '=IF(E{row}>0, G{row}/E{row}, 0)',
        tasksDone: '=COUNTIFS(Tasks!$B$4:$B$100, A{row}, Tasks!$D$4:$D$100, "Done")',
        tasksTotal: '=COUNTIF(Tasks!$B$4:$B$100, A{row})',
        status: '=IF(J{row}=0, "No Tasks", IF(I{row}=J{row}, "Complete", IF(H{row}>=0.7, "On Track", "At Risk")))'
      }
    },

    tasks: {
      sheetName: 'Tasks',
      startRow: 4,
      uuidColumn: 'A',
      displayIdColumn: 'B',
      columns: {
        uuid: 'A',                // Hidden, system-generated
        taskId: 'B',              // User-visible ID (TSK-001)
        projectId: 'C',           // Foreign key to Projects.projectId
        taskName: 'D',
        status: 'E',
        estimateDays: 'F',
        estimateHours: 'G',       // Formula
        resource1: 'H',
        r1EstHrs: 'I',
        r1ActualHrs: 'J',
        resource2: 'K',
        r2EstHrs: 'L',
        r2ActualHrs: 'M',
        totalEstHrs: 'N',         // Formula
        totalActualHrs: 'O',      // Formula
        r1CompletionPct: 'P',     // Formula
        r2CompletionPct: 'Q',     // Formula
        hoursVariance: 'R',       // Formula
        variancePct: 'S',         // Formula
        overallCompletionPct: 'T', // Formula
        deadline: 'U',
        completedDate: 'V'
      },
      editableFields: ['B', 'C', 'D', 'E', 'F', 'H', 'I', 'J', 'K', 'L', 'M', 'U', 'V'],
      readonlyFields: ['G', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'],
      hiddenFields: ['A'],
      foreignKeys: {
        C: 'projects.B'  // Task.projectId → Projects.projectId
      },
      fieldTypes: {
        B: 'text',      // taskId
        C: 'text',      // projectId (foreign key)
        D: 'text',      // taskName
        E: 'enum',      // status
        F: 'number',    // estimateDays
        G: 'formula',   // estimateHours
        H: 'text',      // resource1
        I: 'number',    // r1EstHrs
        J: 'number',    // r1ActualHrs
        K: 'text',      // resource2
        L: 'number',    // r2EstHrs
        M: 'number',    // r2ActualHrs
        N: 'formula',   // totalEstHrs
        O: 'formula',   // totalActualHrs
        P: 'formula',   // r1CompletionPct
        Q: 'formula',   // r2CompletionPct
        R: 'formula',   // hoursVariance
        S: 'formula',   // variancePct
        T: 'formula',   // overallCompletionPct
        U: 'date',      // deadline
        V: 'date'       // completedDate
      },
      enums: {
        status: ['Backlog', 'In Progress', 'Done', 'Cancelled']
      },
      formulas: {
        estimateHours: '=F{row}*8',
        totalEstHrs: '=I{row}+L{row}',
        totalActualHrs: '=J{row}+M{row}',
        r1CompletionPct: '=IF(I{row}>0, J{row}/I{row}, 0)',
        r2CompletionPct: '=IF(L{row}>0, M{row}/L{row}, 0)',
        hoursVariance: '=O{row}-N{row}',
        variancePct: '=IF(N{row}>0, R{row}/N{row}, 0)',
        overallCompletionPct: '=IF(N{row}>0, O{row}/N{row}, 0)'
      }
    },

    resources: {
      sheetName: 'Resources',
      startRow: 4,
      uuidColumn: 'A',
      columns: {
        uuid: 'A',              // Hidden, system-generated
        resourceName: 'B',
        weeklyCapacity: 'C',
        currentAllocation: 'D', // Formula
        utilizationPct: 'E',    // Formula
        availableHours: 'F'     // Formula
      },
      editableFields: ['B', 'C'],
      readonlyFields: ['D', 'E', 'F'],
      hiddenFields: ['A'],
      fieldTypes: {
        B: 'text',      // resourceName
        C: 'number',    // weeklyCapacity
        D: 'formula',   // currentAllocation
        E: 'formula',   // utilizationPct
        F: 'formula'    // availableHours
      },
      formulas: {
        currentAllocation: '=SUMIF(Tasks!$H$4:$H$100, B{row}, Tasks!$I$4:$I$100) + SUMIF(Tasks!$K$4:$K$100, B{row}, Tasks!$L$4:$L$100)',
        utilizationPct: '=IF(C{row}>0, D{row}/C{row}, 0)',
        availableHours: '=C{row}-D{row}'
      }
    },

    dashboard: {
      sheetName: 'Dashboard',
      // Dashboard is read-only, formula-driven
      sections: {
        resourceUtilization: { startRow: 15, endRow: 19 },
        projectPortfolio: { startRow: 23, endRow: 27 },
        taskStatusSummary: { startRow: 24, endRow: 29 },
        projectCompletion: { startRow: 31, endRow: 34 },
        resourceHours: { startRow: 36, endRow: 41 },
        tasksByProject: { startRow: 43, endRow: 46 },
        taskDetails: { startRow: 60, endRow: 71 },
        summaryMetrics: { startRow: 73, endRow: 81 }
      }
    },

    auditLog: {
      sheetName: 'AUDIT_LOG',
      startRow: 2,
      columns: {
        timestamp: 'A',
        action: 'B',
        entity: 'C',
        recordUuid: 'D',
        userEmail: 'E',
        beforeState: 'F',
        afterState: 'G',
        fieldChanges: 'H'
      },
      fieldTypes: {
        A: 'datetime',
        B: 'text',
        C: 'text',
        D: 'text',
        E: 'text',
        F: 'text',
        G: 'text',
        H: 'text'
      }
    }
  },

  // Validation rules
  validation: {
    idPatterns: {
      project: /^PRJ-\d{3}$/,
      task: /^TSK-\d{3}$/
    },
    statusTransitions: {
      'Backlog': ['In Progress', 'Cancelled'],
      'In Progress': ['Done', 'Cancelled'],
      'Done': [],
      'Cancelled': []
    }
  },

  // System constants
  constants: {
    maxRows: 100,  // Maximum rows to scan in each sheet
    defaultCapacity: 40,  // Default weekly capacity in hours
    riskThreshold: 0.7,   // 70% completion threshold for "At Risk" status
    dateFormat: 'yyyy-MM-dd',
    datetimeFormat: 'yyyy-MM-dd HH:mm:ss'
  }
};

/**
 * Get the active spreadsheet
 * @returns {Spreadsheet} The active spreadsheet
 */
function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Get a sheet by configuration name
 * @param {string} sheetConfigName - Name from CONFIG.sheets (e.g., 'projects', 'tasks')
 * @returns {Sheet} The sheet object
 */
function getSheetByConfig(sheetConfigName) {
  const config = CONFIG.sheets[sheetConfigName];
  if (!config) {
    throw new Error(`Sheet configuration not found: ${sheetConfigName}`);
  }

  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(config.sheetName);

  if (!sheet) {
    throw new Error(`Sheet not found: ${config.sheetName}`);
  }

  return sheet;
}

/**
 * Convert column letter to index (A=0, B=1, etc.)
 * @param {string} column - Column letter
 * @returns {number} Column index
 */
function columnToIndex(column) {
  let index = 0;
  for (let i = 0; i < column.length; i++) {
    index = index * 26 + (column.charCodeAt(i) - 64);
  }
  return index - 1;
}

/**
 * Convert column index to letter (0=A, 1=B, etc.)
 * @param {number} index - Column index
 * @returns {string} Column letter
 */
function indexToColumn(index) {
  let column = '';
  let temp = index + 1;
  while (temp > 0) {
    const remainder = (temp - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    temp = Math.floor((temp - 1) / 26);
  }
  return column;
}
