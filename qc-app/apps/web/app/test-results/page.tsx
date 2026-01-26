'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { TestResult, ExecutionStatus, Project } from '@/types';
import { fetchApi } from '@/lib/api';
import FilterBar from '@/components/ui/FilterBar';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import { formatDistanceToNow } from 'date-fns';

export default function TestResultsPage() {
  const searchParams = useSearchParams();
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState(searchParams?.get('project_id') || 'all');
  const [statusFilter, setStatusFilter] = useState<ExecutionStatus | 'all'>('all');
  const [latestOnly, setLatestOnly] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    loadTestResults();
  }, [projectFilter, statusFilter, latestOnly]);

  const loadProjects = async () => {
    try {
      const response = await fetchApi('/projects');
      setProjects(response || []);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const loadTestResults = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      if (projectFilter !== 'all') {
        params.append('project_id', projectFilter);
      }

      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }

      if (searchQuery) {
        params.append('test_case_id', searchQuery);
      }

      params.append('latest_only', latestOnly.toString());
      params.append('limit', '200');

      const response = await fetchApi(`/test-results?${params.toString()}`);
      setTestResults(response.data || []);
    } catch (error) {
      console.error('Failed to load test results:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleSearchSubmit = () => {
    loadTestResults();
  };

  const getStatusBadgeVariant = (status: ExecutionStatus): 'success' | 'danger' | 'default' | 'warning' => {
    const variants: Record<ExecutionStatus, 'success' | 'danger' | 'default' | 'warning'> = {
      passed: 'success',
      failed: 'danger',
      not_run: 'default',
      blocked: 'warning',
      rejected: 'danger'
    };
    return variants[status];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Test Results</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            View and manage test execution results
          </p>
        </div>
        <Link href="/test-results/upload">
          <Button>
            Upload Test Results
          </Button>
        </Link>
      </div>

      <div className="mb-6 space-y-4">
        <FilterBar
          value={searchQuery}
          onChange={handleSearch}
          onSubmit={handleSearchSubmit}
          placeholder="Search by test case ID..."
        />

        <div className="flex gap-4 items-center flex-wrap">
          <div className="flex gap-2 items-center">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Project:
            </label>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="all">All Projects</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 items-center">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Status:
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ExecutionStatus | 'all')}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="all">All Statuses</option>
              <option value="passed">Passed</option>
              <option value="failed">Failed</option>
              <option value="not_run">Not Run</option>
              <option value="blocked">Blocked</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div className="flex gap-2 items-center">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={latestOnly}
                onChange={(e) => setLatestOnly(e.target.checked)}
                className="mr-2 rounded"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Latest results only
              </span>
            </label>
          </div>

          <div className="ml-auto text-sm text-gray-600 dark:text-gray-400">
            {testResults.length} result{testResults.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {testResults.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            No test results found. Upload your test results to get started.
          </p>
          <Link href="/test-results/upload">
            <Button>Upload Test Results</Button>
          </Link>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Test Case ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Project
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Executed
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Tester
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {testResults.map((result) => (
                  <tr key={result.id} className="hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-mono font-medium text-gray-900 dark:text-white">
                        {result.test_case_id}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {result.test_case_title || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {result.project_name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={getStatusBadgeVariant(result.status)}>
                        {result.status.toUpperCase().replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {new Date(result.executed_at).toLocaleDateString()}
                      {result.days_since_execution !== undefined && result.days_since_execution > 30 && (
                        <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                          {result.days_since_execution} days ago
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {result.tester_name || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                        {result.notes || '-'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
