import React, { useState } from 'react';

/**
 * Report Download Button Component
 *
 * Triggers report generation via n8n webhook and handles the download.
 * Supports both PDF and Excel report types.
 */

interface ReportDownloadButtonProps {
  projectId: string;
  reportType: 'project-summary' | 'task-export';
  filters?: TaskExportFilters;
  children?: React.ReactNode;
}

interface TaskExportFilters {
  status?: string[];
  dateFrom?: string;
  dateTo?: string;
  assignee?: string;
}

interface ReportResponse {
  success: boolean;
  download_url?: string;
  filename?: string;
  expires_in?: number;
  error?: {
    code: string;
    message: string;
  };
}

// Configuration - update these for your environment
const N8N_WEBHOOK_BASE_URL = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL || 'https://n8n.yourcompany.com/webhook';

export function ReportDownloadButton({
  projectId,
  reportType,
  filters,
  children
}: ReportDownloadButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Build request payload
      const payload: Record<string, unknown> = {
        project_id: projectId,
      };

      // Add filters for task export
      if (reportType === 'task-export' && filters) {
        if (filters.status?.length) payload.status = filters.status;
        if (filters.dateFrom) payload.date_from = filters.dateFrom;
        if (filters.dateTo) payload.date_to = filters.dateTo;
        if (filters.assignee) payload.assignee = filters.assignee;
      }

      // Call n8n webhook
      const endpoint = reportType === 'project-summary'
        ? `${N8N_WEBHOOK_BASE_URL}/qc/reports/project-summary`
        : `${N8N_WEBHOOK_BASE_URL}/qc/reports/task-export`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data: ReportResponse = await response.json();

      if (!data.success || !data.download_url) {
        throw new Error(data.error?.message || 'Failed to generate report');
      }

      // Open download URL in new tab
      window.open(data.download_url, '_blank');

    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
      console.error('Report download failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const buttonLabel = reportType === 'project-summary'
    ? 'Download PDF Report'
    : 'Export to Excel';

  const buttonIcon = reportType === 'project-summary' ? '📄' : '📊';

  return (
    <div className="report-download-container">
      <button
        onClick={handleDownload}
        disabled={isLoading}
        className={`report-download-button ${isLoading ? 'loading' : ''}`}
        aria-busy={isLoading}
      >
        {isLoading ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Generating...
          </>
        ) : (
          children || (
            <>
              <span aria-hidden="true">{buttonIcon}</span>
              {buttonLabel}
            </>
          )
        )}
      </button>

      {error && (
        <div className="error-message" role="alert">
          {error}
          <button
            onClick={() => setError(null)}
            className="error-dismiss"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      <style jsx>{`
        .report-download-container {
          display: inline-flex;
          flex-direction: column;
          gap: 8px;
        }

        .report-download-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          font-size: 14px;
          font-weight: 500;
          color: #fff;
          background: #2563eb;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: background-color 0.2s, opacity 0.2s;
        }

        .report-download-button:hover:not(:disabled) {
          background: #1d4ed8;
        }

        .report-download-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .report-download-button.loading {
          background: #64748b;
        }

        .spinner {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          border-top-color: #fff;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .error-message {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          font-size: 13px;
          color: #991b1b;
          background: #fee2e2;
          border-radius: 4px;
        }

        .error-dismiss {
          margin-left: auto;
          padding: 0 4px;
          font-size: 18px;
          color: #991b1b;
          background: none;
          border: none;
          cursor: pointer;
          line-height: 1;
        }

        .error-dismiss:hover {
          color: #7f1d1d;
        }
      `}</style>
    </div>
  );
}

/**
 * Example Usage in a Project Dashboard:
 *
 * ```tsx
 * import { ReportDownloadButton } from '@/components/ReportDownloadButton';
 *
 * function ProjectDashboard({ project }) {
 *   return (
 *     <div>
 *       <h1>{project.name}</h1>
 *
 *       <div className="actions">
 *         <ReportDownloadButton
 *           projectId={project.id}
 *           reportType="project-summary"
 *         />
 *
 *         <ReportDownloadButton
 *           projectId={project.id}
 *           reportType="task-export"
 *           filters={{
 *             status: ['completed', 'pending'],
 *             dateFrom: '2026-01-01',
 *             dateTo: '2026-01-18'
 *           }}
 *         />
 *       </div>
 *     </div>
 *   );
 * }
 * ```
 */

export default ReportDownloadButton;
