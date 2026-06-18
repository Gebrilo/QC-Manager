'use strict';

const fs = require('fs');
const path = require('path');

const dbSource = fs.readFileSync(path.join(__dirname, '../src/config/db.js'), 'utf8');

function indexOfOrThrow(source, needle) {
    const index = source.indexOf(needle);
    expect(index).toBeGreaterThanOrEqual(0);
    return index;
}

describe('test_case migration order', () => {
    test('adds access columns to singular test_case before recreating v_test_case_summary', () => {
        const viewIndex = indexOfOrThrow(dbSource, 'CREATE OR REPLACE VIEW v_test_case_summary AS');

        for (const column of ['created_by_user_id', 'owner_team_id', 'visibility_scope']) {
            const ddlIndex = indexOfOrThrow(
                dbSource,
                `ALTER TABLE test_case ADD COLUMN IF NOT EXISTS ${column}`
            );
            expect(ddlIndex).toBeLessThan(viewIndex);
        }
    });

    test('access-engine migration loops include the active singular test_case table', () => {
        const loops = (dbSource.match(/FOREACH artifact_table IN ARRAY ARRAY\[[^\]]+\]/g) || [])
            .filter(loop => loop.includes("'bugs','tasks'") && loop.includes("'user_stories'"));

        expect(loops.length).toBeGreaterThanOrEqual(2);
        for (const loop of loops) {
            expect(loop).toContain("'test_case'");
        }
    });

    test('latest test results view exposes display test case ID separately from UUID', () => {
        const viewIndex = indexOfOrThrow(dbSource, 'CREATE VIEW v_latest_test_results AS');
        const viewEndIndex = indexOfOrThrow(dbSource.slice(viewIndex), 'ORDER BY tr.project_id');
        const viewSource = dbSource.slice(viewIndex, viewIndex + viewEndIndex);

        expect(viewSource).toContain('te.test_case_id AS test_case_uuid');
        expect(viewSource).toContain('COALESCE(tc.test_case_id, te.test_case_id::text) AS test_case_id');
        expect(viewSource).toContain('LEFT JOIN test_case tc ON te.test_case_id = tc.id');
        expect(viewSource).not.toContain('te.test_case_id::text AS test_case_id');
    });
});
