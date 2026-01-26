/**
 * ValidationService.gs
 * Handles all validation rules and business logic enforcement
 * Validates data before create/update operations
 */

const ValidationService = {

  /**
   * Validate project data
   * @param {Object} data - Project data to validate
   * @param {boolean} isUpdate - Whether this is an update operation
   * @returns {Object} Validation result with {valid: boolean, errors: Array}
   */
  validateProject: function(data, isUpdate = false) {
    const errors = [];

    // Validate Project ID (required for create)
    if (!isUpdate || data.projectId !== undefined) {
      if (!data.projectId || data.projectId.trim() === '') {
        errors.push('Project ID is required');
      } else if (!CONFIG.validation.idPatterns.project.test(data.projectId)) {
        errors.push('Project ID must match format: PRJ-XXX (e.g., PRJ-001)');
      } else if (!isUpdate) {
        // Check uniqueness for new projects
        const existing = UuidService.findByDisplayId('projects', data.projectId);
        if (existing) {
          errors.push(`Project ID ${data.projectId} already exists`);
        }
      }
    }

    // Validate Project Name
    if (!isUpdate || data.projectName !== undefined) {
      if (!data.projectName || data.projectName.trim() === '') {
        errors.push('Project Name is required');
      } else if (data.projectName.length > 100) {
        errors.push('Project Name must be 100 characters or less');
      }
    }

    // Validate Total Weight
    if (data.totalWeight !== undefined) {
      if (typeof data.totalWeight !== 'number') {
        errors.push('Total Weight must be a number');
      } else if (data.totalWeight < 1 || data.totalWeight > 5) {
        errors.push('Total Weight must be between 1 and 5');
      }
    }

    // Validate Priority
    if (data.priority !== undefined) {
      const validPriorities = CONFIG.sheets.projects.enums.priority;
      if (!validPriorities.includes(data.priority)) {
        errors.push(`Priority must be one of: ${validPriorities.join(', ')}`);
      }
    }

    // Validate dates
    if (data.startDate !== undefined && data.startDate && !(data.startDate instanceof Date)) {
      errors.push('Start Date must be a valid date');
    }

    if (data.targetDate !== undefined && data.targetDate && !(data.targetDate instanceof Date)) {
      errors.push('Target Date must be a valid date');
    }

    // Validate date logic (target must be after start)
    if (data.startDate && data.targetDate) {
      if (data.targetDate < data.startDate) {
        errors.push('Target Date must be after Start Date');
      }
    }

    // Ensure readonly fields are not provided
    const readonlyFields = ['taskHrsEst', 'taskHrsActual', 'taskHrsDone', 'completionPct',
                           'tasksDone', 'tasksTotal', 'status'];
    readonlyFields.forEach(field => {
      if (data[field] !== undefined) {
        errors.push(`Field '${field}' is read-only and calculated automatically`);
      }
    });

    return {
      valid: errors.length === 0,
      errors: errors
    };
  },

  /**
   * Validate task data
   * @param {Object} data - Task data to validate
   * @param {boolean} isUpdate - Whether this is an update operation
   * @returns {Object} Validation result with {valid: boolean, errors: Array}
   */
  validateTask: function(data, isUpdate = false) {
    const errors = [];

    // Validate Task ID (required for create)
    if (!isUpdate || data.taskId !== undefined) {
      if (!data.taskId || data.taskId.trim() === '') {
        errors.push('Task ID is required');
      } else if (!CONFIG.validation.idPatterns.task.test(data.taskId)) {
        errors.push('Task ID must match format: TSK-XXX (e.g., TSK-001)');
      } else if (!isUpdate) {
        // Check uniqueness for new tasks
        const existing = UuidService.findByDisplayId('tasks', data.taskId);
        if (existing) {
          errors.push(`Task ID ${data.taskId} already exists`);
        }
      }
    }

    // Validate Project ID (foreign key)
    if (!isUpdate || data.projectId !== undefined) {
      if (!data.projectId || data.projectId.trim() === '') {
        errors.push('Project ID is required');
      } else {
        // Check that project exists
        const project = UuidService.findByDisplayId('projects', data.projectId);
        if (!project) {
          errors.push(`Project ${data.projectId} does not exist`);
        }
      }
    }

    // Validate Task Name
    if (!isUpdate || data.taskName !== undefined) {
      if (!data.taskName || data.taskName.trim() === '') {
        errors.push('Task Name is required');
      } else if (data.taskName.length > 200) {
        errors.push('Task Name must be 200 characters or less');
      }
    }

    // Validate Status
    if (!isUpdate || data.status !== undefined) {
      const validStatuses = CONFIG.sheets.tasks.enums.status;
      if (!data.status) {
        errors.push('Status is required');
      } else if (!validStatuses.includes(data.status)) {
        errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
      }
    }

    // Validate Status Transitions (for updates)
    if (isUpdate && data.status !== undefined) {
      const validationResult = this.validateStatusTransition(data.uuid, data.status);
      if (!validationResult.valid) {
        errors.push(...validationResult.errors);
      }
    }

    // Validate Estimate Days
    if (data.estimateDays !== undefined) {
      if (typeof data.estimateDays !== 'number') {
        errors.push('Estimate Days must be a number');
      } else if (data.estimateDays < 0) {
        errors.push('Estimate Days cannot be negative');
      } else if (data.estimateDays > 365) {
        errors.push('Estimate Days cannot exceed 365 days');
      }
    }

    // Validate Resource 1
    if (data.resource1 !== undefined && data.resource1 && data.resource1.trim() !== '') {
      const validResources = this.getValidResources();
      if (!validResources.includes(data.resource1)) {
        errors.push(`Resource 1 '${data.resource1}' is not a valid resource. Valid resources: ${validResources.join(', ')}`);
      }
    }

    // Validate Resource 2
    if (data.resource2 !== undefined && data.resource2 && data.resource2.trim() !== '') {
      const validResources = this.getValidResources();
      if (!validResources.includes(data.resource2)) {
        errors.push(`Resource 2 '${data.resource2}' is not a valid resource. Valid resources: ${validResources.join(', ')}`);
      }
    }

    // Validate hours (cannot be negative)
    const hourFields = ['r1EstHrs', 'r1ActualHrs', 'r2EstHrs', 'r2ActualHrs'];
    hourFields.forEach(field => {
      if (data[field] !== undefined) {
        if (typeof data[field] !== 'number') {
          errors.push(`${field} must be a number`);
        } else if (data[field] < 0) {
          errors.push(`${field} cannot be negative`);
        } else if (data[field] > 1000) {
          errors.push(`${field} cannot exceed 1000 hours`);
        }
      }
    });

    // Validate dates
    if (data.deadline !== undefined && data.deadline && !(data.deadline instanceof Date)) {
      errors.push('Deadline must be a valid date');
    }

    if (data.completedDate !== undefined && data.completedDate && !(data.completedDate instanceof Date)) {
      errors.push('Completed Date must be a valid date');
    }

    // Business rule: Status "Done" requires Completed Date
    if (data.status === 'Done') {
      if (!data.completedDate) {
        errors.push('Completed Date is required when Status is "Done"');
      }
    }

    // Business rule: Status "Done" should have actual hours
    if (data.status === 'Done') {
      const actualHrs = (data.r1ActualHrs || 0) + (data.r2ActualHrs || 0);
      if (actualHrs === 0) {
        errors.push('At least one resource must have actual hours when Status is "Done"');
      }
    }

    // Ensure readonly formula fields are not provided
    const readonlyFields = ['estimateHours', 'totalEstHrs', 'totalActualHrs', 'r1CompletionPct',
                           'r2CompletionPct', 'hoursVariance', 'variancePct', 'overallCompletionPct'];
    readonlyFields.forEach(field => {
      if (data[field] !== undefined) {
        errors.push(`Field '${field}' is read-only and calculated automatically`);
      }
    });

    return {
      valid: errors.length === 0,
      errors: errors
    };
  },

  /**
   * Validate resource data
   * @param {Object} data - Resource data to validate
   * @param {boolean} isUpdate - Whether this is an update operation
   * @returns {Object} Validation result with {valid: boolean, errors: Array}
   */
  validateResource: function(data, isUpdate = false) {
    const errors = [];

    // Validate Resource Name
    if (!isUpdate || data.resourceName !== undefined) {
      if (!data.resourceName || data.resourceName.trim() === '') {
        errors.push('Resource Name is required');
      } else if (data.resourceName.length > 50) {
        errors.push('Resource Name must be 50 characters or less');
      } else if (!isUpdate) {
        // Check uniqueness for new resources
        const existing = DataService.getAll('resources').find(
          r => r.data.resourceName === data.resourceName
        );
        if (existing) {
          errors.push(`Resource ${data.resourceName} already exists`);
        }
      }
    }

    // Validate Weekly Capacity
    if (data.weeklyCapacity !== undefined) {
      if (typeof data.weeklyCapacity !== 'number') {
        errors.push('Weekly Capacity must be a number');
      } else if (data.weeklyCapacity <= 0) {
        errors.push('Weekly Capacity must be greater than 0');
      } else if (data.weeklyCapacity > 168) {
        errors.push('Weekly Capacity cannot exceed 168 hours (24×7)');
      }
    }

    // Ensure readonly fields are not provided
    const readonlyFields = ['currentAllocation', 'utilizationPct', 'availableHours'];
    readonlyFields.forEach(field => {
      if (data[field] !== undefined) {
        errors.push(`Field '${field}' is read-only and calculated automatically`);
      }
    });

    return {
      valid: errors.length === 0,
      errors: errors
    };
  },

  /**
   * Validate status transition
   * @param {string} uuid - Task UUID
   * @param {string} newStatus - New status to transition to
   * @returns {Object} Validation result
   */
  validateStatusTransition: function(uuid, newStatus) {
    const errors = [];

    // Get current task
    const task = DataService.read('tasks', uuid);
    if (!task) {
      errors.push('Task not found');
      return { valid: false, errors: errors };
    }

    const currentStatus = task.data.status;

    // Check if transition is allowed
    const allowedTransitions = CONFIG.validation.statusTransitions[currentStatus];

    if (!allowedTransitions) {
      errors.push(`Invalid current status: ${currentStatus}`);
      return { valid: false, errors: errors };
    }

    if (currentStatus === newStatus) {
      // No transition needed
      return { valid: true, errors: [] };
    }

    if (!allowedTransitions.includes(newStatus)) {
      errors.push(`Cannot transition from "${currentStatus}" to "${newStatus}". Allowed transitions: ${allowedTransitions.join(', ') || 'None'}`);
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  },

  /**
   * Get list of valid resources from Assumptions sheet
   * @returns {Array} Array of resource names
   */
  getValidResources: function() {
    const sheet = getSheetByConfig('assumptions');
    const config = CONFIG.sheets.assumptions;

    // Get resource names from column A starting at row 2
    const resourceCol = columnToIndex(config.columns.resourceName) + 1;
    const range = sheet.getRange(config.startRow, resourceCol, 50, 1);
    const values = range.getValues();

    const resources = [];
    for (let i = 0; i < values.length; i++) {
      const resourceName = values[i][0];
      if (resourceName && resourceName !== '') {
        resources.push(resourceName);
      }
    }

    return resources;
  },

  /**
   * Validate data before create operation
   * @param {string} sheetConfigName - Sheet configuration name
   * @param {Object} data - Data to validate
   * @returns {Object} Validation result
   * @throws {Error} If validation fails
   */
  validateBeforeCreate: function(sheetConfigName, data) {
    let result;

    switch (sheetConfigName) {
      case 'projects':
        result = this.validateProject(data, false);
        break;
      case 'tasks':
        result = this.validateTask(data, false);
        break;
      case 'resources':
        result = this.validateResource(data, false);
        break;
      default:
        result = { valid: true, errors: [] };
    }

    if (!result.valid) {
      throw new Error(`Validation failed:\n${result.errors.join('\n')}`);
    }

    return result;
  },

  /**
   * Validate data before update operation
   * @param {string} sheetConfigName - Sheet configuration name
   * @param {string} uuid - Record UUID
   * @param {Object} updates - Data to validate
   * @returns {Object} Validation result
   * @throws {Error} If validation fails
   */
  validateBeforeUpdate: function(sheetConfigName, uuid, updates) {
    let result;

    // Add UUID to updates for status transition validation
    const dataWithUuid = { ...updates, uuid: uuid };

    switch (sheetConfigName) {
      case 'projects':
        result = this.validateProject(updates, true);
        break;
      case 'tasks':
        result = this.validateTask(dataWithUuid, true);
        break;
      case 'resources':
        result = this.validateResource(updates, true);
        break;
      default:
        result = { valid: true, errors: [] };
    }

    if (!result.valid) {
      throw new Error(`Validation failed:\n${result.errors.join('\n')}`);
    }

    return result;
  },

  /**
   * Sanitize and prepare data for storage
   * @param {string} sheetConfigName - Sheet configuration name
   * @param {Object} data - Raw data
   * @returns {Object} Sanitized data
   */
  sanitizeData: function(sheetConfigName, data) {
    const sanitized = {};
    const config = CONFIG.sheets[sheetConfigName];

    if (!config) {
      return data;
    }

    // Process each field
    for (const [fieldName, value] of Object.entries(data)) {
      // Skip if field doesn't exist in schema
      if (!config.columns[fieldName]) {
        continue;
      }

      const colLetter = config.columns[fieldName];
      const fieldType = config.fieldTypes ? config.fieldTypes[colLetter] : 'text';

      // Skip formula fields
      if (fieldType === 'formula') {
        continue;
      }

      // Sanitize based on type
      switch (fieldType) {
        case 'text':
          sanitized[fieldName] = value ? String(value).trim() : '';
          break;

        case 'number':
          sanitized[fieldName] = typeof value === 'number' ? value : (parseFloat(value) || 0);
          break;

        case 'date':
        case 'datetime':
          sanitized[fieldName] = value instanceof Date ? value : (value ? new Date(value) : '');
          break;

        case 'enum':
          sanitized[fieldName] = value ? String(value).trim() : '';
          break;

        default:
          sanitized[fieldName] = value;
      }
    }

    return sanitized;
  }
};
