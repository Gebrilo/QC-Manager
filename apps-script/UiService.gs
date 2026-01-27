/**
 * UiService.gs
 * Backend service for web app UI
 * Provides data formatting, aggregation, and helper functions for the web interface
 */

const UiService = {

  /**
   * Get dashboard data for the web interface
   * @returns {Object} Dashboard data with projects, tasks, resources, and metrics
   */
  getDashboardData: function() {
    try {
      // Get all data
      const projects = DataService.getAll('projects');
      const tasks = DataService.getAll('tasks');
      const resources = DataService.getAll('resources');

      // Get status counts
      const taskStatusCounts = DataService.getStatusCounts('tasks');

      // Calculate metrics
      const metrics = this._calculateMetrics(projects, tasks, resources);

      // Format for UI
      return {
        projects: projects.map(p => this._formatProjectForUI(p)),
        tasks: tasks.map(t => this._formatTaskForUI(t)),
        resources: resources.map(r => this._formatResourceForUI(r)),
        metrics: metrics,
        statusCounts: taskStatusCounts,
        timestamp: new Date()
      };

    } catch (error) {
      Logger.log('Error getting dashboard data: ' + error.message);
      throw error;
    }
  },

  /**
   * Get projects list for UI
   * @returns {Array} Formatted projects array
   */
  getProjects: function() {
    const projects = DataService.getAll('projects');
    return projects.map(p => this._formatProjectForUI(p));
  },

  /**
   * Get tasks list for UI
   * @param {Object} filters - Optional filters
   * @returns {Array} Formatted tasks array
   */
  getTasks: function(filters = {}) {
    const tasks = DataService.getAll('tasks', filters);
    return tasks.map(t => this._formatTaskForUI(t));
  },

  /**
   * Get resources list for UI
   * @returns {Array} Formatted resources array
   */
  getResources: function() {
    const resources = DataService.getAll('resources');
    return resources.map(r => this._formatResourceForUI(r));
  },

  /**
   * Get single project by UUID
   * @param {string} uuid - Project UUID
   * @returns {Object} Formatted project
   */
  getProject: function(uuid) {
    const project = DataService.read('projects', uuid);
    if (!project) {
      throw new Error('Project not found');
    }
    return this._formatProjectForUI(project);
  },

  /**
   * Get single task by UUID
   * @param {string} uuid - Task UUID
   * @returns {Object} Formatted task
   */
  getTask: function(uuid) {
    const task = DataService.read('tasks', uuid);
    if (!task) {
      throw new Error('Task not found');
    }
    return this._formatTaskForUI(task);
  },

  /**
   * Create a new project
   * @param {Object} projectData - Project data from form
   * @returns {Object} Created project
   */
  createProject: function(projectData) {
    try {
      // Generate next project ID if not provided
      if (!projectData.projectId) {
        projectData.projectId = UuidService.generateNextDisplayId('projects', 'PRJ');
      }

      const result = DataService.create('projects', projectData);
      return {
        success: true,
        project: this._formatProjectForUI(result),
        message: `Project ${result.data.projectId} created successfully`
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Update a project
   * @param {string} uuid - Project UUID
   * @param {Object} updates - Updated fields
   * @returns {Object} Update result
   */
  updateProject: function(uuid, updates) {
    try {
      const result = DataService.update('projects', uuid, updates);
      return {
        success: true,
        project: this._formatProjectForUI(result),
        message: 'Project updated successfully'
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Create a new task
   * @param {Object} taskData - Task data from form
   * @returns {Object} Created task
   */
  createTask: function(taskData) {
    try {
      // Generate next task ID if not provided
      if (!taskData.taskId) {
        taskData.taskId = UuidService.generateNextDisplayId('tasks', 'TSK');
      }

      const result = DataService.create('tasks', taskData);
      return {
        success: true,
        task: this._formatTaskForUI(result),
        message: `Task ${result.data.taskId} created successfully`
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Update a task
   * @param {string} uuid - Task UUID
   * @param {Object} updates - Updated fields
   * @returns {Object} Update result
   */
  updateTask: function(uuid, updates) {
    try {
      const result = DataService.update('tasks', uuid, updates);
      return {
        success: true,
        task: this._formatTaskForUI(result),
        message: 'Task updated successfully'
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Delete a task (soft delete)
   * @param {string} uuid - Task UUID
   * @returns {Object} Delete result
   */
  deleteTask: function(uuid) {
    try {
      DataService.delete('tasks', uuid);
      return {
        success: true,
        message: 'Task cancelled successfully'
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Get chart data for visualizations
   * @returns {Object} Chart data
   */
  getChartData: function() {
    const tasks = DataService.getAll('tasks');
    const projects = DataService.getAll('projects');
    const resources = DataService.getAll('resources');

    return {
      taskStatusDistribution: this._getTaskStatusChartData(tasks),
      projectCompletion: this._getProjectCompletionChartData(projects),
      resourceUtilization: this._getResourceUtilizationChartData(resources),
      tasksByProject: this._getTasksByProjectChartData(projects, tasks)
    };
  },

  /**
   * Get dropdown options for forms
   * @returns {Object} Options for form dropdowns
   */
  getFormOptions: function() {
    const projects = DataService.getAll('projects');
    const resources = this._getResourcesFromAssumptions();

    return {
      projects: projects.map(p => ({
        value: p.data.projectId,
        label: `${p.data.projectId} - ${p.data.projectName}`
      })),
      resources: resources.map(r => ({
        value: r,
        label: r
      })),
      priorities: CONFIG.sheets.projects.enums.priority.map(p => ({
        value: p,
        label: p
      })),
      statuses: CONFIG.sheets.tasks.enums.status.map(s => ({
        value: s,
        label: s
      }))
    };
  },

  /**
   * Get recent activity feed
   * @param {number} limit - Number of entries
   * @returns {Array} Recent activity
   */
  getRecentActivity: function(limit = 20) {
    const activity = AuditService.getRecentActivity(limit);
    return activity.map(entry => ({
      timestamp: this._formatDateTime(entry.timestamp),
      action: entry.action,
      entity: entry.entity,
      user: entry.userEmail,
      description: entry.fieldChanges
    }));
  },

  /**
   * Format project for UI display
   * @param {Object} project - Project record
   * @returns {Object} Formatted project
   * @private
   */
  _formatProjectForUI: function(project) {
    const data = project.data;

    return {
      uuid: project.uuid,
      projectId: data.projectId || '',
      projectName: data.projectName || '',
      totalWeight: data.totalWeight || 0,
      taskHrsEst: this._formatNumber(data.taskHrsEst),
      taskHrsActual: this._formatNumber(data.taskHrsActual),
      taskHrsDone: this._formatNumber(data.taskHrsDone),
      completionPct: this._formatPercent(data.completionPct),
      tasksDone: data.tasksDone || 0,
      tasksTotal: data.tasksTotal || 0,
      status: data.status || 'No Tasks',
      priority: data.priority || '',
      startDate: this._formatDate(data.startDate),
      targetDate: this._formatDate(data.targetDate),
      // For charts/displays
      completionPctRaw: data.completionPct || 0,
      statusColor: this._getStatusColor(data.status)
    };
  },

  /**
   * Format task for UI display
   * @param {Object} task - Task record
   * @returns {Object} Formatted task
   * @private
   */
  _formatTaskForUI: function(task) {
    const data = task.data;

    return {
      uuid: task.uuid,
      taskId: data.taskId || '',
      projectId: data.projectId || '',
      taskName: data.taskName || '',
      status: data.status || 'Backlog',
      estimateDays: data.estimateDays || 0,
      estimateHours: this._formatNumber(data.estimateHours),
      resource1: data.resource1 || '',
      r1EstHrs: this._formatNumber(data.r1EstHrs),
      r1ActualHrs: this._formatNumber(data.r1ActualHrs),
      resource2: data.resource2 || '',
      r2EstHrs: this._formatNumber(data.r2EstHrs),
      r2ActualHrs: this._formatNumber(data.r2ActualHrs),
      totalEstHrs: this._formatNumber(data.totalEstHrs),
      totalActualHrs: this._formatNumber(data.totalActualHrs),
      overallCompletionPct: this._formatPercent(data.overallCompletionPct),
      hoursVariance: this._formatNumber(data.hoursVariance),
      deadline: this._formatDate(data.deadline),
      completedDate: this._formatDate(data.completedDate),
      // For UI
      statusColor: this._getTaskStatusColor(data.status),
      resources: this._formatResourceList(data.resource1, data.resource2)
    };
  },

  /**
   * Format resource for UI display
   * @param {Object} resource - Resource record
   * @returns {Object} Formatted resource
   * @private
   */
  _formatResourceForUI: function(resource) {
    const data = resource.data;

    return {
      uuid: resource.uuid,
      resourceName: data.resourceName || '',
      weeklyCapacity: this._formatNumber(data.weeklyCapacity),
      currentAllocation: this._formatNumber(data.currentAllocation),
      utilizationPct: this._formatPercent(data.utilizationPct),
      availableHours: this._formatNumber(data.availableHours),
      // For UI
      utilizationPctRaw: data.utilizationPct || 0,
      utilizationColor: this._getUtilizationColor(data.utilizationPct)
    };
  },

  /**
   * Calculate dashboard metrics
   * @param {Array} projects - Projects array
   * @param {Array} tasks - Tasks array
   * @param {Array} resources - Resources array
   * @returns {Object} Calculated metrics
   * @private
   */
  _calculateMetrics: function(projects, tasks, resources) {
    const totalProjects = projects.length;
    const totalTasks = tasks.length;
    const totalResources = resources.length;

    const doneTasks = tasks.filter(t => t.data.status === 'Done').length;
    const inProgressTasks = tasks.filter(t => t.data.status === 'In Progress').length;
    const backlogTasks = tasks.filter(t => t.data.status === 'Backlog').length;

    const totalEstHours = tasks.reduce((sum, t) => sum + (t.data.totalEstHrs || 0), 0);
    const totalActualHours = tasks.reduce((sum, t) => sum + (t.data.totalActualHrs || 0), 0);
    const totalVariance = totalActualHours - totalEstHours;

    const overallCompletion = totalTasks > 0 ? (doneTasks / totalTasks) : 0;

    const avgResourceUtilization = resources.length > 0
      ? resources.reduce((sum, r) => sum + (r.data.utilizationPct || 0), 0) / resources.length
      : 0;

    return {
      totalProjects,
      totalTasks,
      totalResources,
      doneTasks,
      inProgressTasks,
      backlogTasks,
      totalEstHours: this._formatNumber(totalEstHours),
      totalActualHours: this._formatNumber(totalActualHours),
      totalVariance: this._formatNumber(totalVariance),
      overallCompletion: this._formatPercent(overallCompletion),
      avgResourceUtilization: this._formatPercent(avgResourceUtilization)
    };
  },

  /**
   * Get task status chart data
   * @private
   */
  _getTaskStatusChartData: function(tasks) {
    const counts = {};
    CONFIG.sheets.tasks.enums.status.forEach(status => {
      counts[status] = 0;
    });

    tasks.forEach(task => {
      const status = task.data.status;
      if (counts[status] !== undefined) {
        counts[status]++;
      }
    });

    return {
      labels: Object.keys(counts),
      values: Object.values(counts)
    };
  },

  /**
   * Get project completion chart data
   * @private
   */
  _getProjectCompletionChartData: function(projects) {
    return projects.map(p => ({
      label: p.data.projectName,
      value: (p.data.completionPct || 0) * 100
    }));
  },

  /**
   * Get resource utilization chart data
   * @private
   */
  _getResourceUtilizationChartData: function(resources) {
    return resources.map(r => ({
      label: r.data.resourceName,
      value: (r.data.utilizationPct || 0) * 100
    }));
  },

  /**
   * Get tasks by project chart data
   * @private
   */
  _getTasksByProjectChartData: function(projects, tasks) {
    return projects.map(project => {
      const projectTasks = tasks.filter(t => t.data.projectId === project.data.projectId);
      const counts = {
        Done: 0,
        'In Progress': 0,
        Backlog: 0
      };

      projectTasks.forEach(task => {
        const status = task.data.status;
        if (counts[status] !== undefined) {
          counts[status]++;
        }
      });

      return {
        label: project.data.projectName,
        done: counts.Done,
        inProgress: counts['In Progress'],
        backlog: counts.Backlog
      };
    });
  },

  /**
   * Get resources from Assumptions sheet
   * @private
   */
  _getResourcesFromAssumptions: function() {
    return ValidationService.getValidResources();
  },

  /**
   * Format number with 2 decimal places
   * @private
   */
  _formatNumber: function(num) {
    if (num === null || num === undefined || num === '') return '0';
    return Number(num).toFixed(2);
  },

  /**
   * Format percentage (0-1 to 0%-100%)
   * @private
   */
  _formatPercent: function(num) {
    if (num === null || num === undefined || num === '') return '0%';
    return (Number(num) * 100).toFixed(1) + '%';
  },

  /**
   * Format date
   * @private
   */
  _formatDate: function(date) {
    if (!date || date === '') return '';
    if (!(date instanceof Date)) date = new Date(date);
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  },

  /**
   * Format datetime
   * @private
   */
  _formatDateTime: function(date) {
    if (!date || date === '') return '';
    if (!(date instanceof Date)) date = new Date(date);
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  },

  /**
   * Format resource list
   * @private
   */
  _formatResourceList: function(r1, r2) {
    if (r1 && r2) return `${r1}, ${r2}`;
    if (r1) return r1;
    if (r2) return r2;
    return '';
  },

  /**
   * Get color for project status
   * @private
   */
  _getStatusColor: function(status) {
    const colors = {
      'Complete': '#4caf50',
      'On Track': '#2196f3',
      'At Risk': '#ff9800',
      'No Tasks': '#9e9e9e'
    };
    return colors[status] || '#9e9e9e';
  },

  /**
   * Get color for task status
   * @private
   */
  _getTaskStatusColor: function(status) {
    const colors = {
      'Done': '#4caf50',
      'In Progress': '#2196f3',
      'Backlog': '#ff9800',
      'Cancelled': '#f44336'
    };
    return colors[status] || '#9e9e9e';
  },

  /**
   * Get color for resource utilization
   * @private
   */
  _getUtilizationColor: function(utilization) {
    if (utilization >= 1.0) return '#f44336';  // Red - overloaded
    if (utilization >= 0.8) return '#ff9800';  // Orange - high
    if (utilization >= 0.5) return '#4caf50';  // Green - optimal
    return '#2196f3';  // Blue - underutilized
  }
};
