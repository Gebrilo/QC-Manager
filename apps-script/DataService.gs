/**
 * DataService.gs
 * Handles all CRUD (Create, Read, Update, Delete) operations
 * All operations are UUID-based and maintain data integrity
 */

const DataService = {

  /**
   * Create a new record in a sheet
   * @param {string} sheetConfigName - Sheet configuration name
   * @param {Object} data - Data object with field values
   * @returns {Object} Created record with {uuid, row, data}
   */
  create: function(sheetConfigName, data) {
    const config = CONFIG.sheets[sheetConfigName];
    if (!config.uuidColumn) {
      throw new Error(`Sheet ${sheetConfigName} does not support UUID operations`);
    }

    // Sanitize data
    const sanitizedData = ValidationService.sanitizeData(sheetConfigName, data);

    // Validate before create
    ValidationService.validateBeforeCreate(sheetConfigName, sanitizedData);

    // Generate UUID
    const uuid = UuidService.generate();

    // Get next available row
    const rowNum = UuidService.getNextAvailableRow(sheetConfigName);

    // Get sheet
    const sheet = getSheetByConfig(sheetConfigName);

    // Add UUID to data
    const fullData = { ...sanitizedData, uuid: uuid };

    // Write data to sheet
    this._writeRowData(sheetConfigName, rowNum, fullData, true);

    // Log to audit trail
    const entityName = this._getEntityName(sheetConfigName);
    AuditService.logCreate(entityName, uuid, fullData);

    return {
      uuid: uuid,
      row: rowNum,
      data: fullData
    };
  },

  /**
   * Read a record by UUID
   * @param {string} sheetConfigName - Sheet configuration name
   * @param {string} uuid - UUID of the record
   * @returns {Object|null} Record with {uuid, row, data} or null if not found
   */
  read: function(sheetConfigName, uuid) {
    const record = UuidService.findByUuid(sheetConfigName, uuid);
    if (!record) {
      return null;
    }

    return {
      uuid: uuid,
      row: record.row,
      data: record.data
    };
  },

  /**
   * Read a record by display ID
   * @param {string} sheetConfigName - Sheet configuration name
   * @param {string} displayId - Display ID (e.g., PRJ-001)
   * @returns {Object|null} Record or null if not found
   */
  readByDisplayId: function(sheetConfigName, displayId) {
    const record = UuidService.findByDisplayId(sheetConfigName, displayId);
    if (!record) {
      return null;
    }

    return {
      uuid: record.uuid,
      row: record.row,
      data: record.data
    };
  },

  /**
   * Update a record by UUID
   * @param {string} sheetConfigName - Sheet configuration name
   * @param {string} uuid - UUID of the record
   * @param {Object} updates - Object with fields to update
   * @returns {Object} Updated record with {uuid, row, data}
   */
  update: function(sheetConfigName, uuid, updates) {
    const record = UuidService.findByUuid(sheetConfigName, uuid);
    if (!record) {
      throw new Error(`Record not found with UUID: ${uuid}`);
    }

    // Capture before state
    const beforeData = { ...record.data };

    // Sanitize updates
    const sanitizedUpdates = ValidationService.sanitizeData(sheetConfigName, updates);

    // Validate before update
    ValidationService.validateBeforeUpdate(sheetConfigName, uuid, sanitizedUpdates);

    // Merge updates with existing data
    const updatedData = { ...record.data, ...sanitizedUpdates };

    // Ensure UUID is not changed
    updatedData.uuid = uuid;

    // Detect changed fields
    const changedFields = Object.keys(sanitizedUpdates).filter(key => {
      return beforeData[key] !== sanitizedUpdates[key];
    });

    // Write updated data
    this._writeRowData(sheetConfigName, record.row, updatedData, false);

    // Log to audit trail
    const entityName = this._getEntityName(sheetConfigName);
    AuditService.logUpdate(entityName, uuid, beforeData, updatedData, changedFields);

    return {
      uuid: uuid,
      row: record.row,
      data: updatedData
    };
  },

  /**
   * Delete a record by UUID (soft delete - sets status to Cancelled)
   * @param {string} sheetConfigName - Sheet configuration name
   * @param {string} uuid - UUID of the record
   * @returns {Object} Deleted record information
   */
  delete: function(sheetConfigName, uuid) {
    const record = UuidService.findByUuid(sheetConfigName, uuid);
    if (!record) {
      throw new Error(`Record not found with UUID: ${uuid}`);
    }

    const config = CONFIG.sheets[sheetConfigName];

    // Capture before state
    const beforeData = { ...record.data };

    // For tasks, set status to 'Cancelled'
    if (sheetConfigName === 'tasks' && config.columns.status) {
      // Log deletion
      const entityName = this._getEntityName(sheetConfigName);
      AuditService.logDelete(entityName, uuid, beforeData);

      return this.update(sheetConfigName, uuid, { status: 'Cancelled' });
    }

    // For other entities, physically delete by clearing the row
    const sheet = getSheetByConfig(sheetConfigName);
    const numColumns = Object.keys(config.columns).length;
    sheet.getRange(record.row, 1, 1, numColumns).clearContent();

    // Log deletion
    const entityName = this._getEntityName(sheetConfigName);
    AuditService.logDelete(entityName, uuid, beforeData);

    return {
      uuid: uuid,
      row: record.row,
      deleted: true
    };
  },

  /**
   * Get all records from a sheet
   * @param {string} sheetConfigName - Sheet configuration name
   * @param {Object} filters - Optional filters (e.g., {status: 'Done'})
   * @returns {Array} Array of records
   */
  getAll: function(sheetConfigName, filters = {}) {
    const records = UuidService.getAllRecords(sheetConfigName);

    // Apply filters if provided
    if (Object.keys(filters).length === 0) {
      return records;
    }

    return records.filter(record => {
      for (const [key, value] of Object.entries(filters)) {
        if (record.data[key] !== value) {
          return false;
        }
      }
      return true;
    });
  },

  /**
   * Query records with advanced filtering
   * @param {string} sheetConfigName - Sheet configuration name
   * @param {Object} options - Query options
   * @param {Object} options.filters - Filter conditions
   * @param {string} options.sortBy - Field to sort by
   * @param {string} options.sortOrder - 'asc' or 'desc'
   * @param {number} options.limit - Maximum number of records
   * @returns {Array} Array of records
   */
  query: function(sheetConfigName, options = {}) {
    let records = this.getAll(sheetConfigName, options.filters || {});

    // Sort
    if (options.sortBy) {
      records.sort((a, b) => {
        const aVal = a.data[options.sortBy];
        const bVal = b.data[options.sortBy];

        if (aVal < bVal) return options.sortOrder === 'desc' ? 1 : -1;
        if (aVal > bVal) return options.sortOrder === 'desc' ? -1 : 1;
        return 0;
      });
    }

    // Limit
    if (options.limit && options.limit > 0) {
      records = records.slice(0, options.limit);
    }

    return records;
  },

  /**
   * Write data to a specific row
   * @param {string} sheetConfigName - Sheet configuration name
   * @param {number} rowNum - Row number (1-based)
   * @param {Object} data - Data to write
   * @param {boolean} isNew - Whether this is a new record (affects formula writing)
   * @private
   */
  _writeRowData: function(sheetConfigName, rowNum, data, isNew) {
    const config = CONFIG.sheets[sheetConfigName];
    const sheet = getSheetByConfig(sheetConfigName);
    const columns = config.columns;

    // Write each field
    for (const [fieldName, colLetter] of Object.entries(columns)) {
      const colIndex = columnToIndex(colLetter);
      const fieldType = config.fieldTypes ? config.fieldTypes[colLetter] : 'text';

      // Skip readonly formula fields when updating
      if (!isNew && fieldType === 'formula') {
        continue;
      }

      // Get value to write
      let value = data[fieldName];

      // Handle formulas for new records
      if (isNew && fieldType === 'formula' && config.formulas) {
        const formulaKey = fieldName;
        if (config.formulas[formulaKey]) {
          // Replace {row} placeholder with actual row number
          value = config.formulas[formulaKey].replace(/{row}/g, rowNum);
        }
      }

      // Handle undefined/null values
      if (value === undefined || value === null) {
        value = '';
      }

      // Write to cell
      const cell = sheet.getRange(rowNum, colIndex + 1);

      if (fieldType === 'formula' && typeof value === 'string' && value.startsWith('=')) {
        cell.setFormula(value);
      } else {
        cell.setValue(value);
      }
    }
  },

  /**
   * Batch create multiple records
   * @param {string} sheetConfigName - Sheet configuration name
   * @param {Array} dataArray - Array of data objects
   * @returns {Array} Array of created records
   */
  batchCreate: function(sheetConfigName, dataArray) {
    const results = [];

    for (const data of dataArray) {
      const record = this.create(sheetConfigName, data);
      results.push(record);
    }

    return results;
  },

  /**
   * Count records matching filters
   * @param {string} sheetConfigName - Sheet configuration name
   * @param {Object} filters - Filter conditions
   * @returns {number} Count of matching records
   */
  count: function(sheetConfigName, filters = {}) {
    const records = this.getAll(sheetConfigName, filters);
    return records.length;
  },

  /**
   * Check if a display ID already exists
   * @param {string} sheetConfigName - Sheet configuration name
   * @param {string} displayId - Display ID to check
   * @returns {boolean} True if exists
   */
  displayIdExists: function(sheetConfigName, displayId) {
    const record = UuidService.findByDisplayId(sheetConfigName, displayId);
    return record !== null;
  },

  /**
   * Get record count by status (for tasks)
   * @param {string} sheetConfigName - Sheet configuration name
   * @returns {Object} Object with status counts
   */
  getStatusCounts: function(sheetConfigName) {
    const config = CONFIG.sheets[sheetConfigName];

    if (!config.columns.status) {
      throw new Error(`Sheet ${sheetConfigName} does not have a status column`);
    }

    const records = this.getAll(sheetConfigName);
    const counts = {};

    // Initialize counts for all possible statuses
    if (config.enums && config.enums.status) {
      config.enums.status.forEach(status => {
        counts[status] = 0;
      });
    }

    // Count records by status
    records.forEach(record => {
      const status = record.data.status;
      if (status) {
        counts[status] = (counts[status] || 0) + 1;
      }
    });

    return counts;
  },

  /**
   * Get entity name for audit logging
   * @param {string} sheetConfigName - Sheet configuration name
   * @returns {string} Entity name
   * @private
   */
  _getEntityName: function(sheetConfigName) {
    const entityNames = {
      'projects': 'Projects',
      'tasks': 'Tasks',
      'resources': 'Resources'
    };

    return entityNames[sheetConfigName] || sheetConfigName;
  }
};
