/**
 * AuditService.gs
 * Handles audit logging for all data mutations
 * Creates an append-only log of all changes for compliance and debugging
 */

const AuditService = {

  /**
   * Log a data change event
   * @param {Object} options - Log options
   * @param {string} options.action - Action type (CREATE, UPDATE, DELETE)
   * @param {string} options.entity - Entity type (Projects, Tasks, Resources)
   * @param {string} options.uuid - Record UUID
   * @param {Object} options.before - State before change (null for CREATE)
   * @param {Object} options.after - State after change (null for DELETE)
   * @param {Array} options.changes - List of changed field names
   * @returns {void}
   */
  log: function(options) {
    try {
      const sheet = getSheetByConfig('auditLog');
      const config = CONFIG.sheets.auditLog;

      // Prepare log entry
      const timestamp = new Date();
      const userEmail = this._getUserEmail();
      const action = options.action || 'UNKNOWN';
      const entity = options.entity || 'UNKNOWN';
      const recordUuid = options.uuid || '';

      // Serialize states
      const beforeState = options.before ? JSON.stringify(options.before) : '';
      const afterState = options.after ? JSON.stringify(options.after) : '';

      // Generate field changes summary
      const fieldChanges = this._generateChangeSummary(options.before, options.after, options.changes);

      // Append to audit log
      const row = [
        timestamp,
        action,
        entity,
        recordUuid,
        userEmail,
        beforeState,
        afterState,
        fieldChanges
      ];

      sheet.appendRow(row);

    } catch (error) {
      Logger.log(`Audit logging failed: ${error.message}`);
      // Don't throw - audit logging should not break main operations
    }
  },

  /**
   * Log a CREATE action
   * @param {string} entity - Entity type
   * @param {string} uuid - Record UUID
   * @param {Object} data - Created record data
   */
  logCreate: function(entity, uuid, data) {
    this.log({
      action: 'CREATE',
      entity: entity,
      uuid: uuid,
      before: null,
      after: data,
      changes: Object.keys(data)
    });
  },

  /**
   * Log an UPDATE action
   * @param {string} entity - Entity type
   * @param {string} uuid - Record UUID
   * @param {Object} beforeData - Data before update
   * @param {Object} afterData - Data after update
   * @param {Array} changedFields - List of changed field names
   */
  logUpdate: function(entity, uuid, beforeData, afterData, changedFields) {
    this.log({
      action: 'UPDATE',
      entity: entity,
      uuid: uuid,
      before: beforeData,
      after: afterData,
      changes: changedFields
    });
  },

  /**
   * Log a DELETE action
   * @param {string} entity - Entity type
   * @param {string} uuid - Record UUID
   * @param {Object} data - Deleted record data
   */
  logDelete: function(entity, uuid, data) {
    this.log({
      action: 'DELETE',
      entity: entity,
      uuid: uuid,
      before: data,
      after: null,
      changes: ['status']  // Soft delete changes status
    });
  },

  /**
   * Get the current user's email
   * @returns {string} User email
   * @private
   */
  _getUserEmail: function() {
    try {
      return Session.getActiveUser().getEmail();
    } catch (error) {
      return 'unknown@system';
    }
  },

  /**
   * Generate a human-readable summary of changes
   * @param {Object} before - Before state
   * @param {Object} after - After state
   * @param {Array} changedFields - List of changed field names
   * @returns {string} Change summary
   * @private
   */
  _generateChangeSummary: function(before, after, changedFields) {
    if (!before && after) {
      // CREATE
      return 'Record created';
    }

    if (before && !after) {
      // DELETE
      return 'Record deleted (soft delete)';
    }

    if (!changedFields || changedFields.length === 0) {
      return 'No changes';
    }

    // UPDATE - generate field-by-field summary
    const changes = [];

    changedFields.forEach(field => {
      const oldValue = before ? this._formatValue(before[field]) : '';
      const newValue = after ? this._formatValue(after[field]) : '';

      if (oldValue !== newValue) {
        changes.push(`${field}: "${oldValue}" → "${newValue}"`);
      }
    });

    return changes.join('; ');
  },

  /**
   * Format a value for display
   * @param {*} value - Value to format
   * @returns {string} Formatted value
   * @private
   */
  _formatValue: function(value) {
    if (value === null || value === undefined) {
      return '';
    }

    if (value instanceof Date) {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), CONFIG.constants.dateFormat);
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  },

  /**
   * Query audit log for a specific record
   * @param {string} uuid - Record UUID
   * @param {Object} options - Query options
   * @param {number} options.limit - Maximum number of entries to return
   * @param {string} options.action - Filter by action type
   * @returns {Array} Array of audit log entries
   */
  getRecordHistory: function(uuid, options = {}) {
    const sheet = getSheetByConfig('auditLog');
    const config = CONFIG.sheets.auditLog;

    // Get all data
    const lastRow = sheet.getLastRow();
    if (lastRow < config.startRow) {
      return [];
    }

    const numCols = Object.keys(config.columns).length;
    const range = sheet.getRange(config.startRow, 1, lastRow - config.startRow + 1, numCols);
    const values = range.getValues();

    const results = [];
    const uuidColIndex = columnToIndex(config.columns.recordUuid);

    // Filter by UUID
    for (let i = 0; i < values.length; i++) {
      if (values[i][uuidColIndex] === uuid) {
        // Apply action filter if specified
        if (options.action) {
          const actionColIndex = columnToIndex(config.columns.action);
          if (values[i][actionColIndex] !== options.action) {
            continue;
          }
        }

        results.push({
          timestamp: values[i][columnToIndex(config.columns.timestamp)],
          action: values[i][columnToIndex(config.columns.action)],
          entity: values[i][columnToIndex(config.columns.entity)],
          userEmail: values[i][columnToIndex(config.columns.userEmail)],
          beforeState: values[i][columnToIndex(config.columns.beforeState)],
          afterState: values[i][columnToIndex(config.columns.afterState)],
          fieldChanges: values[i][columnToIndex(config.columns.fieldChanges)]
        });
      }
    }

    // Sort by timestamp descending (most recent first)
    results.sort((a, b) => b.timestamp - a.timestamp);

    // Apply limit
    if (options.limit && options.limit > 0) {
      return results.slice(0, options.limit);
    }

    return results;
  },

  /**
   * Query audit log for all records of an entity type
   * @param {string} entity - Entity type (Projects, Tasks, Resources)
   * @param {Object} options - Query options
   * @returns {Array} Array of audit log entries
   */
  getEntityHistory: function(entity, options = {}) {
    const sheet = getSheetByConfig('auditLog');
    const config = CONFIG.sheets.auditLog;

    const lastRow = sheet.getLastRow();
    if (lastRow < config.startRow) {
      return [];
    }

    const numCols = Object.keys(config.columns).length;
    const range = sheet.getRange(config.startRow, 1, lastRow - config.startRow + 1, numCols);
    const values = range.getValues();

    const results = [];
    const entityColIndex = columnToIndex(config.columns.entity);

    // Filter by entity
    for (let i = 0; i < values.length; i++) {
      if (values[i][entityColIndex] === entity) {
        results.push({
          timestamp: values[i][columnToIndex(config.columns.timestamp)],
          action: values[i][columnToIndex(config.columns.action)],
          recordUuid: values[i][columnToIndex(config.columns.recordUuid)],
          userEmail: values[i][columnToIndex(config.columns.userEmail)],
          beforeState: values[i][columnToIndex(config.columns.beforeState)],
          afterState: values[i][columnToIndex(config.columns.afterState)],
          fieldChanges: values[i][columnToIndex(config.columns.fieldChanges)]
        });
      }
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp - a.timestamp);

    // Apply limit
    if (options.limit && options.limit > 0) {
      return results.slice(0, options.limit);
    }

    return results;
  },

  /**
   * Get recent audit log entries
   * @param {number} limit - Maximum number of entries
   * @returns {Array} Array of recent audit log entries
   */
  getRecentActivity: function(limit = 50) {
    const sheet = getSheetByConfig('auditLog');
    const config = CONFIG.sheets.auditLog;

    const lastRow = sheet.getLastRow();
    if (lastRow < config.startRow) {
      return [];
    }

    const numCols = Object.keys(config.columns).length;
    const startRow = Math.max(config.startRow, lastRow - limit + 1);
    const numRows = lastRow - startRow + 1;

    const range = sheet.getRange(startRow, 1, numRows, numCols);
    const values = range.getValues();

    const results = [];

    for (let i = 0; i < values.length; i++) {
      results.push({
        timestamp: values[i][columnToIndex(config.columns.timestamp)],
        action: values[i][columnToIndex(config.columns.action)],
        entity: values[i][columnToIndex(config.columns.entity)],
        recordUuid: values[i][columnToIndex(config.columns.recordUuid)],
        userEmail: values[i][columnToIndex(config.columns.userEmail)],
        fieldChanges: values[i][columnToIndex(config.columns.fieldChanges)]
      });
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp - a.timestamp);

    return results;
  },

  /**
   * Get statistics about audit log
   * @returns {Object} Audit log statistics
   */
  getStatistics: function() {
    const sheet = getSheetByConfig('auditLog');
    const config = CONFIG.sheets.auditLog;

    const lastRow = sheet.getLastRow();
    if (lastRow < config.startRow) {
      return {
        totalEntries: 0,
        actionCounts: {},
        entityCounts: {},
        userCounts: {}
      };
    }

    const numCols = Object.keys(config.columns).length;
    const range = sheet.getRange(config.startRow, 1, lastRow - config.startRow + 1, numCols);
    const values = range.getValues();

    const stats = {
      totalEntries: values.length,
      actionCounts: {},
      entityCounts: {},
      userCounts: {}
    };

    const actionColIndex = columnToIndex(config.columns.action);
    const entityColIndex = columnToIndex(config.columns.entity);
    const userColIndex = columnToIndex(config.columns.userEmail);

    for (let i = 0; i < values.length; i++) {
      const action = values[i][actionColIndex];
      const entity = values[i][entityColIndex];
      const user = values[i][userColIndex];

      stats.actionCounts[action] = (stats.actionCounts[action] || 0) + 1;
      stats.entityCounts[entity] = (stats.entityCounts[entity] || 0) + 1;
      stats.userCounts[user] = (stats.userCounts[user] || 0) + 1;
    }

    return stats;
  },

  /**
   * Export audit log to CSV format
   * @param {Object} filters - Optional filters
   * @returns {string} CSV content
   */
  exportToCsv: function(filters = {}) {
    const sheet = getSheetByConfig('auditLog');
    const config = CONFIG.sheets.auditLog;

    const lastRow = sheet.getLastRow();
    if (lastRow < config.startRow) {
      return 'No audit log entries found';
    }

    const numCols = Object.keys(config.columns).length;
    const range = sheet.getRange(1, 1, lastRow, numCols);
    const values = range.getValues();

    // Convert to CSV
    const csvRows = [];

    for (let i = 0; i < values.length; i++) {
      const row = values[i].map(cell => {
        if (cell instanceof Date) {
          return Utilities.formatDate(cell, Session.getScriptTimeZone(), CONFIG.constants.datetimeFormat);
        }
        // Escape quotes and wrap in quotes if contains comma
        const cellStr = String(cell);
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      });
      csvRows.push(row.join(','));
    }

    return csvRows.join('\n');
  }
};
