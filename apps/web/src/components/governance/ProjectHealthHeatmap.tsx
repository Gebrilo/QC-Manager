/**
 * Project Health Heatmap
 * Phase 2: Visual grid showing health status of all projects
 */

'use client';

import React, { useEffect, useState } from 'react';
import { getProjectHealth } from '../../services/governanceApi';
import type { ProjectHealth, HealthStatus } from '../../types/governance';
import {
    HEALTH_STATUS_COLORS,
    READINESS_COLORS,
    RISK_LEVEL_COLORS,
    formatPassRate,
    formatDaysAgo
} from '../../types/governance';

interface ProjectHealthHeatmapProps {
    filterStatus?: HealthStatus;
    onProjectClick?: (projectId: string) => void;
}

export default function ProjectHealthHeatmap({
    filterStatus,
    onProjectClick
}: ProjectHealthHeatmapProps) {
    const [projects, setProjects] = useState<ProjectHealth[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedFilter, setSelectedFilter] = useState<HealthStatus | undefined>(filterStatus);

    useEffect(() => {
        loadData();
    }, [selectedFilter]);

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);
            const result = await getProjectHealth(selectedFilter);
            setProjects(result);
        } catch (err) {
            console.error('Error loading project health:', err);
            setError('Failed to load project health data');
        } finally {
            setLoading(false);
        }
    };

    const handleProjectClick = (projectId: string) => {
        if (onProjectClick) {
            onProjectClick(projectId);
        }
    };

    const getHealthBgColor = (status: HealthStatus): string => {
        switch (status) {
            case 'GREEN': return 'bg-green-100 hover:bg-green-200 border-green-300';
            case 'AMBER': return 'bg-yellow-100 hover:bg-yellow-200 border-yellow-300';
            case 'RED': return 'bg-red-100 hover:bg-red-200 border-red-300';
        }
    };

    const getHealthTextColor = (status: HealthStatus): string => {
        switch (status) {
            case 'GREEN': return 'text-green-800';
            case 'AMBER': return 'text-yellow-800';
            case 'RED': return 'text-red-800';
        }
    };

    const getHealthIcon = (status: HealthStatus): string => {
        switch (status) {
            case 'GREEN': return '✓';
            case 'AMBER': return '⚠';
            case 'RED': return '✗';
        }
    };

    if (loading) {
        return (
            <div className="bg-white rounded-lg shadow p-6">
                <div className="animate-pulse">
                    <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="h-32 bg-gray-200 rounded"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Project Health Overview</h2>
                <div className="text-red-600">{error}</div>
            </div>
        );
    }

    const statusCounts = {
        GREEN: projects.filter(p => p.overall_health_status === 'GREEN').length,
        AMBER: projects.filter(p => p.overall_health_status === 'AMBER').length,
        RED: projects.filter(p => p.overall_health_status === 'RED').length,
    };

    return (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow">
            {/* Header with Filters */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">


                {/* Filter Tabs */}
                <div className="flex space-x-2">
                    <button
                        onClick={() => setSelectedFilter(undefined)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${!selectedFilter
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600'
                            }`}
                    >
                        All ({projects.length})
                    </button>
                    <button
                        onClick={() => setSelectedFilter('RED')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedFilter === 'RED'
                            ? 'bg-red-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600'
                            }`}
                    >
                        Critical ({statusCounts.RED})
                    </button>
                    <button
                        onClick={() => setSelectedFilter('AMBER')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedFilter === 'AMBER'
                            ? 'bg-amber-500 text-white'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600'
                            }`}
                    >
                        Warning ({statusCounts.AMBER})
                    </button>
                    <button
                        onClick={() => setSelectedFilter('GREEN')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedFilter === 'GREEN'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600'
                            }`}
                    >
                        Healthy ({statusCounts.GREEN})
                    </button>
                </div>
            </div>

            {/* Heatmap Grid */}
            <div className="p-6">
                {projects.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="text-slate-400 text-5xl mb-4">📊</div>
                        <p className="text-slate-600 dark:text-slate-400">No projects match the selected filter</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {projects.map((project) => (
                            <div
                                key={project.project_id}
                                onClick={() => handleProjectClick(project.project_id)}
                                className={`
                                    cursor-pointer text-left p-5 rounded-xl border transition-all duration-200 hover:shadow-md
                                    ${project.overall_health_status === 'GREEN' ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : ''}
                                    ${project.overall_health_status === 'AMBER' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' : ''}
                                    ${project.overall_health_status === 'RED' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : ''}
                                `}
                            >
                                {/* Project Name and Status */}
                                <div className="flex items-start justify-between mb-4">
                                    <h3 className={`font-bold text-lg pr-2
                                        ${project.overall_health_status === 'GREEN' ? 'text-emerald-800 dark:text-emerald-300' : ''}
                                        ${project.overall_health_status === 'AMBER' ? 'text-amber-800 dark:text-amber-300' : ''}
                                        ${project.overall_health_status === 'RED' ? 'text-red-800 dark:text-red-300' : ''}
                                    `}>
                                        {project.project_name}
                                    </h3>
                                    <span className={`text-xl
                                        ${project.overall_health_status === 'GREEN' ? 'text-emerald-600 dark:text-emerald-400' : ''}
                                        ${project.overall_health_status === 'AMBER' ? 'text-amber-600 dark:text-amber-400' : ''}
                                        ${project.overall_health_status === 'RED' ? 'text-red-600 dark:text-red-400' : ''}
                                    `}>
                                        {getHealthIcon(project.overall_health_status)}
                                    </span>
                                </div>

                                {/* Key Metrics */}
                                <div className="space-y-3 mb-4 bg-white/50 dark:bg-black/20 rounded-lg p-3">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600 dark:text-slate-400">Pass Rate</span>
                                        <span className={`font-bold
                                            ${project.overall_health_status === 'GREEN' ? 'text-emerald-700 dark:text-emerald-300' : ''}
                                            ${project.overall_health_status === 'AMBER' ? 'text-amber-700 dark:text-amber-300' : ''}
                                            ${project.overall_health_status === 'RED' ? 'text-red-700 dark:text-red-300' : ''}
                                        `}>
                                            {formatPassRate(project.latest_pass_rate_pct)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600 dark:text-slate-400">Test Cases</span>
                                        <span className="font-medium text-slate-700 dark:text-slate-300">
                                            {project.total_test_cases}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600 dark:text-slate-400">Last Run</span>
                                        <span className="font-medium text-slate-700 dark:text-slate-300">
                                            {formatDaysAgo(project.days_since_latest_execution)}
                                        </span>
                                    </div>
                                </div>

                                {/* Status Badges */}
                                <div className="flex flex-wrap gap-2">
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold
                                        ${project.readiness_status === 'GREEN' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-100' : ''}
                                        ${project.readiness_status === 'AMBER' ? 'bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-100' : ''}
                                        ${project.readiness_status === 'RED' ? 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100' : ''}
                                    `}>
                                        {project.readiness_status}
                                    </span>
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold
                                        ${project.risk_level === 'NORMAL' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-100' : ''}
                                        ${project.risk_level === 'WARNING' ? 'bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-100' : ''}
                                        ${project.risk_level === 'CRITICAL' ? 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100' : ''}
                                    `}>
                                        {project.risk_level}
                                    </span>
                                </div>

                                {/* Action Items Badge */}
                                {project.action_items && project.action_items.length > 0 && (
                                    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700/50">
                                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center">
                                            <span className="w-2 h-2 rounded-full bg-red-400 mr-2 animate-pulse"></span>
                                            {project.action_items.length} action item{project.action_items.length !== 1 ? 's' : ''}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
