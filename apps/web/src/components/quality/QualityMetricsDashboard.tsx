'use client';

import { useEffect, useState } from 'react';
import { ProjectQualityMetrics, ExecutionTrend } from '@/types';
import { fetchApi } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';

interface QualityMetricsDashboardProps {
  projectId: string;
}

export default function QualityMetricsDashboard({ projectId }: QualityMetricsDashboardProps) {
  const [metrics, setMetrics] = useState<ProjectQualityMetrics | null>(null);
  const [trends, setTrends] = useState<ExecutionTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      // Load metrics
      const metricsData = await fetchApi<ProjectQualityMetrics>(`/test-results/project/${projectId}/metrics`);
      setMetrics(metricsData);

      // Load trends
      const trendsData = await fetchApi<{ data: ExecutionTrend[] } | ExecutionTrend[]>(`/test-results/project/${projectId}/trends?days=30`);
      const trendsArray = Array.isArray(trendsData) ? trendsData : (trendsData as any).data || [];
      setTrends(trendsArray);
    } catch (err: any) {
      setError(err.message || 'Failed to load quality metrics');
      console.error('Failed to load quality metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  const getHealthStatus = (): { status: 'good' | 'warning' | 'critical'; label: string; color: string } => {
    if (!metrics || !metrics.latest_execution_date) {
      return { status: 'warning', label: 'No Data', color: 'gray' };
    }

    const passRate = metrics.latest_pass_rate_pct;
    const daysSinceExecution = metrics.days_since_latest_execution || 0;

    if (passRate >= 95 && daysSinceExecution <= 7) {
      return { status: 'good', label: 'Excellent', color: 'green' };
    } else if (passRate >= 80 && daysSinceExecution <= 14) {
      return { status: 'good', label: 'Good', color: 'green' };
    } else if (passRate >= 70 || daysSinceExecution > 30) {
      return { status: 'warning', label: 'At Risk', color: 'yellow' };
    } else {
      return { status: 'critical', label: 'Critical', color: 'red' };
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center h-48">
          <Spinner size="lg" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="text-center text-red-600 dark:text-red-400">
          {error}
        </div>
      </Card>
    );
  }

  if (!metrics || !metrics.latest_execution_date) {
    return (
      <Card className="p-6">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No Test Results Yet
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Upload test results to see quality metrics and trends
          </p>
          <a
            href="/test-results/upload"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Upload Test Results
          </a>
        </div>
      </Card>
    );
  }

  const health = getHealthStatus();

  return (
    <div className="space-y-6">
      {/* Overall Health Status */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Quality Health
          </h3>
          <Badge
            variant={
              health.status === 'good' ? 'success' :
              health.status === 'warning' ? 'warning' : 'danger'
            }
            className="text-lg px-4 py-1"
          >
            {health.label}
          </Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Pass Rate */}
          <div className="text-center">
            <div className={`text-3xl font-bold ${
              metrics.latest_pass_rate_pct >= 95 ? 'text-green-600 dark:text-green-400' :
              metrics.latest_pass_rate_pct >= 80 ? 'text-yellow-600 dark:text-yellow-400' :
              'text-red-600 dark:text-red-400'
            }`}>
              {metrics.latest_pass_rate_pct.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Pass Rate</div>
          </div>

          {/* Fail Rate */}
          <div className="text-center">
            <div className={`text-3xl font-bold ${
              metrics.latest_fail_rate_pct <= 5 ? 'text-green-600 dark:text-green-400' :
              metrics.latest_fail_rate_pct <= 15 ? 'text-yellow-600 dark:text-yellow-400' :
              'text-red-600 dark:text-red-400'
            }`}>
              {metrics.latest_fail_rate_pct.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Fail Rate</div>
          </div>

          {/* Not Run % */}
          <div className="text-center">
            <div className={`text-3xl font-bold ${
              metrics.latest_not_run_pct <= 5 ? 'text-green-600 dark:text-green-400' :
              metrics.latest_not_run_pct <= 10 ? 'text-yellow-600 dark:text-yellow-400' :
              'text-red-600 dark:text-red-400'
            }`}>
              {metrics.latest_not_run_pct.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Not Run</div>
          </div>

          {/* Test Coverage */}
          <div className="text-center">
            <div className={`text-3xl font-bold ${
              metrics.test_coverage_pct >= 80 ? 'text-green-600 dark:text-green-400' :
              metrics.test_coverage_pct >= 60 ? 'text-yellow-600 dark:text-yellow-400' :
              'text-red-600 dark:text-red-400'
            }`}>
              {metrics.test_coverage_pct.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Coverage</div>
          </div>
        </div>
      </Card>

      {/* Detailed Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Test Execution Summary */}
        <Card className="p-6">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
            Latest Execution
          </h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Date</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {new Date(metrics.latest_execution_date).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Tests Executed</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {metrics.latest_tests_executed}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Freshness</span>
              <span className={`text-sm font-medium ${
                (metrics.days_since_latest_execution || 0) <= 7 ? 'text-green-600 dark:text-green-400' :
                (metrics.days_since_latest_execution || 0) <= 14 ? 'text-yellow-600 dark:text-yellow-400' :
                'text-red-600 dark:text-red-400'
              }`}>
                {metrics.days_since_latest_execution} day{metrics.days_since_latest_execution !== 1 ? 's' : ''} ago
              </span>
            </div>
          </div>
        </Card>

        {/* Status Breakdown */}
        <Card className="p-6">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
            Status Breakdown
          </h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Passed</span>
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {metrics.latest_passed_count}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Failed</span>
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {metrics.latest_failed_count}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-gray-400 mr-2"></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Not Run</span>
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {metrics.latest_not_run_count}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2"></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Blocked</span>
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {metrics.latest_blocked_count}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-purple-500 mr-2"></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Rejected</span>
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {metrics.latest_rejected_count}
              </span>
            </div>
          </div>
        </Card>

        {/* Coverage Info */}
        <Card className="p-6">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
            Test Coverage
          </h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Total Test Cases</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {metrics.total_test_cases}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Tasks with Tests</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {metrics.tasks_with_tests} / {metrics.total_tasks}
              </span>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                <span>Coverage</span>
                <span>{metrics.test_coverage_pct.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    metrics.test_coverage_pct >= 80 ? 'bg-green-600' :
                    metrics.test_coverage_pct >= 60 ? 'bg-yellow-600' :
                    'bg-red-600'
                  }`}
                  style={{ width: `${Math.min(metrics.test_coverage_pct, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Pass Rate Trend (Simple Text-based for now) */}
      {trends.length > 0 && (
        <Card className="p-6">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
            Pass Rate Trend (Last 30 Days)
          </h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {trends.slice(0, 10).map((trend, index) => (
              <div key={index} className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700 last:border-0">
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-gray-600 dark:text-gray-400 w-24">
                    {new Date(trend.execution_date).toLocaleDateString()}
                  </span>
                  <span className="text-sm text-gray-900 dark:text-white">
                    {trend.tests_executed} tests
                  </span>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="text-xs text-green-600 dark:text-green-400">
                    ✓ {trend.passed_count}
                  </span>
                  <span className="text-xs text-red-600 dark:text-red-400">
                    ✗ {trend.failed_count}
                  </span>
                  <span className={`text-sm font-medium ${
                    trend.daily_pass_rate_pct >= 95 ? 'text-green-600 dark:text-green-400' :
                    trend.daily_pass_rate_pct >= 80 ? 'text-yellow-600 dark:text-yellow-400' :
                    'text-red-600 dark:text-red-400'
                  }`}>
                    {trend.daily_pass_rate_pct.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <a
          href={`/test-results?project_id=${projectId}`}
          className="flex-1 text-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          View All Test Results
        </a>
        <a
          href="/test-results/upload"
          className="flex-1 text-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Upload New Results
        </a>
      </div>
    </div>
  );
}
