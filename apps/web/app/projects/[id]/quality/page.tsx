'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ReleaseReadinessWidget,
  RiskIndicatorsWidget,
  TrendAnalysisWidget,
  QualityGateSettings,
  ReleaseControl
} from '@/components/governance'; // We need to export TrendAnalysisWidget from index
import { getProjectHealthSummary, getExecutionTrend } from '@/services/governanceApi';
import { bugsApi } from '@/lib/api';
import { BugsBySourceChart } from '@/components/BugsBySourceChart';


export default function ProjectQualityDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = (params?.id as string) || '';

  // State for project data
  const [project, setProject] = useState<any | null>(null);
  const [trendData, setTrendData] = useState<{ date: string; passRate: number; testsExecuted: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bugSummary, setBugSummary] = useState<{
    totals: { total_bugs: number; open_bugs: number; closed_bugs: number; bugs_from_testing: number; standalone_bugs: number };
    by_severity: { critical: number; high: number; medium: number; low: number };
    by_source: { test_case: number; exploratory: number };
    by_project: any[];
    recent_bugs: any[];
  } | null>(null);

  useEffect(() => {
    async function loadProjectData() {
      if (!projectId) return;

      try {
        setLoading(true);
        // Fetch project health and trend data in parallel
        const [healthData, trendResult, bugResult] = await Promise.all([
          getProjectHealthSummary(projectId),
          getExecutionTrend(projectId),
          bugsApi.summary(projectId),
        ]);

        if (healthData) {
          setProject({
            ...healthData,
            id: healthData.project_id,
            name: healthData.project_name,
            status: healthData.project_status,
            description: `Project ${healthData.project_name} quality metrics and governance details.`
          });
        }

        setTrendData(trendResult || []);
        setBugSummary(bugResult.data);
      } catch (err) {
        console.error("Failed to load project details:", err);
        setError("Failed to load project details");
      } finally {
        setLoading(false);
      }
    }

    loadProjectData();
  }, [projectId]);

  if (!project && !loading) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold text-red-600 mb-4">Project not found</h2>
        <p className="text-slate-500">Could not find project with ID: {projectId}</p>
        <button onClick={() => router.back()} className="mt-4 text-indigo-600 hover:underline">Go Back</button>
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState('overview');


  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-12">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <button
            onClick={() => router.back()}
            className="text-sm text-slate-500 hover:text-slate-800 mb-2 flex items-center"
          >
            ← Back to Dashboard
          </button>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                {project?.name || projectId}
                <span className={`text-sm px-3 py-1 rounded-full border ${project?.status === 'active' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-100 text-slate-800'
                  }`}>
                  {project?.status}
                </span>
              </h1>
              <p className="text-slate-500 mt-1">{project?.description}</p>
            </div>

            {/* Tabs */}
            <div className="flex space-x-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
              {['overview', 'release_control', 'settings'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === tab
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                >
                  {tab === 'overview' && 'Overview'}
                  {tab === 'release_control' && 'Release Control'}
                  {tab === 'settings' && 'Settings'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {activeTab === 'overview' && (
          <div className="animate-in fade-in duration-300 space-y-8">
            {/* Top Row: Readiness & Risks */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <section>
                <ReleaseReadinessWidget projectId={projectId} />
              </section>
              <section>
                <RiskIndicatorsWidget projectId={projectId} />
              </section>
            </div>
            {/* Trend Analysis */}
            <section>
              <TrendAnalysisWidget data={trendData} title="Quality Trend (Last 14 Days)" />
            </section>
            {/* Bug Summary — By Source Classification */}
            <section>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Bug Summary</h3>
              {bugSummary ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-white">{bugSummary.by_source.test_case}</p>
                      <p className="text-xs text-blue-100">Test Cases</p>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-white">{bugSummary.by_source.exploratory}</p>
                      <p className="text-xs text-amber-100">Exploratory</p>
                    </div>
                    <div className="bg-white dark:bg-slate-700 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">{bugSummary.totals.total_bugs}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Total Bugs</p>
                    </div>
                    <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-white">{bugSummary.totals.open_bugs}</p>
                      <p className="text-xs text-red-100">Open Bugs</p>
                    </div>
                  </div>
                  <BugsBySourceChart
                    testCase={bugSummary.by_source.test_case}
                    exploratory={bugSummary.by_source.exploratory}
                  />
                </>
              ) : (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex items-center justify-center h-40">
                  <p className="text-slate-400 text-sm">Loading bug data...</p>
                </div>
              )}
            </section>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Recent Test Executions</h3>
              <div className="text-center py-12">
                <div className="text-slate-300 dark:text-slate-600 text-5xl mb-4">📋</div>
                <p className="text-slate-500 dark:text-slate-400 font-medium">No test executions recorded yet</p>
                <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Test execution data will appear here once test runs are completed for this project.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'release_control' && (
          <div className="animate-in fade-in duration-300">
            <div className="mb-6">
              <h2 className="text-xl font-bold mb-2">Release Control Center</h2>
              <p className="text-slate-500">Review quality gates and authorize releases.</p>
            </div>
            {/* Dynamically import or just render if imported */}
            <ReleaseControl projectId={projectId} projectHealth={project} />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="animate-in fade-in duration-300 max-w-3xl">
            <div className="mb-6">
              <h2 className="text-xl font-bold mb-2">Quality Settings</h2>
              <p className="text-slate-500">Configure thresholds and automated gates.</p>
            </div>
            <QualityGateSettings projectId={projectId} />
          </div>
        )}

      </main>
    </div>
  );
}
