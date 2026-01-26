'use client';
import { useState, useEffect } from 'react';
import axios from 'axios';

export default function TaskModal({ isOpen, onClose, task, projects, resources, onSave }) {
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        project_id: '',
        assigned_resource_id: '',
        status: 'pending'
    });

    useEffect(() => {
        if (task) {
            setFormData({
                title: task.title,
                description: task.description || '',
                project_id: task.project_id,
                assigned_resource_id: task.assigned_resource_id || '',
                status: task.status
            });
        } else {
            setFormData({
                title: '',
                description: '',
                project_id: projects[0]?.id || '',
                assigned_resource_id: '',
                status: 'pending'
            });
        }
    }, [task, isOpen, projects]);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 modal-overlay flex items-center justify-center z-50">
            <div className="bg-white rounded-lg w-full max-w-md p-6">
                <h2 className="text-xl font-bold mb-4">{task ? 'Edit Task' : 'Create Task'}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">

                    <div>
                        <label className="block text-sm font-medium">Title</label>
                        <input
                            className="w-full border p-2 rounded"
                            value={formData.title}
                            onChange={e => setFormData({ ...formData, title: e.target.value })}
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium">Project</label>
                        <select
                            className="w-full border p-2 rounded"
                            value={formData.project_id}
                            onChange={e => setFormData({ ...formData, project_id: e.target.value })}
                            required
                        >
                            <option value="">Select Project</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium">Assigned Resource</label>
                        <select
                            className="w-full border p-2 rounded"
                            value={formData.assigned_resource_id}
                            onChange={e => setFormData({ ...formData, assigned_resource_id: e.target.value })}
                        >
                            <option value="">Unassigned</option>
                            {resources.map(r => (
                                <option key={r.id} value={r.id}>{r.name} ({r.role})</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium">Description</label>
                        <textarea
                            className="w-full border p-2 rounded"
                            value={formData.description}
                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                            rows={3}
                        />
                    </div>

                    {task && (
                        <div>
                            <label className="block text-sm font-medium">Status</label>
                            <select
                                className="w-full border p-2 rounded"
                                value={formData.status}
                                onChange={e => setFormData({ ...formData, status: e.target.value })}
                            >
                                <option value="pending">Pending</option>
                                <option value="in_progress">In Progress</option>
                                <option value="review">Review</option>
                                <option value="completed">Completed</option>
                                <option value="cancelled">Cancelled</option>
                            </select>
                        </div>
                    )}

                    <div className="flex justify-end gap-2 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">
                            Cancel
                        </button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                            Save
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}
