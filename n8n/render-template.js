/**
 * Template Rendering Function for n8n Code Node
 *
 * This function renders the project summary HTML template with provided data.
 * Use this in the "Render HTML" Code node in n8n.
 */

function generateProjectSummaryHTML(project, stats, generatedAt) {
  // Format date helper
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Format datetime helper
  const formatDateTime = (dateStr) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Generate task rows
  const taskRows = stats.tasks.map(task => `
    <tr>
      <td>${escapeHtml(task.name)}</td>
      <td>${escapeHtml(task.assignee || '—')}</td>
      <td><span class="status-badge status-${task.status}">${task.status.replace('_', ' ')}</span></td>
      <td class="priority-${task.priority}">${task.priority || '—'}</td>
      <td>${formatDate(task.due_date)}</td>
      <td>${formatDate(task.completed_at)}</td>
    </tr>
  `).join('');

  // Generate report ID
  const reportId = `RPT-${Date.now().toString(36).toUpperCase()}`;

  // Main HTML template
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project Summary Report - ${escapeHtml(project.name)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 12px;
      line-height: 1.5;
      color: #333;
      background: #fff;
    }
    .page { max-width: 210mm; margin: 0 auto; padding: 20mm; }
    .header { border-bottom: 3px solid #2563eb; padding-bottom: 15px; margin-bottom: 25px; }
    .header-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
    .logo { font-size: 24px; font-weight: bold; color: #2563eb; }
    .report-meta { text-align: right; font-size: 10px; color: #666; }
    .report-title { font-size: 20px; font-weight: 600; color: #1e293b; margin-top: 10px; }
    .project-info { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-bottom: 25px; }
    .project-info h2 { font-size: 14px; color: #475569; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .info-item { display: flex; flex-direction: column; }
    .info-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; }
    .info-value { font-size: 13px; font-weight: 500; color: #1e293b; }
    .statistics { margin-bottom: 25px; }
    .statistics h2 { font-size: 14px; color: #475569; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 0.5px; }
    .stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
    .stat-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
    .stat-value { font-size: 24px; font-weight: bold; color: #2563eb; }
    .stat-label { font-size: 10px; color: #64748b; text-transform: uppercase; margin-top: 4px; }
    .stat-card.completed .stat-value { color: #16a34a; }
    .stat-card.pending .stat-value { color: #eab308; }
    .stat-card.in-progress .stat-value { color: #3b82f6; }
    .stat-card.failed .stat-value { color: #dc2626; }
    .progress-section { margin-bottom: 25px; }
    .progress-header { display: flex; justify-content: space-between; margin-bottom: 8px; }
    .progress-label { font-size: 12px; font-weight: 500; color: #475569; }
    .progress-value { font-size: 14px; font-weight: bold; color: #2563eb; }
    .progress-bar { height: 12px; background: #e2e8f0; border-radius: 6px; overflow: hidden; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, #2563eb, #3b82f6); border-radius: 6px; }
    .task-section { margin-bottom: 25px; }
    .task-section h2 { font-size: 14px; color: #475569; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 0.5px; }
    .task-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .task-table th { background: #f1f5f9; padding: 10px 8px; text-align: left; font-weight: 600; color: #475569; border-bottom: 2px solid #e2e8f0; text-transform: uppercase; font-size: 10px; letter-spacing: 0.3px; }
    .task-table td { padding: 10px 8px; border-bottom: 1px solid #e2e8f0; color: #334155; }
    .task-table tr:nth-child(even) { background: #f8fafc; }
    .status-badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 500; text-transform: uppercase; }
    .status-completed { background: #dcfce7; color: #166534; }
    .status-pending { background: #fef3c7; color: #92400e; }
    .status-in_progress { background: #dbeafe; color: #1e40af; }
    .status-failed { background: #fee2e2; color: #991b1b; }
    .priority-high { color: #dc2626; font-weight: 600; }
    .priority-medium { color: #d97706; }
    .priority-low { color: #6b7280; }
    .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
    .confidential { color: #ef4444; font-weight: 500; }
    @media print { .page { padding: 15mm; } .task-table { page-break-inside: auto; } .task-table tr { page-break-inside: avoid; page-break-after: auto; } }
  </style>
</head>
<body>
  <div class="page">
    <header class="header">
      <div class="header-top">
        <div class="logo">QC Management</div>
        <div class="report-meta">
          <div>Generated: ${formatDateTime(generatedAt)}</div>
          <div>Report ID: ${reportId}</div>
        </div>
      </div>
      <h1 class="report-title">Project Summary Report</h1>
    </header>

    <section class="project-info">
      <h2>Project Details</h2>
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">Project Name</span>
          <span class="info-value">${escapeHtml(project.name)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Project ID</span>
          <span class="info-value">${project.id}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Owner</span>
          <span class="info-value">${escapeHtml(project.owner || '—')}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Status</span>
          <span class="info-value">${escapeHtml(project.status)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Start Date</span>
          <span class="info-value">${formatDate(project.start_date)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Target Completion</span>
          <span class="info-value">${formatDate(project.target_date)}</span>
        </div>
      </div>
    </section>

    <section class="statistics">
      <h2>Task Statistics</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${stats.total}</div>
          <div class="stat-label">Total Tasks</div>
        </div>
        <div class="stat-card completed">
          <div class="stat-value">${stats.completed}</div>
          <div class="stat-label">Completed</div>
        </div>
        <div class="stat-card in-progress">
          <div class="stat-value">${stats.in_progress}</div>
          <div class="stat-label">In Progress</div>
        </div>
        <div class="stat-card pending">
          <div class="stat-value">${stats.pending}</div>
          <div class="stat-label">Pending</div>
        </div>
        <div class="stat-card failed">
          <div class="stat-value">${stats.failed}</div>
          <div class="stat-label">Failed</div>
        </div>
      </div>
    </section>

    <section class="progress-section">
      <div class="progress-header">
        <span class="progress-label">Overall Completion</span>
        <span class="progress-value">${stats.completion_pct}%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${stats.completion_pct}%;"></div>
      </div>
    </section>

    <section class="task-section">
      <h2>Task Breakdown</h2>
      <table class="task-table">
        <thead>
          <tr>
            <th>Task Name</th>
            <th>Assignee</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Due Date</th>
            <th>Completed</th>
          </tr>
        </thead>
        <tbody>
          ${taskRows}
        </tbody>
      </table>
    </section>

    <footer class="footer">
      <div class="confidential">CONFIDENTIAL - Internal Use Only</div>
      <div>Generated by QC Management System</div>
      <div>Page 1 of 1</div>
    </footer>
  </div>
</body>
</html>
  `;

  return html;
}

// HTML escape helper
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

// Export for n8n
return generateProjectSummaryHTML(project, stats, generatedAt);
