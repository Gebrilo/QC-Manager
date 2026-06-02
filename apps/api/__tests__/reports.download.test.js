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
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation Error', details: err.errors });
    }
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

  it('generates dashboard JSON report inline and does not call n8n', async () => {
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
      .send({ report_type: 'dashboard', format: 'json' });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(mockTriggerWorkflow).not.toHaveBeenCalled();
    const updateCall = mockQuery.mock.calls.find((c) => String(c[0]).includes('UPDATE report_jobs'));
    expect(updateCall).toBeDefined();
    expect(updateCall[1][0]).toBe('completed');
  });

  it('records PDF generation without server rendering', async () => {
    mockQuery.mockImplementation((sql) => {
      if (String(sql).includes('INSERT INTO report_jobs')) {
        return Promise.resolve({ rows: [] });
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
    expect(mockTriggerWorkflow).not.toHaveBeenCalled();
    const updateCall = mockQuery.mock.calls.find((c) => String(c[0]).includes('UPDATE report_jobs'));
    expect(updateCall).toBeDefined();
    expect(updateCall[1][0]).toBeDefined();
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

describe('POST /reports/share', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stores a PDF attachment and sends through the system email workflow', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp())
      .post('/reports/share')
      .send({
        report_id: 'readiness',
        report_name: 'Release Readiness',
        report_type: 'dashboard',
        format: 'pdf',
        recipients: ['Lead@QC.IO'],
        share_url: 'https://gerbil.qc/quality/reports?report=readiness',
        attach_export: true,
        attachment: {
          filename: 'release-readiness.pdf',
          mime_type: 'application/pdf',
          content_base64: Buffer.from('PDF bytes').toString('base64'),
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.recipients).toEqual(['lead@qc.io']);
    expect(res.body.data.attachment_download_url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/reports\/[-0-9a-f]+\/download$/);
    expect(res.body.data.email_href).toContain('mailto:lead%40qc.io');
    expect(res.body.data.email_body).toContain('View report: https://gerbil.qc/quality/reports?report=readiness');
    expect(res.body.data.email_body).toContain('/download');

    const insertCall = mockQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO report_jobs'));
    expect(insertCall).toBeDefined();
    expect(insertCall[1][1]).toBe('dashboard');
    expect(insertCall[1][2]).toBe('pdf');
    expect(insertCall[1][3]).toBe('completed');
    expect(insertCall[1][6]).toBe('inline');
    expect(insertCall[1][7]).toBe('release-readiness.pdf');
    expect(insertCall[1][8]).toBe(9);
    expect(insertCall[1][9]).toBe('no-reply@gerbil.qc');

    expect(mockTriggerWorkflow).toHaveBeenCalledWith('share-report', expect.objectContaining({
      report_id: 'readiness',
      recipients: ['lead@qc.io'],
      from_email: 'no-reply@gerbil.qc',
      delivery_channel: 'system_email',
      attachment_download_url: res.body.data.attachment_download_url,
      attachment: expect.objectContaining({
        filename: 'release-readiness.pdf',
        mime_type: 'application/pdf',
      }),
    }), { strict: true });
  });

  it('rejects share requests without recipients', async () => {
    const res = await request(makeApp())
      .post('/reports/share')
      .send({
        report_id: 'readiness',
        report_name: 'Release Readiness',
        report_type: 'dashboard',
        format: 'pdf',
        recipients: [],
        share_url: 'https://gerbil.qc/quality/reports?report=readiness',
        attach_export: false,
      });

    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockTriggerWorkflow).not.toHaveBeenCalled();
  });
});
