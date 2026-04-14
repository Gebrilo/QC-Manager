'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ReleaseReadinessWidget,
  RiskIndicatorsWidget,
  TrendAnalysisWidget,
  QualityGateSettings,
  ReleaseControl,
  BugSummaryWidget,
  QualityMetricsWidget,
  BlockedTestsWidget,
  GrossNetProgressWidget,
} from '@/components/governance';
import {
  getProjectHealthSummary,
  getExecutionTrend,
  getQualityMetrics,
  getBlockedAnalysis,
  getExecutionProgress,
} from '@/services/governanceApi';
import type { TrendData, QualityMetrics, BlockedModuleAnalysis, ExecutionProgress } from '@/types/governance';


export default function ProjectQualityDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = (params?.id as string) || '';

  const [project, setProject] = useState<any | null>(null);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [qualityMetrics, setQualityMetrics] = useState<QualityMetrics[]>([]);
  const [blockedAnalysis, setBlockedAnalysis] = useState<BlockedModuleAnalysis[]>([]);
  const [executionProgress, setExecutionProgress] = useState<ExecutionProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProjectData() {
      if (!projectId) return;

      try {
        setLoading(true);
        const [healthData, trendResult, metricsResult, blockedResult, progressResult] = await Promise.all([
          getProjectHealthSummary(projectId),
          getExecutionTrend(projectId),
          getQualityMetrics(projectId),
          getBlockedAnalysis(projectId),
          getExecutionProgress(projectId),
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
        setQualityMetrics(metricsResult || []);
        setBlockedAnalysis(blockedResult || []);
        setExecutionProgress(progressResult || []);
      } catch (err) {
        console.error("Failed to load project details:", err);
        setError("Failed to load project details");
      } finally {
        setLoading(false);
      }
    }

    loadProjectData();
  }, [projectId]);

  const [activeTab, setActiveTab] = useState('overview');

  if (!project && !loading) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold text-red-600 mb-4">Project not found</h2>
        <p className="text-slate-500">Could not find project with ID: {projectId}</p>
        <button onClick={() => router.back()} className="mt-4 text-indigo-600 hover:underline">Go Back</button>
      </div>
    );
  }


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

            {/* Gross vs Net Execution Progress */}
            <section>
              <GrossNetProgressWidget data={executionProgress} />
            </section>

            {/* Quality Metrics (coverage, effectiveness, PERT) */}
            <section>
              <QualityMetricsWidget data={qualityMetrics} />
            </section>

            {/* Blocked Test Analysis */}
            <section>
              <BlockedTestsWidget data={blockedAnalysis} />
            </section>

            {/* Bug Summary */}
            <section>
              <BugSummaryWidget projectId={projectId} />
            </section>
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
