'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { governanceApi } from '@/services/governanceApi';

interface QualityGateSettingsProps {
    projectId: string;
}

export function QualityGateSettings({ projectId }: QualityGateSettingsProps) {
    const [gates, setGates] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Form State
    const [minPassRate, setMinPassRate] = useState(95);
    const [maxDefects, setMaxDefects] = useState(0);
    const [minCoverage, setMinCoverage] = useState(80);

    useEffect(() => {
        loadGates();
    }, [projectId]);

    const loadGates = async () => {
        setLoading(true);
        try {
            const data = await governanceApi.getProjectGates(projectId);
            setGates(data);
            if (data) {
                setMinPassRate(data.min_pass_rate || 95);
                setMaxDefects(data.max_critical_defects || 0);
                setMinCoverage(data.min_test_coverage || 80);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const data = {
                project_id: projectId,
                min_pass_rate: minPassRate,
                max_critical_defects: maxDefects,
                min_test_coverage: minCoverage
            };
            await governanceApi.saveProjectGates(data);
            await loadGates(); // Reload to confirm
            alert('Quality Gates saved successfully!');
        } catch (err) {
            console.error(err);
            alert('Failed to save settings.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-4">Loading settings...</div>;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Quality Gate Configuration</CardTitle>
                <CardDescription>Define the minimum quality standards required for a Release to be approved.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Minimum Pass Rate (%)
                        </label>
                        <input
                            type="number"
                            value={minPassRate}
                            onChange={e => setMinPassRate(Number(e.target.value))}
                            className="w-full p-2 border border-slate-300 rounded-md dark:bg-slate-800 dark:border-slate-600"
                        />
                        <p className="text-xs text-slate-500">Percentage of tests that must pass.</p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Max Open Critical Defects
                        </label>
                        <input
                            type="number"
                            value={maxDefects}
                            onChange={e => setMaxDefects(Number(e.target.value))}
                            className="w-full p-2 border border-slate-300 rounded-md dark:bg-slate-800 dark:border-slate-600"
                        />
                        <p className="text-xs text-slate-500">Maximum allowed Blocking/Critical issues.</p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Minimum Test Coverage (%)
                        </label>
                        <input
                            type="number"
                            value={minCoverage}
                            onChange={e => setMinCoverage(Number(e.target.value))}
                            className="w-full p-2 border border-slate-300 rounded-md dark:bg-slate-800 dark:border-slate-600"
                        />
                        <p className="text-xs text-slate-500">Ratio of requirements covered by tests.</p>
                    </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-700">
                    <Button onClick={handleSave} disabled={saving} variant="primary">
                        {saving ? 'Saving...' : 'Save Configuration'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
