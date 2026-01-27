/**
 * UuidService.gs
 * Handles UUID generation, lookup, and management
 * UUIDs are used as immutable, unique identifiers for all records
 */

const UuidService = {

  /**
   * Generate a new UUID
   * @returns {string} A new UUID
   */
  generate: function() {
    return Utilities.getUuid();
  },

  /**
   * Find a record by UUID in a specific sheet
   * @param {string} sheetConfigName - Sheet configuration name (e.g., 'projects', 'tasks')
   * @param {string} uuid - UUID to search for
   * @returns {Object|null} Object with {row, data} or null if not found
   */
  findByUuid: function(sheetConfigName, uuid) {
    const config = CONFIG.sheets[sheetConfigName];
    if (!config || !config.uuidColumn) {
      throw new Error(`Sheet ${sheetConfigName} does not support UUID lookup`);
    }

    const sheet = getSheetByConfig(sheetConfigName);
    const uuidCol = columnToIndex(config.uuidColumn);
    const startRow = config.startRow;
    const maxRows = CONFIG.constants.maxRows;

    // Get all data in the UUID column
    const range = sheet.getRange(startRow, uuidCol + 1, maxRows, 1);
    const values = range.getValues();

    // Find the UUID
    for (let i = 0; i < values.length; i++) {
      if (values[i][0] === uuid) {
        const rowNum = startRow + i;
        const rowData = this.getRowData(sheetConfigName, rowNum);
        return {
          row: rowNum,
          data: rowData
        };
      }
    }

    return null;
  },

  /**
   * Get all data for a specific row
   * @param {string} sheetConfigName - Sheet configuration name
   * @param {number} rowNum - Row number (1-based)
   * @returns {Object} Object with column names as keys
   */
  getRowData: function(sheetConfigName, rowNum) {
    const config = CONFIG.sheets[sheetConfigName];
    const sheet = getSheetByConfig(sheetConfigName);
    const columns = config.columns;

    const data = {};

    // Get all column data for this row
    for (const [fieldName, colLetter] of Object.entries(columns)) {
      const colIndex = columnToIndex(colLetter);
      const cellValue = sheet.getRange(rowNum, colIndex + 1).getValue();
      data[fieldName] = cellValue;
    }

    return data;
  },

  /**
   * Check if a UUID exists in a sheet
   * @param {string} sheetConfigName - Sheet configuration name
   * @param {string} uuid - UUID to check
   * @returns {boolean} True if UUID exists
   */
  exists: function(sheetConfigName, uuid) {
    return this.findByUuid(sheetConfigName, uuid) !== null;
  },

  /**
   * Find a record by display ID (e.g., PRJ-001, TSK-001)
   * @param {string} sheetConfigName - Sheet configuration name
   * @param {string} displayId - Display ID to search for
   * @returns {Object|null} Object with {row, uuid, data} or null if not found
   */
  findByDisplayId: function(sheetConfigName, displayId) {
    const config = CONFIG.sheets[sheetConfigName];
    if (!config.displayIdColumn) {
      throw new Error(`Sheet ${sheetConfigName} does not have a display ID column`);
    }

    const sheet = getSheetByConfig(sheetConfigName);
    const displayIdCol = columnToIndex(config.displayIdColumn);
    const startRow = config.startRow;
    const maxRows = CONFIG.constants.maxRows;

    // Get all data in the display ID column
    const range = sheet.getRange(startRow, displayIdCol + 1, maxRows, 1);
    const values = range.getValues();

    // Find the display ID
    for (let i = 0; i < values.length; i++) {
      if (values[i][0] === displayId) {
        const rowNum = startRow + i;
        const rowData = this.getRowData(sheetConfigName, rowNum);
        return {
          row: rowNum,
          uuid: rowData.uuid,
          data: rowData
        };
      }
    }

    return null;
  },

  /**
   * Get all records from a sheet
   * @param {string} sheetConfigName - Sheet configuration name
   * @returns {Array} Array of records with {row, uuid, data}
   */
  getAllRecords: function(sheetConfigName) {
    const config = CONFIG.sheets[sheetConfigName];
    if (!config.uuidColumn) {
      throw new Error(`Sheet ${sheetConfigName} does not support UUID operations`);
    }

    const sheet = getSheetByConfig(sheetConfigName);
    const startRow = config.startRow;
    const maxRows = CONFIG.constants.maxRows;
    const uuidCol = columnToIndex(config.uuidColumn);

    // Get all UUIDs
    const uuidRange = sheet.getRange(startRow, uuidCol + 1, maxRows, 1);
    const uuids = uuidRange.getValues();

    const records = [];

    // Collect all non-empty records
    for (let i = 0; i < uuids.length; i++) {
      const uuid = uuids[i][0];
      if (uuid && uuid !== '') {
        const rowNum = startRow + i;
        const rowData = this.getRowData(sheetConfigName, rowNum);
        records.push({
          row: rowNum,
          uuid: uuid,
          data: rowData
        });
      }
    }

    return records;
  },

  /**
   * Find next available row in a sheet
   * @param {string} sheetConfigName - Sheet configuration name
   * @returns {number} Next available row number
   */
  getNextAvailableRow: function(sheetConfigName) {
    const config = CONFIG.sheets[sheetConfigName];
    const sheet = getSheetByConfig(sheetConfigName);
    const startRow = config.startRow;
    const maxRows = CONFIG.constants.maxRows;
    const uuidCol = columnToIndex(config.uuidColumn);

    // Get all UUIDs
    const range = sheet.getRange(startRow, uuidCol + 1, maxRows, 1);
    const values = range.getValues();

    // Find first empty row
    for (let i = 0; i < values.length; i++) {
      if (!values[i][0] || values[i][0] === '') {
        return startRow + i;
      }
    }

    throw new Error(`No available rows in ${config.sheetName}. Maximum rows (${maxRows}) reached.`);
  },

  /**
   * Generate next sequential display ID
   * @param {string} sheetConfigName - Sheet configuration name
   * @param {string} prefix - ID prefix (e.g., 'PRJ', 'TSK')
   * @returns {string} Next display ID (e.g., 'PRJ-001', 'TSK-042')
   */
  generateNextDisplayId: function(sheetConfigName, prefix) {
    const records = this.getAllRecords(sheetConfigName);
    const displayIdColumn = CONFIG.sheets[sheetConfigName].displayIdColumn;

    if (!displayIdColumn) {
      throw new Error(`Sheet ${sheetConfigName} does not have a display ID column`);
    }

    // Extract all existing numbers for this prefix
    const numbers = records
      .map(record => record.data[Object.keys(CONFIG.sheets[sheetConfigName].columns).find(
        key => CONFIG.sheets[sheetConfigName].columns[key] === displayIdColumn
      )])
      .filter(id => id && typeof id === 'string' && id.startsWith(prefix))
      .map(id => parseInt(id.split('-')[1]))
      .filter(num => !isNaN(num));

    // Find the maximum number
    const maxNum = numbers.length > 0 ? Math.max(...numbers) : 0;
    const nextNum = maxNum + 1;

    // Format as 3-digit number with leading zeros
    return `${prefix}-${String(nextNum).padStart(3, '0')}`;
  }
};
