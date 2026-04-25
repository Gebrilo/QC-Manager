'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
    tuleapConfigApi,
    TuleapSyncConfig,
    fetchApi,
    Project as ApiProject,
} from '../../../src/lib/api';
import { Button } from '../../../src/components/ui/Button';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ProjectOption {
    id: string;
    project_id: string;
    project_name: string;
}

interface GroupedMapping {
    qc_project_id: string;
    project_name: string;
    configs: TuleapSyncConfig[];
}

type TrackerType = 'bug' | 'task' | 'user_story' | 'test_case';

const TRACKER_TYPES: TrackerType[] = ['bug', 'task', 'user_story', 'test_case'];

const TRACKER_LABELS: Record<TrackerType, string> = {
    bug: 'Bug',
    task: 'Task',
    user_story: 'User Story',
    test_case: 'Test Case',
};

const TRACKER_COLORS: Record<TrackerType, string> = {
    bug: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
    task: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    user_story: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    test_case: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
};

const QC_STATUSES = ['Backlog', 'In Progress', 'Done', 'Cancelled'];

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function TuleapSettingsPage() {
    const [configs, setConfigs] = useState<TuleapSyncConfig[]>([]);
    const [projects, setProjects] = useState<ProjectOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Connection settings
    const [baseUrl, setBaseUrl] = useState('');
    const [accessKey, setAccessKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [testTrackerId, setTestTrackerId] = useState('');
    const [testingConn, setTestingConn] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

    // New mapping form
    const [showAddForm, setShowAddForm] = useState(false);
    const [newQcProject, setNewQcProject] = useState('');
    const [newTuleapProjectId, setNewTuleapProjectId] = useState('');
    const [newTrackerIds, setNewTrackerIds] = useState<Record<TrackerType, string>>({
        bug: '',
        task: '',
        user_story: '',
        test_case: '',
    });
    const [savingMapping, setSavingMapping] = useState(false);

    // Expanded tracker configs
    const [expandedProject, setExpandedProject] = useState<string | null>(null);

    // Field/status mapping editors
    const [editingFieldMap, setEditingFieldMap] = useState<string | null>(null);
    const [editingStatusMap, setEditingStatusMap] = useState<string | null>(null);
    const [fieldMapEdits, setFieldMapEdits] = useState<Record<string, string>>({});
    const [statusMapEdits, setStatusMapEdits] = useState<Record<string, string>>({});
    const [savingFieldMap, setSavingFieldMap] = useState(false);
    const [savingStatusMap, setSavingStatusMap] = useState(false);

    // Deleting
    const [deletingProject, setDeletingProject] = useState<string | null>(null);

    const showSuccessMsg = (msg: string) => {
        setSuccess(msg);
        setTimeout(() => setSuccess(null), 3500);
    };

    const showErrorMsg = (msg: string) => {
        setError(msg);
        setTimeout(() => setError(null), 5000);
    };

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [configRes, projData] = await Promise.all([
                tuleapConfigApi.list(),
                fetchApi<ApiProject[]>('/projects'),
            ]);
            const configList = configRes.data ?? (configRes as any);
            setConfigs(Array.isArray(configList) ? configList : []);
            setProjects(
                projData.map((p: ApiProject) => ({
                    id: p.id,
                    project_id: p.project_id,
                    project_name: p.project_name,
                }))
            );
        } catch (err: any) {
            showErrorMsg(err.message || 'Failed to load data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // ── Group configs by qc_project_id ────────────────────────────────────────
    const groupedMappings: GroupedMapping[] = React.useMemo(() => {
        const map: Record<string, TuleapSyncConfig[]> = {};
        for (const c of configs) {
            const key = c.qc_project_id;
            if (!map[key]) map[key] = [];
            map[key].push(c);
        }
        const result: GroupedMapping[] = [];
        for (const qcId of Object.keys(map)) {
            const proj = projects.find(
                (p) => p.id === qcId || p.project_id === qcId
            );
            result.push({
                qc_project_id: qcId,
                project_name: proj?.project_name || qcId,
                configs: map[qcId],
            });
        }
        return result;
    }, [configs, projects]);

    // ── Test Connection ───────────────────────────────────────────────────────
    const handleTestConnection = async () => {
        if (!testTrackerId) {
            showErrorMsg('Enter a Tracker ID to test');
            return;
        }
        setTestingConn(true);
        setTestResult(null);
        try {
            const res = await tuleapConfigApi.testConnection({
                tuleap_base_url: baseUrl || undefined,
                tuleap_tracker_id: Number(testTrackerId),
                access_key: accessKey || undefined,
            });
            const tracker = res.tracker;
            setTestResult({
                ok: true,
                msg: `Connected to "${tracker.name}" (${tracker.item_name}) — ${tracker.fields.length} fields detected`,
            });
        } catch (err: any) {
            setTestResult({ ok: false, msg: err.message || 'Connection failed' });
        } finally {
            setTestingConn(false);
        }
    };

    // ── Create mapping (4 tracker configs) ────────────────────────────────────
    const handleCreateMapping = async () => {
        if (!newQcProject) {
            showErrorMsg('Select a QC project');
            return;
        }
        if (!newTuleapProjectId) {
            showErrorMsg('Enter a Tuleap Project ID');
            return;
        }
        const hasAtLeastOne = TRACKER_TYPES.some((t) => newTrackerIds[t]);
        if (!hasAtLeastOne) {
            showErrorMsg('Enter at least one tracker ID');
            return;
        }
        setSavingMapping(true);
        try {
            const basePayload = {
                qc_project_id: newQcProject,
                tuleap_project_id: Number(newTuleapProjectId),
                tuleap_base_url: baseUrl || null,
            };
            for (const t of TRACKER_TYPES) {
                const tid = newTrackerIds[t];
                if (tid) {
                    await tuleapConfigApi.create({
                        ...basePayload,
                        tracker_type: t,
                        tuleap_tracker_id: Number(tid),
                    });
                }
            }
            showSuccessMsg('Mapping created successfully');
            setShowAddForm(false);
            setNewQcProject('');
            setNewTuleapProjectId('');
            setNewTrackerIds({ bug: '', task: '', user_story: '', test_case: '' });
            loadData();
        } catch (err: any) {
            showErrorMsg(err.message);
        } finally {
            setSavingMapping(false);
        }
    };

    // ── Delete all configs for a project ──────────────────────────────────────
    const confirmDeleteProject = async () => {
        if (!deletingProject) return;
        const group = groupedMappings.find(
            (g) => g.qc_project_id === deletingProject
        );
        if (!group) return;
        try {
            await Promise.all(
                group.configs.map((c) => tuleapConfigApi.delete(c.id))
            );
            showSuccessMsg('Mapping deleted');
            setDeletingProject(null);
            if (expandedProject === deletingProject) setExpandedProject(null);
            loadData();
        } catch (err: any) {
            showErrorMsg(err.message);
        }
    };

    // ── Open field mapping editor ─────────────────────────────────────────────
    const openFieldMapEditor = (config: TuleapSyncConfig) => {
        setEditingFieldMap(config.id);
        setFieldMapEdits({ ...config.artifact_fields });
        setEditingStatusMap(null);
    };

    const saveFieldMap = async (configId: string) => {
        setSavingFieldMap(true);
        try {
            await tuleapConfigApi.update(configId, {
                artifact_fields: fieldMapEdits,
            });
            showSuccessMsg('Field mappings saved');
            setEditingFieldMap(null);
            loadData();
        } catch (err: any) {
            showErrorMsg(err.message);
        } finally {
            setSavingFieldMap(false);
        }
    };

    // ── Open status map editor ────────────────────────────────────────────────
    const openStatusMapEditor = (config: TuleapSyncConfig) => {
        setEditingStatusMap(config.id);
        setStatusMapEdits({ ...config.status_value_map });
        setEditingFieldMap(null);
    };

    const saveStatusMap = async (configId: string) => {
        setSavingStatusMap(true);
        try {
            await tuleapConfigApi.update(configId, {
                status_value_map: statusMapEdits,
            });
            showSuccessMsg('Status map saved');
            setEditingStatusMap(null);
            loadData();
        } catch (err: any) {
            showErrorMsg(err.message);
        } finally {
            setSavingStatusMap(false);
        }
    };

    // ── Auto-detect fields ────────────────────────────────────────────────────
    const handleDiscover = async (config: TuleapSyncConfig) => {
        try {
            const res = await tuleapConfigApi.discover(config.tuleap_tracker_id);
            if (res.suggested_mappings && Object.keys(res.suggested_mappings).length > 0) {
                setFieldMapEdits((prev) => ({ ...prev, ...res.suggested_mappings }));
                showSuccessMsg(`Discovered ${Object.keys(res.suggested_mappings).length} field suggestions`);
            } else {
                showSuccessMsg('No field suggestions found');
            }
        } catch (err: any) {
            showErrorMsg(err.message);
        }
    };

    // ── Mapping row helpers ───────────────────────────────────────────────────
    const addFieldMapRow = () => {
        const keys = Object.keys(fieldMapEdits);
        const nextKey = `field_${keys.length + 1}`;
        setFieldMapEdits((prev) => ({ ...prev, [nextKey]: '' }));
    };

    const removeFieldMapRow = (key: string) => {
        setFieldMapEdits((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const updateFieldMapKey = (oldKey: string, newKey: string) => {
        setFieldMapEdits((prev) => {
            const entries = Object.entries(prev).map(([k, v]) =>
                k === oldKey ? [newKey, v] : [k, v]
            );
            return Object.fromEntries(entries);
        });
    };

    const updateFieldMapValue = (key: string, value: string) => {
        setFieldMapEdits((prev) => ({ ...prev, [key]: value }));
    };

    const addStatusMapRow = () => {
        const keys = Object.keys(statusMapEdits);
        const nextKey = `status_${keys.length + 1}`;
        setStatusMapEdits((prev) => ({ ...prev, [nextKey]: '' }));
    };

    const removeStatusMapRow = (key: string) => {
        setStatusMapEdits((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const updateStatusMapKey = (oldKey: string, newKey: string) => {
        setStatusMapEdits((prev) => {
            const entries = Object.entries(prev).map(([k, v]) =>
                k === oldKey ? [newKey, v] : [k, v]
            );
            return Object.fromEntries(entries);
        });
    };

    const updateStatusMapValue = (key: string, value: string) => {
        setStatusMapEdits((prev) => ({ ...prev, [key]: value }));
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="flex items-center gap-3 text-slate-500">
                    <svg className="animate-spin w-6 h-6" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading Tuleap configuration...
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
            {/* Sticky header */}
            <div className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur-md border-b border-white/10 px-6 py-4">
                <div className="max-w-6xl mx-auto flex items-center gap-4">
                    <Link
                        href="/settings"
                        className="text-slate-400 hover:text-white transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold">Tuleap Integration</h1>
                        <p className="text-xs text-slate-400">Manage Tuleap connection and field mappings</p>
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
                {/* Toast messages */}
                {(success || error) && (
                    <div className="fixed top-4 right-4 z-50 space-y-2">
                        {success && (
                            <div className="p-3 bg-emerald-900/60 border border-emerald-700/50 rounded-xl text-emerald-300 text-sm flex items-center gap-2 backdrop-blur-md shadow-lg">
                                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                {success}
                            </div>
                        )}
                        {error && (
                            <div className="p-3 bg-rose-900/60 border border-rose-700/50 rounded-xl text-rose-300 text-sm flex items-center gap-2 backdrop-blur-md shadow-lg">
                                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                {error}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Section 1: Connection Settings ── */}
                <div className="glass-card p-6">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                        <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                        Connection Settings
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Base URL</label>
                            <input
                                type="text"
                                value={baseUrl}
                                onChange={(e) => setBaseUrl(e.target.value)}
                                placeholder="https://tuleap.example.com"
                                className="w-full px-4 py-2.5 bg-slate-700/50 border border-white/10 rounded-xl text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Access Key</label>
                            <div className="relative">
                                <input
                                    type={showKey ? 'text' : 'password'}
                                    value={accessKey}
                                    onChange={(e) => setAccessKey(e.target.value)}
                                    placeholder="Tuleap API access key"
                                    className="w-full px-4 py-2.5 pr-12 bg-slate-700/50 border border-white/10 rounded-xl text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowKey(!showKey)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                                >
                                    {showKey ? (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="mt-4 flex items-end gap-3">
                        <div className="w-48">
                            <label className="block text-sm font-medium text-slate-300 mb-1">Tracker ID</label>
                            <input
                                type="number"
                                value={testTrackerId}
                                onChange={(e) => setTestTrackerId(e.target.value)}
                                placeholder="e.g. 123"
                                className="w-full px-4 py-2.5 bg-slate-700/50 border border-white/10 rounded-xl text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            />
                        </div>
                        <Button
                            variant="primary"
                            size="default"
                            onClick={handleTestConnection}
                            disabled={testingConn || !testTrackerId}
                        >
                            {testingConn ? 'Testing...' : 'Test Connection'}
                        </Button>
                    </div>
                    {testResult && (
                        <div className={`mt-3 p-3 rounded-xl text-sm flex items-center gap-2 ${
                            testResult.ok
                                ? 'bg-emerald-900/30 border border-emerald-700/50 text-emerald-300'
                                : 'bg-rose-900/30 border border-rose-700/50 text-rose-300'
                        }`}>
                            {testResult.ok ? (
                                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            ) : (
                                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            )}
                            {testResult.msg}
                        </div>
                    )}
                </div>

                {/* ── Section 2: Project Mappings ── */}
                <div className="glass-card p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                            Project Mappings
                        </h2>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                                setShowAddForm(true);
                                setNewQcProject('');
                                setNewTuleapProjectId('');
                                setNewTrackerIds({ bug: '', task: '', user_story: '', test_case: '' });
                            }}
                        >
                            + Add Mapping
                        </Button>
                    </div>

                    {groupedMappings.length === 0 && !showAddForm && (
                        <div className="py-10 text-center text-slate-400 text-sm">
                            <svg className="w-10 h-10 mx-auto mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                            No project mappings yet. Click "Add Mapping" to get started.
                        </div>
                    )}

                    {/* Mapping table */}
                    {groupedMappings.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-white/10">
                                        <th className="text-left py-3 px-3 text-slate-400 font-medium">QC Project</th>
                                        <th className="text-left py-3 px-3 text-slate-400 font-medium">Tuleap Project ID</th>
                                        <th className="text-left py-3 px-3 text-slate-400 font-medium">Trackers</th>
                                        <th className="text-right py-3 px-3 text-slate-400 font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {groupedMappings.map((group) => (
                                        <tr key={group.qc_project_id} className="border-b border-white/5 hover:bg-white/5">
                                            <td className="py-3 px-3 font-medium text-white">{group.project_name}</td>
                                            <td className="py-3 px-3 text-slate-300">
                                                {group.configs[0]?.tuleap_project_id || '—'}
                                            </td>
                                            <td className="py-3 px-3">
                                                <div className="flex flex-wrap gap-1.5">
                                                    {TRACKER_TYPES.map((t) => {
                                                        const cfg = group.configs.find((c) => c.tracker_type === t);
                                                        return (
                                                            <button
                                                                key={t}
                                                                onClick={() => setExpandedProject(
                                                                    expandedProject === group.qc_project_id
                                                                        ? null
                                                                        : group.qc_project_id
                                                                )}
                                                                className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${cfg ? TRACKER_COLORS[t] : 'bg-slate-700/50 text-slate-500 line-through'}`}
                                                            >
                                                                {TRACKER_LABELS[t]}
                                                                {cfg && (
                                                                    <span className="ml-1 opacity-60">#{cfg.tuleap_tracker_id}</span>
                                                                )}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                            <td className="py-3 px-3 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => setExpandedProject(
                                                            expandedProject === group.qc_project_id
                                                                ? null
                                                                : group.qc_project_id
                                                        )}
                                                        className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                                                    >
                                                        {expandedProject === group.qc_project_id ? 'Collapse' : 'Configure'}
                                                    </button>
                                                    <button
                                                        onClick={() => setDeletingProject(group.qc_project_id)}
                                                        className="text-xs text-rose-400 hover:text-rose-300 font-medium"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* ── Add mapping inline form ── */}
                    {showAddForm && (
                        <div className="mt-4 p-4 bg-slate-700/30 border border-white/10 rounded-xl space-y-4">
                            <h3 className="text-sm font-semibold text-white">New Mapping</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-300 mb-1">QC Project</label>
                                    <select
                                        value={newQcProject}
                                        onChange={(e) => setNewQcProject(e.target.value)}
                                        className="w-full px-3 py-2 bg-slate-700/50 border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="">Select a project...</option>
                                        {projects.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.project_name} ({p.project_id})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-300 mb-1">Tuleap Project ID</label>
                                    <input
                                        type="number"
                                        value={newTuleapProjectId}
                                        onChange={(e) => setNewTuleapProjectId(e.target.value)}
                                        placeholder="e.g. 42"
                                        className="w-full px-3 py-2 bg-slate-700/50 border border-white/10 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {TRACKER_TYPES.map((t) => (
                                    <div key={t}>
                                        <label className={`block text-xs font-medium mb-1 ${TRACKER_COLORS[t].split(' ').slice(1).join(' ')}`}>
                                            {TRACKER_LABELS[t]} Tracker ID
                                        </label>
                                        <input
                                            type="number"
                                            value={newTrackerIds[t]}
                                            onChange={(e) =>
                                                setNewTrackerIds((prev) => ({ ...prev, [t]: e.target.value }))
                                            }
                                            placeholder="e.g. 101"
                                            className="w-full px-3 py-2 bg-slate-700/50 border border-white/10 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowAddForm(false)}
                                    className="text-slate-300"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={handleCreateMapping}
                                    disabled={savingMapping}
                                >
                                    {savingMapping ? 'Saving...' : 'Create Mapping'}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Section 3: Tracker Configuration (expanded) ── */}
                {expandedProject && (() => {
                    const group = groupedMappings.find(
                        (g) => g.qc_project_id === expandedProject
                    );
                    if (!group) return null;
                    return (
                        <div className="space-y-4">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                Tracker Configuration — {group.project_name}
                            </h2>
                            {TRACKER_TYPES.map((t) => {
                                const config = group.configs.find((c) => c.tracker_type === t);
                                return (
                                    <div key={t} className="glass-card p-5">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${TRACKER_COLORS[t]}`}>
                                                    {TRACKER_LABELS[t]}
                                                </span>
                                                {config ? (
                                                    <span className="text-sm text-slate-300">
                                                        Tracker #{config.tuleap_tracker_id}
                                                        {config.is_active ? (
                                                            <span className="ml-2 text-emerald-400 text-xs">Active</span>
                                                        ) : (
                                                            <span className="ml-2 text-slate-500 text-xs">Inactive</span>
                                                        )}
                                                    </span>
                                                ) : (
                                                    <span className="text-sm text-slate-500">Not configured</span>
                                                )}
                                            </div>
                                            {config && (
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => openFieldMapEditor(config)}
                                                    >
                                                        Edit Field Mappings
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => openStatusMapEditor(config)}
                                                    >
                                                        Edit Status Map
                                                    </Button>
                                                </div>
                                            )}
                                        </div>

                                        {/* ── Section 4: Field Mapping Editor ── */}
                                        {editingFieldMap === config?.id && (
                                            <div className="mt-4 pt-4 border-t border-white/10">
                                                <div className="flex items-center justify-between mb-3">
                                                    <h4 className="text-sm font-semibold text-slate-200">Field Mappings</h4>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleDiscover(config)}
                                                        >
                                                            Auto-Detect
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={addFieldMapRow}
                                                        >
                                                            + Add Row
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs text-slate-400 font-medium px-1">
                                                        <span>Unified Field</span>
                                                        <span>Tuleap Field</span>
                                                        <span className="w-8" />
                                                    </div>
                                                    {Object.entries(fieldMapEdits).map(([key, value]) => (
                                                        <div key={key} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                                                            <input
                                                                type="text"
                                                                value={key}
                                                                onChange={(e) => updateFieldMapKey(key, e.target.value)}
                                                                className="px-3 py-1.5 bg-slate-700/50 border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-indigo-500"
                                                            />
                                                            <input
                                                                type="text"
                                                                value={value}
                                                                onChange={(e) => updateFieldMapValue(key, e.target.value)}
                                                                className="px-3 py-1.5 bg-slate-700/50 border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-indigo-500"
                                                            />
                                                            <button
                                                                onClick={() => removeFieldMapRow(key)}
                                                                className="text-rose-400 hover:text-rose-300 px-1"
                                                                title="Remove"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                            </button>
                                                        </div>
                                                    ))}
                                                    {Object.keys(fieldMapEdits).length === 0 && (
                                                        <p className="text-xs text-slate-500 py-2 text-center">No field mappings defined. Click "+ Add Row" or "Auto-Detect".</p>
                                                    )}
                                                </div>
                                                <div className="flex justify-end gap-2 mt-3">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setEditingFieldMap(null)}
                                                        className="text-slate-300"
                                                    >
                                                        Cancel
                                                    </Button>
                                                    <Button
                                                        variant="primary"
                                                        size="sm"
                                                        onClick={() => saveFieldMap(config.id)}
                                                        disabled={savingFieldMap}
                                                    >
                                                        {savingFieldMap ? 'Saving...' : 'Save Mappings'}
                                                    </Button>
                                                </div>
                                            </div>
                                        )}

                                        {/* ── Section 5: Status Value Map Editor ── */}
                                        {editingStatusMap === config?.id && (
                                            <div className="mt-4 pt-4 border-t border-white/10">
                                                <div className="flex items-center justify-between mb-3">
                                                    <h4 className="text-sm font-semibold text-slate-200">Status Value Map</h4>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={addStatusMapRow}
                                                    >
                                                        + Add Row
                                                    </Button>
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs text-slate-400 font-medium px-1">
                                                        <span>Tuleap Status</span>
                                                        <span>QC Status</span>
                                                        <span className="w-8" />
                                                    </div>
                                                    {Object.entries(statusMapEdits).map(([key, value]) => (
                                                        <div key={key} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                                                            <input
                                                                type="text"
                                                                value={key}
                                                                onChange={(e) => updateStatusMapKey(key, e.target.value)}
                                                                className="px-3 py-1.5 bg-slate-700/50 border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-indigo-500"
                                                            />
                                                            <select
                                                                value={value}
                                                                onChange={(e) => updateStatusMapValue(key, e.target.value)}
                                                                className="px-3 py-1.5 bg-slate-700/50 border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-indigo-500"
                                                            >
                                                                <option value="">Select status...</option>
                                                                {QC_STATUSES.map((s) => (
                                                                    <option key={s} value={s}>{s}</option>
                                                                ))}
                                                            </select>
                                                            <button
                                                                onClick={() => removeStatusMapRow(key)}
                                                                className="text-rose-400 hover:text-rose-300 px-1"
                                                                title="Remove"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                            </button>
                                                        </div>
                                                    ))}
                                                    {Object.keys(statusMapEdits).length === 0 && (
                                                        <p className="text-xs text-slate-500 py-2 text-center">No status mappings defined. Click "+ Add Row".</p>
                                                    )}
                                                </div>
                                                <div className="flex justify-end gap-2 mt-3">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setEditingStatusMap(null)}
                                                        className="text-slate-300"
                                                    >
                                                        Cancel
                                                    </Button>
                                                    <Button
                                                        variant="primary"
                                                        size="sm"
                                                        onClick={() => saveStatusMap(config.id)}
                                                        disabled={savingStatusMap}
                                                    >
                                                        {savingStatusMap ? 'Saving...' : 'Save Status Map'}
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}

                {/* ── Delete confirmation ── */}
                {deletingProject && (() => {
                    const group = groupedMappings.find(
                        (g) => g.qc_project_id === deletingProject
                    );
                    return (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                            <div className="glass-modal w-full max-w-md p-6 space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-full bg-rose-900/30 flex items-center justify-center shrink-0">
                                        <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-white">Delete Mapping</h3>
                                        <p className="text-sm text-slate-400 mt-1">
                                            Delete all Tuleap mappings for{' '}
                                            <span className="font-medium text-slate-200">"{group?.project_name || deletingProject}"</span>?
                                            This will remove {group?.configs.length || 0} tracker configuration(s).
                                        </p>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setDeletingProject(null)}
                                        className="text-slate-300"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={confirmDeleteProject}
                                    >
                                        Delete Mapping
                                    </Button>
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </div>
        </div>
    );
}
