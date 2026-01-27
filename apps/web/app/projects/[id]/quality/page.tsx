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
import { getProjectHealthSummary, getProjectReleaseReadiness } from '@/services/governanceApi';
import { MOCK_PROJECTS } from '@/data/mockData';

// Mock trend data generator - ideally this would come from API
const generateMockTrendData = () => {
  const data: { date: string; passRate: number; testsExecuted: number }[] = [];
  const today = new Date();
  for (let i = 14; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    data.push({
      date: date.toISOString(),
      passRate: 70 + Math.random() * 30, // Random between 70-100
      testsExecuted: Math.floor(Math.random() * 50) + 10
    });
  }
  return data;
};

export default function ProjectQualityDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = (params?.id as string) || '';

  // State for project data
  const [project, setProject] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProject() {
      if (!projectId) return;

      try {
        setLoading(true);
        // Use the API service which handles both real and mock data
        // The service will look up by ID, and typically returns a ProjectHealth object
        const data = await getProjectHealthSummary(projectId);

        if (data) {
          // Adapt ProjectHealth to the shape expected by the UI if needed
          // The UI expects: name, status, description, etc.
          // ProjectHealth has: project_name, project_status, etc.
          // We map it here or ensure the UI uses the right fields.
          // Let's create a compatible object.
          setProject({
            ...data,
            id: data.project_id,
            name: data.project_name,
            status: data.project_status,
            description: `Project ${data.project_name} quality metrics and governance details.` // Mock description if missing from health object
          });
        }
      } catch (err) {
        console.error("Failed to load project details:", err);
        setError("Failed to load project details");
      } finally {
        setLoading(false);
      }
    }

    loadProject();
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
              <TrendAnalysisWidget data={generateMockTrendData()} title="Quality Trend (Last 14 Days)" />
            </section>
            {/* Detailed Metrics Table Placeholder */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Recent Test Executions</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                  <thead>
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Test Suite</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Pass Rate</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Duration</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-white">Smoke Test A</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">Today, 10:00 AM</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-bold">100%</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">12m 30s</td>
                      <td className="px-6 py-4 whitespace-nowrap"><span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Passed</span></td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-white">Regression Suite</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">Yesterday, 4:00 PM</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-600 font-bold">92%</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">45m 10s</td>
                      <td className="px-6 py-4 whitespace-nowrap"><span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">Warning</span></td>
                    </tr>
                  </tbody>
                </table>
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
