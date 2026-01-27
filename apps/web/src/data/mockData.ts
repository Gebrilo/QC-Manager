import { Project, Task } from '../types';

export const MOCK_PROJECTS: Project[] = [
    {
        id: 'prj-alpha',
        project_id: 'WEB-001',
        name: 'Web Platform Revamp',
        description: 'Modernizing the legacy web application with Next.js',
        priority: 'High',
        total_weight: 100,
        status: 'active',
        dynamic_status: 'On Track',
        overall_completion_pct: 85
    },
    {
        id: 'prj-beta',
        project_id: 'MOB-001',
        name: 'Mobile App Migration',
        description: 'Migrating native apps to React Native',
        priority: 'Medium',
        total_weight: 80,
        status: 'active',
        dynamic_status: 'At Risk',
        overall_completion_pct: 45
    },
    {
        id: 'prj-gamma',
        project_id: 'MKT-001',
        name: 'Marketing Website',
        description: 'Redesigning the corporate marketing site',
        priority: 'Low',
        total_weight: 40,
        status: 'active',
        dynamic_status: 'Completed',
        overall_completion_pct: 100
    },
    {
        id: 'prj-delta',
        project_id: 'LEG-001',
        name: 'Legacy Upgrade',
        description: 'Upgrading backend services',
        priority: 'High',
        total_weight: 90,
        status: 'active',
        dynamic_status: 'Delayed',
        overall_completion_pct: 60
    },
    {
        id: 'prj-epsilon',
        project_id: 'AI-001',
        name: 'AI Integration',
        description: 'Integrating LLM capabilities',
        priority: 'High',
        total_weight: 95,
        status: 'active',
        dynamic_status: 'On Track',
        overall_completion_pct: 75
    }
];

export const MOCK_TASKS: Task[] = [
    // Project Alpha
    { id: 't-101', task_id: 'WEB-101', project_id: 'prj-alpha', task_name: 'Implement OAuth2 Authentication', status: 'Done', priority: 'High', resource1_uuid: 'res-1', resource1_name: 'Elena Fisher', project_name: 'Web Platform Revamp', r1_estimate_hrs: 16, r1_actual_hrs: 14, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 16, total_actual_hrs: 14 },
    { id: 't-102', task_id: 'WEB-102', project_id: 'prj-alpha', task_name: 'Dashboard Analytics Integration', status: 'In Progress', priority: 'High', resource1_uuid: 'res-2', resource1_name: 'Marcus Chen', project_name: 'Web Platform Revamp', r1_estimate_hrs: 24, r1_actual_hrs: 10, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 24, total_actual_hrs: 10 },
    { id: 't-103', task_id: 'WEB-103', project_id: 'prj-alpha', task_name: 'User Profile Settings', status: 'Done', priority: 'Medium', resource1_uuid: 'res-3', resource1_name: 'Sarah Jones', project_name: 'Web Platform Revamp', r1_estimate_hrs: 8, r1_actual_hrs: 9, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 8, total_actual_hrs: 9 },

    // Project Beta
    { id: 't-201', task_id: 'MOB-201', project_id: 'prj-beta', task_name: 'Initial Scaffolding Setup', status: 'Done', priority: 'High', resource1_uuid: 'res-4', resource1_name: 'David Kim', project_name: 'Mobile App Migration', r1_estimate_hrs: 4, r1_actual_hrs: 3, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 4, total_actual_hrs: 3 },
    { id: 't-202', task_id: 'MOB-202', project_id: 'prj-beta', task_name: 'Login Screen UI', status: 'In Progress', priority: 'Medium', resource1_uuid: 'res-4', resource1_name: 'David Kim', project_name: 'Mobile App Migration', r1_estimate_hrs: 8, r1_actual_hrs: 5, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 8, total_actual_hrs: 5 },
    { id: 't-203', task_id: 'MOB-203', project_id: 'prj-beta', task_name: 'Offline Storage implementation', status: 'Backlog', priority: 'High', resource1_uuid: 'res-2', resource1_name: 'Marcus Chen', project_name: 'Mobile App Migration', r1_estimate_hrs: 16, r1_actual_hrs: 0, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 16, total_actual_hrs: 0 },

    // Project Gamma
    { id: 't-301', task_id: 'MKT-301', project_id: 'prj-gamma', task_name: 'Landing Page Design', status: 'Done', priority: 'High', resource1_uuid: 'res-5', resource1_name: 'Alex Morgan', project_name: 'Marketing Website', r1_estimate_hrs: 10, r1_actual_hrs: 10, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 10, total_actual_hrs: 10 },
    { id: 't-302', task_id: 'MKT-302', project_id: 'prj-gamma', task_name: 'SEO Optimization', status: 'Done', priority: 'Medium', resource1_uuid: 'res-5', resource1_name: 'Alex Morgan', project_name: 'Marketing Website', r1_estimate_hrs: 6, r1_actual_hrs: 7, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 6, total_actual_hrs: 7 },

    // Project Delta
    { id: 't-401', task_id: 'LEG-401', project_id: 'prj-delta', task_name: 'Database Schema Audit', status: 'Done', priority: 'High', resource1_uuid: 'res-2', resource1_name: 'Marcus Chen', project_name: 'Legacy Upgrade', r1_estimate_hrs: 12, r1_actual_hrs: 12, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 12, total_actual_hrs: 12 },
    { id: 't-402', task_id: 'LEG-402', project_id: 'prj-delta', task_name: 'Data Migration Scripts', status: 'In Progress', priority: 'High', resource1_uuid: 'res-2', resource1_name: 'Marcus Chen', project_name: 'Legacy Upgrade', r1_estimate_hrs: 20, r1_actual_hrs: 15, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 20, total_actual_hrs: 15 },

    // Project Epsilon
    { id: 't-501', task_id: 'AI-501', project_id: 'prj-epsilon', task_name: 'Model Selection POC', status: 'In Progress', priority: 'High', resource1_uuid: 'res-1', resource1_name: 'Elena Fisher', project_name: 'AI Integration', r1_estimate_hrs: 40, r1_actual_hrs: 32, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 40, total_actual_hrs: 32 },
];
