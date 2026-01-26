import React, { useState } from 'react';
import { ReportDownloadButton } from './ReportDownloadButton';

/**
 * Report Export Panel Component
 *
 * A comprehensive panel for generating reports with filter options.
 * Provides UI for selecting date ranges, statuses, and assignees.
 */

interface ReportExportPanelProps {
  projectId: string;
  projectName: string;
  assignees?: string[];
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: '#eab308' },
  { value: 'in_progress', label: 'In Progress', color: '#3b82f6' },
  { value: 'completed', label: 'Completed', color: '#16a34a' },
  { value: 'failed', label: 'Failed', color: '#dc2626' },
];

export function ReportExportPanel({
  projectId,
  projectName,
  assignees = []
}: ReportExportPanelProps) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const handleStatusToggle = (status: string) => {
    setSelectedStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setSelectedStatuses([]);
    setSelectedAssignee('');
  };

  const hasFilters = dateFrom || dateTo || selectedStatuses.length > 0 || selectedAssignee;

  return (
    <div className="report-export-panel">
      <div className="panel-header">
        <h3>Export Reports</h3>
        <button
          className="toggle-filters"
          onClick={() => setIsPanelOpen(!isPanelOpen)}
          aria-expanded={isPanelOpen}
        >
          {isPanelOpen ? 'Hide Filters' : 'Show Filters'}
          <span className={`chevron ${isPanelOpen ? 'open' : ''}`}>▼</span>
        </button>
      </div>

      {isPanelOpen && (
        <div className="filters-section">
          <div className="filter-group">
            <label className="filter-label">Date Range</label>
            <div className="date-inputs">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="date-input"
                aria-label="From date"
              />
              <span className="date-separator">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="date-input"
                aria-label="To date"
              />
            </div>
          </div>

          <div className="filter-group">
            <label className="filter-label">Status</label>
            <div className="status-checkboxes">
              {STATUS_OPTIONS.map(status => (
                <label key={status.value} className="status-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedStatuses.includes(status.value)}
                    onChange={() => handleStatusToggle(status.value)}
                  />
                  <span
                    className="status-badge"
                    style={{ backgroundColor: `${status.color}20`, color: status.color }}
                  >
                    {status.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {assignees.length > 0 && (
            <div className="filter-group">
              <label className="filter-label">Assignee</label>
              <select
                value={selectedAssignee}
                onChange={(e) => setSelectedAssignee(e.target.value)}
                className="assignee-select"
              >
                <option value="">All Assignees</option>
                {assignees.map(assignee => (
                  <option key={assignee} value={assignee}>
                    {assignee}
                  </option>
                ))}
              </select>
            </div>
          )}

          {hasFilters && (
            <button className="clear-filters" onClick={clearFilters}>
              Clear All Filters
            </button>
          )}
        </div>
      )}

      <div className="export-actions">
        <ReportDownloadButton
          projectId={projectId}
          reportType="project-summary"
        >
          <span className="button-icon">📄</span>
          Project Summary (PDF)
        </ReportDownloadButton>

        <ReportDownloadButton
          projectId={projectId}
          reportType="task-export"
          filters={{
            status: selectedStatuses.length > 0 ? selectedStatuses : undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            assignee: selectedAssignee || undefined,
          }}
        >
          <span className="button-icon">📊</span>
          Task Export (Excel)
          {hasFilters && <span className="filter-badge">Filtered</span>}
        </ReportDownloadButton>
      </div>

      <style jsx>{`
        .report-export-panel {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 16px;
          margin: 16px 0;
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .panel-header h3 {
          font-size: 16px;
          font-weight: 600;
          color: #1e293b;
          margin: 0;
        }

        .toggle-filters {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 12px;
          font-size: 13px;
          color: #64748b;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .toggle-filters:hover {
          background: #f1f5f9;
          color: #475569;
        }

        .chevron {
          font-size: 10px;
          transition: transform 0.2s;
        }

        .chevron.open {
          transform: rotate(180deg);
        }

        .filters-section {
          padding: 16px;
          background: #f8fafc;
          border-radius: 6px;
          margin-bottom: 16px;
        }

        .filter-group {
          margin-bottom: 16px;
        }

        .filter-group:last-of-type {
          margin-bottom: 0;
        }

        .filter-label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: #475569;
          margin-bottom: 8px;
        }

        .date-inputs {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .date-input {
          padding: 8px 12px;
          font-size: 14px;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          background: #fff;
        }

        .date-input:focus {
          outline: none;
          border-color: #2563eb;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
        }

        .date-separator {
          color: #94a3b8;
          font-size: 13px;
        }

        .status-checkboxes {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .status-checkbox {
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
        }

        .status-checkbox input {
          cursor: pointer;
        }

        .status-badge {
          padding: 4px 10px;
          font-size: 12px;
          font-weight: 500;
          border-radius: 4px;
        }

        .assignee-select {
          width: 100%;
          max-width: 250px;
          padding: 8px 12px;
          font-size: 14px;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          background: #fff;
        }

        .assignee-select:focus {
          outline: none;
          border-color: #2563eb;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
        }

        .clear-filters {
          margin-top: 12px;
          padding: 6px 12px;
          font-size: 13px;
          color: #64748b;
          background: none;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .clear-filters:hover {
          background: #fff;
          color: #475569;
          border-color: #cbd5e1;
        }

        .export-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .button-icon {
          font-size: 16px;
        }

        .filter-badge {
          margin-left: 8px;
          padding: 2px 6px;
          font-size: 10px;
          font-weight: 600;
          color: #2563eb;
          background: rgba(37, 99, 235, 0.1);
          border-radius: 4px;
          text-transform: uppercase;
        }
      `}</style>
    </div>
  );
}

export default ReportExportPanel;
