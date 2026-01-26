'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Project, TestResultsUploadResponse } from '@/types';
import { fetchApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function UploadTestResultsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<TestResultsUploadResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const response = await fetchApi('/projects');
      setProjects(response || []);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      const validTypes = [
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ];

      if (!validTypes.includes(selectedFile.type) &&
        !selectedFile.name.endsWith('.csv') &&
        !selectedFile.name.endsWith('.xlsx')) {
        setError('Please upload a CSV or Excel (.xlsx) file');
        setFile(null);
        return;
      }

      setFile(selectedFile);
      setError('');
    }
  };

  const parseCSV = (text: string): any[] => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('File must contain headers and at least one data row');
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

    // Validate required columns
    if (!headers.includes('test_case_id') || !headers.includes('status')) {
      throw new Error('CSV must include test_case_id and status columns');
    }

    const results = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      if (values.length !== headers.length) continue; // Skip malformed rows

      const row: any = {};
      headers.forEach((header, index) => {
        const value = values[index]?.trim();
        if (value) {
          row[header] = value;
        }
      });

      // Only add rows with required fields
      if (row.test_case_id && row.status) {
        results.push(row);
      }
    }

    return results;
  };

  const handleUpload = async () => {
    if (!selectedProjectId) {
      setError('Please select a project');
      return;
    }

    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    setUploading(true);
    setError('');
    setUploadResult(null);

    try {
      // Read file content
      const text = await file.text();

      // Parse CSV (for Excel, user needs to save as CSV first)
      const results = parseCSV(text);

      if (results.length === 0) {
        throw new Error('No valid test results found in file');
      }

      // Validate status values
      const validStatuses = ['passed', 'failed', 'not_run', 'blocked', 'rejected'];
      const invalidResults = results.filter(r =>
        !validStatuses.includes(r.status.toLowerCase())
      );

      if (invalidResults.length > 0) {
        throw new Error(
          `Invalid status values found. Must be one of: ${validStatuses.join(', ')}`
        );
      }

      // Upload to API
      const response = await fetchApi('/test-results/upload', {
        method: 'POST',
        body: JSON.stringify({
          project_id: selectedProjectId,
          results: results
        })
      });

      setUploadResult(response);
    } catch (err: any) {
      setError(err.message || 'Failed to upload test results');
    } finally {
      setUploading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setUploadResult(null);
    setError('');
    setSelectedProjectId('');
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Upload Test Results
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Upload test execution results from Excel or CSV file
        </p>
      </div>

      {!uploadResult ? (
        <Card className="p-6">
          <div className="space-y-6">
            {/* Project Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select Project *
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={uploading}
              >
                <option value="">-- Select a project --</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            {/* File Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Upload File *
              </label>
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={handleFileChange}
                disabled={uploading}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-gray-700 dark:file:text-gray-300"
              />
              {file && (
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
                </p>
              )}
            </div>

            {/* Template Info */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">
                CSV Format Required
              </h3>
              <p className="text-sm text-blue-800 dark:text-blue-400 mb-3">
                Your file must include these columns:
              </p>
              <ul className="text-sm text-blue-800 dark:text-blue-400 space-y-1 mb-3">
                <li>• <strong>test_case_id</strong> (required) - e.g., TC-001, TEST-LOGIN</li>
                <li>• <strong>status</strong> (required) - passed, failed, not_run, blocked, or rejected</li>
                <li>• <strong>priority</strong> (optional) - High, Medium, Low</li>
                <li>• <strong>test_case_title</strong> (optional) - description</li>
                <li>• <strong>executed_at</strong> (optional) - date (defaults to today)</li>
                <li>• <strong>notes</strong> (optional) - comments</li>
                <li>• <strong>tester_name</strong> (optional) - who executed the test</li>
              </ul>
              <Link
                href="/templates/test_results_template.md"
                target="_blank"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                View detailed template documentation →
              </Link>
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-sm text-red-800 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                onClick={handleUpload}
                disabled={!selectedProjectId || !file || uploading}
                className="flex-1"
              >
                {uploading ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Uploading...
                  </>
                ) : (
                  'Upload Test Results'
                )}
              </Button>
              <Link href="/test-results">
                <Button variant="secondary">Cancel</Button>
              </Link>
            </div>
          </div>
        </Card>
      ) : (
        // Upload Results
        <div className="space-y-6">
          <Card className="p-6">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full mb-4">
                <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Upload Complete
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Test results have been processed
              </p>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {uploadResult.summary.total}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Total</div>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {uploadResult.summary.imported}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Imported</div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {uploadResult.summary.updated}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Updated</div>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {uploadResult.summary.errors}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Errors</div>
              </div>
            </div>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Success Rate
                </span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">
                  {uploadResult.summary.success_rate}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full transition-all"
                  style={{ width: uploadResult.summary.success_rate }}
                />
              </div>
            </div>

            {/* Error Details */}
            {uploadResult.details.errors.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                  Errors ({uploadResult.details.errors.length})
                </h3>
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 max-h-60 overflow-y-auto">
                  {uploadResult.details.errors.map((err, index) => (
                    <div key={index} className="text-sm text-red-800 dark:text-red-400 mb-2">
                      Row {err.row}: {err.test_case_id} - {err.error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Link href={`/test-results?project_id=${selectedProjectId}`} className="flex-1">
                <Button className="w-full">View Test Results</Button>
              </Link>
              <Link href={`/projects/${selectedProjectId}`} className="flex-1">
                <Button variant="secondary" className="w-full">View Project</Button>
              </Link>
              <Button variant="secondary" onClick={handleReset}>
                Upload More
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
