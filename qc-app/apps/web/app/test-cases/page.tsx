'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TestCase, TestCategory, TestCaseStatus } from '@/types';
import { fetchApi } from '@/lib/api';
import FilterBar from '@/components/ui/FilterBar';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import { formatDistanceToNow } from 'date-fns';

export default function TestCasesPage() {
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<TestCategory | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<TestCaseStatus | 'all'>('all');

  useEffect(() => {
    loadTestCases();
  }, [categoryFilter, statusFilter]);

  const loadTestCases = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      if (categoryFilter !== 'all') {
        params.append('category', categoryFilter);
      }

      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }

      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const response = await fetchApi(`/test-cases?${params.toString()}`);
      setTestCases(response.data || []);
    } catch (error) {
      console.error('Failed to load test cases:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleSearchSubmit = () => {
    loadTestCases();
  };

  const getCategoryBadgeVariant = (category: TestCategory): 'default' | 'success' | 'warning' | 'danger' | 'info' => {
    const variants: Record<TestCategory, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
      smoke: 'danger',
      regression: 'info',
      e2e: 'warning',
      integration: 'success',
      unit: 'default',
      performance: 'warning',
      security: 'danger',
      other: 'default'
    };
    return variants[category] || 'default';
  };

  const getStatusBadgeVariant = (status: TestCaseStatus): 'default' | 'success' | 'warning' | 'danger' => {
    const variants: Record<TestCaseStatus, 'default' | 'success' | 'warning' | 'danger'> = {
      active: 'success',
      archived: 'default',
      draft: 'warning',
      deprecated: 'danger'
    };
    return variants[status] || 'default';
  };

  const getExecutionStatusBadge = (testCase: TestCase) => {
    if (!testCase.latest_status) {
      return <Badge variant="default">Never Run</Badge>;
    }

    const variants = {
      pass: 'success' as const,
      fail: 'danger' as const,
      not_run: 'default' as const,
      blocked: 'warning' as const,
      skipped: 'default' as const
    };

    return <Badge variant={variants[testCase.latest_status]}>{testCase.latest_status.toUpperCase()}</Badge>;
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Test Cases</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage your test case registry
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/test-cases/import">
            <Button variant="secondary">
              Import from Excel
            </Button>
          </Link>
          <Link href="/test-cases/create">
            <Button>
              + Create Test Case
            </Button>
          </Link>
        </div>
      </div>

      <div className="mb-6 space-y-4">
        <FilterBar
          value={searchQuery}
          onChange={handleSearch}
          onSubmit={handleSearchSubmit}
          placeholder="Search test cases by ID, title, or description..."
        />

        <div className="flex gap-4 items-center">
          <div className="flex gap-2 items-center">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Category:
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as TestCategory | 'all')}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="all">All Categories</option>
              <option value="smoke">Smoke</option>
              <option value="regression">Regression</option>
              <option value="e2e">E2E</option>
              <option value="integration">Integration</option>
              <option value="unit">Unit</option>
              <option value="performance">Performance</option>
              <option value="security">Security</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="flex gap-2 items-center">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Status:
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TestCaseStatus | 'all')}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
              <option value="deprecated">Deprecated</option>
            </select>
          </div>

          <div className="ml-auto text-sm text-gray-600 dark:text-gray-400">
            {testCases.length} test case{testCases.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {testCases.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            No test cases found. Create your first test case to get started.
          </p>
          <Link href="/test-cases/create">
            <Button>Create Test Case</Button>
          </Link>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Latest Result
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Last Run
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {testCases.map((testCase) => (
                  <tr key={testCase.id} className="hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        href={`/test-cases/${testCase.id}`}
                        className="text-blue-600 dark:text-blue-400 hover:underline font-mono text-sm"
                      >
                        {testCase.test_case_id}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {testCase.title}
                      </div>
                      {testCase.project_name && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {testCase.project_name}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={getCategoryBadgeVariant(testCase.category)}>
                        {testCase.category.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900 dark:text-white capitalize">
                        {testCase.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={getStatusBadgeVariant(testCase.status)}>
                        {testCase.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getExecutionStatusBadge(testCase)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {testCase.latest_execution_date ? (
                        <div>
                          <div>{formatDistanceToNow(new Date(testCase.latest_execution_date), { addSuffix: true })}</div>
                          {testCase.days_since_last_run !== undefined && testCase.days_since_last_run > 30 && (
                            <div className="text-xs text-orange-600 dark:text-orange-400">
                              ⚠ Stale
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">Never</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <Link
                        href={`/test-cases/${testCase.id}/edit`}
                        className="text-blue-600 dark:text-blue-400 hover:underline mr-4"
                      >
                        Edit
                      </Link>
                      <Link
                        href={`/test-cases/${testCase.id}`}
                        className="text-gray-600 dark:text-gray-400 hover:underline"
                      >
                        View
                      </Link>
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
