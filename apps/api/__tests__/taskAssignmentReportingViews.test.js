'use strict';

const fs = require('fs');
const path = require('path');

const dbSource = fs.readFileSync(path.join(__dirname, '../src/config/db.js'), 'utf8');

function sourceAfter(marker) {
    const index = dbSource.indexOf(marker);
    expect(index).toBeGreaterThanOrEqual(0);
    return dbSource.slice(index);
}

describe('ADR 0009 reporting views', () => {
    test('final project/resource/dashboard views aggregate task effort from the assignment junction (#200)', () => {
        const block = sourceAfter('ADR 0009 / #200');

        expect(block).toMatch(/CREATE OR REPLACE VIEW v_projects_with_metrics[\s\S]*task_assignment_totals[\s\S]*FROM task_resource_assignment/);
        expect(block).toMatch(/CREATE OR REPLACE VIEW v_resources_with_utilization[\s\S]*FROM task_resource_assignment tra/);
        expect(block).toMatch(/CREATE OR REPLACE VIEW v_dashboard_metrics[\s\S]*task_assignment_totals[\s\S]*FROM task_resource_assignment/);
        expect(block).toMatch(/SUM\(COALESCE\(estimate_hrs, 0\)\)/);
        expect(block).toMatch(/SUM\(COALESCE\(actual_hrs, 0\)\)/);
        expect(block).not.toMatch(/COALESCE\(t\.r1_estimate_hrs, 0\) \+ COALESCE\(t\.r2_estimate_hrs, 0\)/);
        expect(block).not.toMatch(/COALESCE\(t\.r1_actual_hrs, 0\) \+ COALESCE\(t\.r2_actual_hrs, 0\)/);
    });

    test('v_tasks_with_metrics exposes totals from assignment rollups while preserving legacy columns (#200)', () => {
        const block = sourceAfter('CREATE OR REPLACE VIEW v_tasks_with_metrics AS');

        expect(block).toMatch(/WITH task_assignment_totals AS[\s\S]*FROM task_resource_assignment/);
        expect(block).toMatch(/t\.r1_estimate_hrs/);
        expect(block).toMatch(/t\.r2_estimate_hrs/);
        expect(block).toMatch(/COALESCE\(tat\.total_estimated_hrs, 0\) AS total_estimated_hrs/);
        expect(block).toMatch(/COALESCE\(tat\.total_actual_hrs, 0\) AS total_actual_hrs/);
        expect(block).not.toMatch(/COALESCE\(t\.r1_estimate_hrs, 0\) \+ COALESCE\(t\.r2_estimate_hrs, 0\) AS total_estimated_hrs/);
    });
});
