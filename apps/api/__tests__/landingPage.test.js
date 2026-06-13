'use strict';

const mockQuery = jest.fn();

jest.mock('../src/config/db', () => ({
    query: (...args) => mockQuery(...args),
    pool: { query: (...args) => mockQuery(...args) },
}));

jest.mock('../src/middleware/authMiddleware', () => ({
    requireAuth: (req, res, next) => {
        if (req.headers.authorization !== 'Bearer valid') {
            return res.status(401).json({ error: 'Authentication required' });
        }
        req.user = { id: 'admin-1', email: 'admin@example.com', role: 'admin', active: true, status: 'ACTIVE' };
        next();
    },
    requirePermission: () => (req, res, next) => {
        if (req.headers['x-deny-permission']) {
            return res.status(403).json({ error: 'You do not have permission to perform this action' });
        }
        next();
    },
}));

jest.mock('../src/middleware/audit', () => ({
    auditLog: jest.fn(),
}));

const express = require('express');
const request = require('supertest');

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/public/landing-page', require('../src/routes/publicLandingPage'));
    app.use('/admin/landing-page', require('../src/routes/adminLandingPage'));
    app.use('/webhooks/landing-content', require('../src/routes/landingContentWebhooks'));
    app.use((err, _req, res, _next) => {
        res.status(500).json({ error: err.message });
    });
    return app;
}

beforeEach(() => {
    process.env.QC_AGENT_WEBHOOK_SECRET = 'top-secret';
    mockQuery.mockReset();
});

describe('landing page APIs', () => {
    test('GET /public/landing-page returns only public landing content', async () => {
        mockQuery
            .mockResolvedValueOnce({
                rows: [{
                    id: 'cfg-1',
                    hero_title: 'QC Manager',
                    hero_subtitle: 'Quality overview',
                    hero_cta_label: 'Sign in',
                    hero_cta_url: '/login',
                    hero_secondary_cta_label: 'Register',
                    hero_secondary_cta_url: '/register',
                    marketing_intro_title: 'Overview',
                    marketing_intro_description: 'Public copy',
                    show_features: true,
                    show_roadmap: true,
                    show_changelog: true,
                    show_footer_cta: true,
                    footer_cta_title: 'Start',
                    footer_cta_description: 'Open the app',
                    footer_cta_label: 'Open',
                    footer_cta_url: '/login',
                    is_public: true,
                    created_by: 'admin@example.com',
                }],
            })
            .mockResolvedValueOnce({ rows: [{ id: 'f1', title: 'Feature', description: 'Desc', icon_key: 'shield', display_order: 1, created_by: 'admin@example.com' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'r1', title: 'Roadmap', description: 'Desc', status: 'planned', priority: 'medium', display_order: 1, target_date: null, completion_date: null, created_by: 'admin@example.com' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'c1', version_number: 'v1', title: 'Release', content_markdown: '### Added', published_at: '2026-06-13T10:00:00Z', generated_by_ai: true, source: 'n8n', created_by: 'admin@example.com' }] });

        const res = await request(makeApp()).get('/public/landing-page');

        expect(res.status).toBe(200);
        expect(res.body.config).toMatchObject({ hero_title: 'QC Manager', is_public: true });
        expect(res.body.config.created_by).toBeUndefined();
        expect(res.body.features[0].created_by).toBeUndefined();
        expect(res.body.roadmap_items[0].created_by).toBeUndefined();
        expect(res.body.changelog_entries[0].created_by).toBeUndefined();

        const sql = mockQuery.mock.calls.map(([query]) => query).join('\n');
        expect(sql).toMatch(/WHERE is_active = true/i);
        expect(sql).toMatch(/WHERE is_public = true/i);
        expect(sql).toMatch(/WHERE is_published = true/i);
    });

    test('admin config endpoint requires authentication', async () => {
        const res = await request(makeApp()).get('/admin/landing-page/config');

        expect(res.status).toBe(401);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('webhook rejects missing or invalid agent secret', async () => {
        const missing = await request(makeApp())
            .post('/webhooks/landing-content/changelog')
            .send({ title: 'Release', content_markdown: '### Added' });
        expect(missing.status).toBe(401);

        const invalid = await request(makeApp())
            .post('/webhooks/landing-content/changelog')
            .set('x-qc-agent-secret', 'wrong')
            .send({ title: 'Release', content_markdown: '### Added' });
        expect(invalid.status).toBe(401);
    });

    test('webhook accepts a valid changelog payload and logs it', async () => {
        mockQuery
            .mockResolvedValueOnce({
                rows: [{
                    id: 'changelog-1',
                    version_number: 'v1.4.0',
                    title: 'Release v1.4.0',
                    published_at: '2026-06-13T10:00:00Z',
                    is_published: true,
                    generated_by_ai: true,
                    source: 'n8n',
                    source_reference: 'workflow-1',
                }],
            })
            .mockResolvedValue({ rows: [] });

        const res = await request(makeApp())
            .post('/webhooks/landing-content/changelog')
            .set('x-qc-agent-secret', 'top-secret')
            .send({
                version_number: 'v1.4.0',
                title: 'Release v1.4.0',
                content_markdown: '### Added\n- New dashboard widgets',
                published_at: '2026-06-13T10:00:00Z',
                source: 'n8n',
                source_reference: 'workflow-1',
            });

        expect(res.status).toBe(201);
        expect(res.body.changelog_entry).toMatchObject({ id: 'changelog-1', title: 'Release v1.4.0' });
        expect(mockQuery.mock.calls.some(([sql]) => sql.includes('INSERT INTO changelog_entries'))).toBe(true);
        expect(mockQuery.mock.calls.some(([sql]) => sql.includes('INSERT INTO ai_content_generation_logs'))).toBe(true);
    });

    test('roadmap status validation rejects unsupported values', async () => {
        const res = await request(makeApp())
            .post('/admin/landing-page/roadmap')
            .set('Authorization', 'Bearer valid')
            .send({
                title: 'Bad status',
                description: 'Should fail',
                status: 'blocked',
                priority: 'medium',
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Validation failed');
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('admin changelog update can publish and unpublish entries', async () => {
        const existing = {
            id: 'entry-1',
            title: 'Release',
            content_markdown: '### Added',
            is_published: true,
            generated_by_ai: false,
            source: 'manual',
        };
        const updated = { ...existing, is_published: false };
        mockQuery
            .mockResolvedValueOnce({ rows: [existing] })
            .mockResolvedValueOnce({ rows: [updated] });

        const res = await request(makeApp())
            .put('/admin/landing-page/changelog/entry-1')
            .set('Authorization', 'Bearer valid')
            .send({ is_published: false });

        expect(res.status).toBe(200);
        expect(res.body.is_published).toBe(false);
        const updateCall = mockQuery.mock.calls.find(([sql]) => sql.includes('UPDATE changelog_entries'));
        expect(updateCall).toBeTruthy();
        expect(updateCall[1]).toContain(false);
    });
});
