const request = require('supertest');
const express = require('express');
const { Readable } = require('stream');

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: (...args) => mockQuery(...args) }));
jest.mock('../src/middleware/authMiddleware', () => ({
  requireAuth: (req, _res, next) => next(),
  requirePermission: () => (req, _res, next) => next(),
}));

const mockAxiosGet = jest.fn();
jest.mock('axios', () => ({
  get: (...args) => mockAxiosGet(...args),
}));

const mockTriggerWorkflow = jest.fn();
jest.mock('../src/utils/n8n', () => ({
  triggerWorkflow: (...args) => mockTriggerWorkflow(...args),
}));

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/reports', require('../src/routes/reports'));
  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: err.message });
  });
  return app;
}

describe('GET /reports/:job_id/download', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 404 when report job does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp()).get('/reports/job-1/download');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Report job not found');
  });

  it('returns 409 when report is not completed', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'job-1', status: 'processing', download_url: null, format: 'pdf', filename: null }],
    });

    const res = await request(makeApp()).get('/reports/job-1/download');

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Report is not ready for download');
  });

  it('streams downloaded file through API when report is completed', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'job-1',
        status: 'completed',
        download_url: 'https://files.example.com/r1.pdf',
        format: 'pdf',
        filename: 'release-report.pdf',
      }],
    });

    const upstreamStream = Readable.from(['PDF DATA']);
    mockAxiosGet.mockResolvedValueOnce({
      data: upstreamStream,
      headers: {
        'content-type': 'application/pdf',
        'content-length': '8',
      },
    });

    const res = await request(makeApp()).get('/reports/job-1/download');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="release-report.pdf"');
    expect(res.headers['content-length']).toBe('8');
    expect(res.body.toString()).toBe('PDF DATA');
    expect(mockAxiosGet).toHaveBeenCalledWith('https://files.example.com/r1.pdf', expect.objectContaining({
      responseType: 'stream',
    }));
  });

  it('returns inline generated report content when stored in result_data', async () => {
    const inlinePayload = Buffer.from('inline file bytes').toString('base64');
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'job-inline',
        status: 'completed',
        download_url: 'inline',
        format: 'pdf',
        filename: null,
        result_data: {
          inline_file_base64: inlinePayload,
          mime_type: 'application/pdf',
          filename: 'dashboard-report.pdf',
          file_size: 17,
        },
      }],
    });

    const res = await request(makeApp()).get('/reports/job-inline/download');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="dashboard-report.pdf"');
    expect(res.headers['content-length']).toBe('17');
    expect(res.body.toString()).toBe('inline file bytes');
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });
});

describe('GET /reports/:job_id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns API-hosted download_url when source URL exists', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'job-9',
        report_type: 'dashboard',
        format: 'pdf',
        status: 'completed',
        download_url: 'https://external-storage.example.com/final.pdf',
        filename: 'final.pdf',
        file_size: '12345',
        error_message: null,
        filters: null,
        created_at: '2026-06-01T00:00:00.000Z',
        completed_at: '2026-06-01T00:01:00.000Z',
      }],
    });

    const res = await request(makeApp()).get('/reports/job-9');

    expect(res.status).toBe(200);
    expect(res.body.data.download_url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/reports\/job-9\/download$/);
  });
});

describe('POST /reports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generates dashboard report inline and does not call n8n', async () => {
    mockQuery.mockImplementation((sql) => {
      if (String(sql).includes('INSERT INTO report_jobs')) {
        return Promise.resolve({ rows: [] });
      }
      if (String(sql).includes('SELECT * FROM v_dashboard_metrics')) {
        return Promise.resolve({ rows: [{ total_tasks: 5, tasks_done: 3 }] });
      }
      if (String(sql).includes('UPDATE report_jobs')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(makeApp())
      .post('/reports')
      .send({ report_type: 'dashboard', format: 'pdf' });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(mockTriggerWorkflow).not.toHaveBeenCalled();
    const updateCall = mockQuery.mock.calls.find((c) => String(c[0]).includes('UPDATE report_jobs'));
    expect(updateCall).toBeDefined();
    expect(updateCall[1][0]).toBe('completed');
  });

  it('renders PDF from the provided Report Studio presentation model', async () => {
    mockQuery.mockImplementation((sql) => {
      if (String(sql).includes('INSERT INTO report_jobs')) {
        return Promise.resolve({ rows: [] });
      }
      if (String(sql).includes('SELECT * FROM v_dashboard_metrics')) {
        return Promise.resolve({ rows: [{ total_tasks: 5, tasks_done: 3 }] });
      }
      if (String(sql).includes('UPDATE report_jobs')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(makeApp())
      .post('/reports')
      .send({
        report_type: 'dashboard',
        format: 'pdf',
        presentation: {
          report_id: 'readiness',
          name: 'Release Readiness',
          category: 'Governance',
          generated_label: 'Jun 2, 2026, 07:15 AM',
          range: 'Last 7 days',
          project: 'All projects',
          summary: 'Three projects carry critical blocking defects.',
          summary_tone: 'atrisk',
          kpis: [
            { label: 'Projects assessed', value: '8', sub: '3 blocked' },
            { label: 'Avg pass rate', value: '71%', sub: 'vs 85% gate' },
            { label: 'Open blockers', value: '12', sub: 'across 3 projects' },
          ],
          chart: {
            title: 'Pass rate by project',
            unit: '%',
            bars: [
              { label: 'AUTH', value: 94, status: 'complete' },
              { label: 'CST', value: 41, status: 'atrisk' },
            ],
          },
          columns: ['Project', 'Status', 'Pass rate', 'Blockers', 'Recommendation'],
          rows: [
            { c: ['CST'], status: 'atrisk', rate: 41, defects: 5, rec: 'Block release' },
            { c: ['AUTH'], status: 'complete', rate: 94, defects: 0, rec: 'Approve release' },
          ],
          gauge: { value: 71, label: 'Avg pass rate', caption: 'Below 85% gate' },
        },
      });

    expect(res.status).toBe(202);
    const updateCall = mockQuery.mock.calls.find((c) => String(c[0]).includes('UPDATE report_jobs'));
    const resultData = JSON.parse(updateCall[1][1]);
    const pdfText = Buffer.from(resultData.inline_file_base64, 'base64').toString('utf8');

    expect(resultData.filename).toMatch(/^release-readiness-\d+\.pdf$/);
    expect(pdfText).toContain('Release Readiness');
    expect(pdfText).toContain('EXECUTIVE SUMMARY');
    expect(pdfText).toContain('DETAIL BREAKDOWN');
    expect(pdfText).toContain('Three projects carry critical blocking defects.');
    expect(pdfText).not.toContain('Rows: 1');
  });

  it('generates project_status report inline and does not call n8n', async () => {
    mockQuery.mockImplementation((sql) => {
      if (String(sql).includes('INSERT INTO report_jobs')) {
        return Promise.resolve({ rows: [] });
      }
      if (String(sql).includes('SELECT * FROM v_projects_with_metrics')) {
        return Promise.resolve({ rows: [{ project_name: 'Core', completion_pct: 91 }] });
      }
      if (String(sql).includes('UPDATE report_jobs')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(makeApp())
      .post('/reports')
      .send({ report_type: 'project_status', format: 'xlsx' });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(mockTriggerWorkflow).not.toHaveBeenCalled();
    const updateCall = mockQuery.mock.calls.find((c) => String(c[0]).includes('UPDATE report_jobs'));
    expect(updateCall).toBeDefined();
    expect(updateCall[1][0]).toBe('completed');
  });
});
