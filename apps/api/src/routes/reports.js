const express = require('express');
const router = express.Router();
const db = require('../config/db');
const axios = require('axios');
const { z } = require('zod');
const { triggerWorkflow } = require('../utils/n8n');
const { v4: uuidv4 } = require('uuid');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');
const XLSX = require('xlsx');

const FORMAT_MIME = {
    pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
    json: 'application/json',
};

const REPORT_SQL_BY_TYPE = {
    dashboard: 'SELECT * FROM v_dashboard_metrics',
    project_status: 'SELECT * FROM v_projects_with_metrics ORDER BY created_at DESC',
    resource_utilization: 'SELECT * FROM v_resources_with_utilization ORDER BY resource_name ASC',
    task_export: 'SELECT * FROM v_tasks_with_metrics ORDER BY created_at DESC',
    test_results: 'SELECT * FROM v_test_execution_trends ORDER BY execution_date DESC LIMIT 500',
};

const REPORT_LABELS_BY_TYPE = {
    dashboard: { name: 'Dashboard Summary', category: 'Governance' },
    project_status: { name: 'Project Status', category: 'Operational' },
    resource_utilization: { name: 'Resource Utilization', category: 'Operational' },
    task_export: { name: 'Task Export', category: 'Operational' },
    test_results: { name: 'Test Results', category: 'Operational' },
};

const PDF_STATUS = {
    complete: { label: 'On Track', color: '#10b981', fill: '#ecfdf5', text: '#047857' },
    ready: { label: 'Ready', color: '#10b981', fill: '#ecfdf5', text: '#047857' },
    ontrack: { label: 'Stable', color: '#3b82f6', fill: '#eff6ff', text: '#1d4ed8' },
    inprogress: { label: 'Watch', color: '#f59e0b', fill: '#fffbeb', text: '#b45309' },
    atrisk: { label: 'At Risk', color: '#f43f5e', fill: '#fff1f2', text: '#be123c' },
    generating: { label: 'Generating', color: '#f59e0b', fill: '#fffbeb', text: '#b45309' },
    failed: { label: 'Failed', color: '#f43f5e', fill: '#fff1f2', text: '#be123c' },
};

const PDF_SUMMARY_TONE = {
    complete: { fill: '#ecfdf5', stroke: '#a7f3d0', label: '#064e3b' },
    ontrack: { fill: '#eff6ff', stroke: '#bfdbfe', label: '#1e3a8a' },
    inprogress: { fill: '#fffbeb', stroke: '#fde68a', label: '#78350f' },
    atrisk: { fill: '#fff1f2', stroke: '#fecdd3', label: '#881337' },
};

function serializeCell(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function rowsToCsv(rows) {
    if (!rows.length) {
        return 'message\nNo data available\n';
    }

    const headers = Object.keys(rows[0]);
    const escape = (raw) => {
        const v = serializeCell(raw);
        if (v.includes(',') || v.includes('"') || v.includes('\n')) {
            return `"${v.replace(/"/g, '""')}"`;
        }
        return v;
    };

    const lines = [headers.join(',')];
    for (const row of rows) {
        lines.push(headers.map((h) => escape(row[h])).join(','));
    }
    return `${lines.join('\n')}\n`;
}

function escapePdfText(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function hexToRgb01(hex) {
    const clean = String(hex || '#000000').replace('#', '');
    const n = parseInt(clean.length === 3
        ? clean.split('').map((c) => c + c).join('')
        : clean, 16);
    return [
        ((n >> 16) & 255) / 255,
        ((n >> 8) & 255) / 255,
        (n & 255) / 255,
    ].map((v) => v.toFixed(3)).join(' ');
}

function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
}

function wrapText(value, maxChars) {
    const words = String(value || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';

    for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (next.length > maxChars && line) {
            lines.push(line);
            line = word;
        } else {
            line = next;
        }
    }

    if (line) lines.push(line);
    return lines.length ? lines : [''];
}

function truncateText(value, maxChars) {
    const s = String(value ?? '');
    return s.length > maxChars ? `${s.slice(0, Math.max(0, maxChars - 3))}...` : s;
}

function safeReportSlug(value) {
    return String(value || 'report')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        || 'report';
}

function drawPdfDocument(ops) {
    const content = ops.join('\n');
    const objects = {
        1: '<< /Type /Catalog /Pages 2 0 R >>',
        2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>',
        4: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        5: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
        6: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>',
        7: `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`,
    };

    let pdf = '%PDF-1.4\n';
    const offsets = [0];

    for (let i = 1; i <= 7; i++) {
        offsets[i] = Buffer.byteLength(pdf, 'utf8');
        pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
    }

    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += 'xref\n0 8\n0000000000 65535 f \n';
    for (let i = 1; i <= 7; i++) {
        pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdf, 'utf8');
}

function buildGenericPresentation(reportType, rows, generatedAt) {
    const labels = REPORT_LABELS_BY_TYPE[reportType] || REPORT_LABELS_BY_TYPE.dashboard;
    const columns = rows[0] ? Object.keys(rows[0]).slice(0, 5) : ['Metric', 'Status', 'Rate', 'Count', 'Note'];
    const tableRows = (rows.length ? rows : [{ message: 'No data available' }]).slice(0, 8).map((row, idx) => ({
        c: [serializeCell(row[columns[0]] ?? `Row ${idx + 1}`)],
        status: 'ontrack',
        rate: 100,
        defects: Number(row[columns[3]]) || 0,
        rec: serializeCell(row[columns[4]] ?? 'Included'),
    }));

    return {
        name: labels.name,
        category: labels.category,
        generated_label: generatedAt,
        range: 'Current data',
        project: 'All projects',
        summary: `${rows.length} row${rows.length === 1 ? '' : 's'} generated from ${labels.name}.`,
        summary_tone: 'ontrack',
        kpis: [
            { label: 'Rows exported', value: String(rows.length), sub: 'records' },
            { label: 'Format', value: 'PDF', sub: 'styled report' },
            { label: 'Source', value: labels.category, sub: 'report data' },
        ],
        chart: {
            title: 'Record distribution',
            unit: '',
            bars: tableRows.slice(0, 5).map((row, idx) => ({
                label: truncateText(row.c[0], 8) || `R${idx + 1}`,
                value: Math.max(1, Number(row.defects) || idx + 1),
                status: row.status,
            })),
        },
        columns: ['Item', 'Status', 'Rate', 'Count', 'Note'],
        rows: tableRows,
        gauge: { value: 100, label: 'Generated', caption: 'report ready' },
    };
}

function normalizePresentation(presentation, reportType, rows, generatedAt) {
    const fallback = buildGenericPresentation(reportType, rows, generatedAt);
    if (!presentation || typeof presentation !== 'object') return fallback;

    return {
        ...fallback,
        ...presentation,
        name: presentation.name || fallback.name,
        category: presentation.category || fallback.category,
        generated_label: presentation.generated_label || fallback.generated_label,
        summary_tone: presentation.summary_tone || presentation.summaryTone || fallback.summary_tone,
        kpis: Array.isArray(presentation.kpis) && presentation.kpis.length ? presentation.kpis.slice(0, 3) : fallback.kpis,
        chart: presentation.chart && Array.isArray(presentation.chart.bars) && presentation.chart.bars.length
            ? { ...presentation.chart, bars: presentation.chart.bars.slice(0, 8) }
            : fallback.chart,
        columns: Array.isArray(presentation.columns) && presentation.columns.length ? presentation.columns.slice(0, 5) : fallback.columns,
        rows: Array.isArray(presentation.rows) && presentation.rows.length ? presentation.rows.slice(0, 9) : fallback.rows,
        gauge: presentation.gauge || fallback.gauge,
    };
}

function buildStyledPdfBuffer(presentation) {
    const W = 612;
    const H = 792;
    const ops = [];
    const y = (top) => H - top;

    const rect = (x, top, w, h, fill, stroke = null, lineWidth = 1) => {
        const bottom = H - top - h;
        if (fill && stroke) {
            ops.push(`q ${hexToRgb01(fill)} rg ${hexToRgb01(stroke)} RG ${lineWidth} w ${x} ${bottom} ${w} ${h} re B Q`);
        } else if (fill) {
            ops.push(`q ${hexToRgb01(fill)} rg ${x} ${bottom} ${w} ${h} re f Q`);
        } else if (stroke) {
            ops.push(`q ${hexToRgb01(stroke)} RG ${lineWidth} w ${x} ${bottom} ${w} ${h} re S Q`);
        }
    };

    const line = (x1, top1, x2, top2, color = '#e2e8f0', width = 1) => {
        ops.push(`q ${hexToRgb01(color)} RG ${width} w ${x1} ${y(top1)} m ${x2} ${y(top2)} l S Q`);
    };

    const text = (value, x, top, size = 10, color = '#334155', font = 'F1') => {
        ops.push(`q ${hexToRgb01(color)} rg /${font} ${size} Tf ${x} ${y(top)} Td (${escapePdfText(value)}) Tj Q`);
    };

    const wrappedText = (value, x, top, maxChars, size = 10, color = '#334155', font = 'F1', lineHeight = 14, maxLines = 4) => {
        const lines = wrapText(value, maxChars).slice(0, maxLines);
        lines.forEach((part, idx) => text(part, x, top + idx * lineHeight, size, color, font));
        return lines.length * lineHeight;
    };

    const statusConfig = (status) => PDF_STATUS[status] || PDF_STATUS.ontrack;

    const badge = (status, x, top) => {
        const s = statusConfig(status);
        rect(x, top - 9, 54, 16, s.fill, s.color, 0.5);
        text(s.label.toUpperCase(), x + 6, top + 2, 7, s.text, 'F2');
    };

    const progress = (value, status, x, top, w = 58) => {
        const pct = clamp(value, 0, 100);
        rect(x, top, w, 5, '#e2e8f0');
        rect(x, top, (w * pct) / 100, 5, statusConfig(status).color);
        text(`${Math.round(pct)}%`, x + w + 6, top + 5, 8, '#475569', 'F1');
    };

    const arc = (cx, topCenter, r, startDeg, endDeg, color, width = 8) => {
        const steps = Math.max(8, Math.ceil(Math.abs(endDeg - startDeg) / 12));
        const pts = [];
        for (let i = 0; i <= steps; i++) {
            const a = (startDeg + ((endDeg - startDeg) * i) / steps) * Math.PI / 180;
            pts.push([cx + r * Math.cos(a), y(topCenter) + r * Math.sin(a)]);
        }
        const [first, ...rest] = pts;
        ops.push(`q ${hexToRgb01(color)} RG ${width} w 1 J ${first[0].toFixed(2)} ${first[1].toFixed(2)} m ${rest.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)} l`).join(' ')} S Q`);
    };

    rect(0, 0, W, H, '#ffffff');

    text(`${presentation.category} Report`, 42, 58, 8, '#94a3b8', 'F2');
    text(truncateText(presentation.name, 34), 42, 80, 22, '#0f172a', 'F2');
    text(`Generated ${presentation.generated_label}`, 42, 100, 9, '#94a3b8', 'F1');
    text('QC Manager', 474, 62, 13, '#4f46e5', 'F2');
    text('Governance System', 474, 78, 8, '#94a3b8', 'F1');
    rect(42, 116, 528, 4, '#4f46e5');
    rect(306, 116, 264, 4, '#7c3aed');

    const meta = [
        ['Reporting period', presentation.range],
        ['Scope', presentation.project],
        ['Prepared by', 'admin user'],
        ['Classification', 'Confidential'],
    ];
    meta.forEach(([label, value], idx) => {
        const x = 42 + idx * 132;
        text(label, x, 139, 6.5, '#94a3b8', 'F2');
        text(truncateText(value || '-', 18), x, 152, 8.5, '#334155', 'F2');
    });

    const tone = PDF_SUMMARY_TONE[presentation.summary_tone] || PDF_SUMMARY_TONE.ontrack;
    rect(42, 176, 528, 66, tone.fill, tone.stroke);
    text('EXECUTIVE SUMMARY', 58, 195, 7, tone.label, 'F2');
    wrappedText(presentation.summary, 58, 213, 92, 9.5, '#334155', 'F1', 12, 3);

    const cardTop = 262;
    const cardW = 168;
    presentation.kpis.slice(0, 3).forEach((kpi, idx) => {
        const x = 42 + idx * (cardW + 12);
        rect(x, cardTop, cardW, 70, '#f8fafc', '#e2e8f0');
        text(truncateText(kpi.label, 24).toUpperCase(), x + 13, cardTop + 19, 7, '#94a3b8', 'F2');
        text(truncateText(kpi.value, 12), x + 13, cardTop + 44, 21, '#0f172a', 'F2');
        if (kpi.delta) {
            const deltaColor = kpi.trend === 'down' ? '#f43f5e' : '#10b981';
            text(kpi.delta, x + 82, cardTop + 44, 8.5, deltaColor, 'F2');
        }
        text(truncateText(kpi.sub || '', 26), x + 13, cardTop + 59, 8, '#94a3b8', 'F1');
    });

    const panelTop = 352;
    rect(42, panelTop, 204, 140, '#ffffff', '#e2e8f0');
    rect(264, panelTop, 306, 140, '#ffffff', '#e2e8f0');

    const gauge = presentation.gauge || { value: 0, label: 'Headline', caption: '' };
    const gaugePct = clamp(gauge.value, 0, 100);
    const gaugeColor = gaugePct >= 85 ? '#10b981' : gaugePct >= 70 ? '#3b82f6' : gaugePct >= 50 ? '#f59e0b' : '#f43f5e';
    text(truncateText(gauge.label, 32).toUpperCase(), 58, panelTop + 21, 7, '#94a3b8', 'F2');
    arc(144, panelTop + 76, 39, -90, 270, '#e2e8f0', 9);
    arc(144, panelTop + 76, 39, -90, -90 + (gaugePct * 3.6), gaugeColor, 9);
    text(`${Math.round(gaugePct)}%`, 123, panelTop + 81, 22, '#0f172a', 'F2');
    text(truncateText(gauge.caption || '', 34), 76, panelTop + 122, 8, '#94a3b8', 'F1');

    const chart = presentation.chart || { title: 'Chart', unit: '', bars: [] };
    text(truncateText(chart.title || 'Chart', 40).toUpperCase(), 280, panelTop + 21, 7, '#94a3b8', 'F2');
    const bars = chart.bars.slice(0, 8);
    const maxBar = Math.max(...bars.map((b) => Number(b.value) || 0), 1);
    const chartBase = panelTop + 118;
    const barAreaH = 78;
    const gap = 8;
    const barW = Math.min(28, (258 - gap * Math.max(0, bars.length - 1)) / Math.max(1, bars.length));
    bars.forEach((bar, idx) => {
        const x = 280 + idx * (barW + gap);
        const h = Math.max(5, ((Number(bar.value) || 0) / maxBar) * barAreaH);
        const top = chartBase - h;
        text(`${bar.value}${chart.unit || ''}`, x, top - 8, 7, '#64748b', 'F2');
        rect(x, top, barW, h, statusConfig(bar.status).color);
        text(truncateText(bar.label, 7), x - 2, chartBase + 13, 6.5, '#94a3b8', 'F1');
    });

    const tableTop = 520;
    text('DETAIL BREAKDOWN', 42, tableTop, 7, '#94a3b8', 'F2');
    line(42, tableTop + 13, 570, tableTop + 13, '#cbd5e1', 1.5);

    const colX = [42, 184, 274, 364, 430];
    const colW = [132, 76, 80, 50, 132];
    presentation.columns.slice(0, 5).forEach((header, idx) => {
        text(truncateText(header, idx === 0 ? 20 : 14).toUpperCase(), colX[idx], tableTop + 30, 7, '#94a3b8', 'F2');
    });

    presentation.rows.slice(0, 8).forEach((row, idx) => {
        const rowTop = tableTop + 46 + idx * 24;
        line(42, rowTop + 7, 570, rowTop + 7, '#f1f5f9', 0.8);
        text(truncateText(row.c?.[0] || `Row ${idx + 1}`, 24), colX[0], rowTop + 21, 8.5, '#1e293b', 'F2');
        badge(row.status, colX[1], rowTop + 17);
        progress(row.rate || 0, row.status, colX[2], rowTop + 13, 46);
        text(String(row.defects ?? 0), colX[3], rowTop + 21, 8.5, '#475569', 'F1');
        text(truncateText(row.rec || '', 28), colX[4], rowTop + 21, 8, '#64748b', 'F3');
    });

    rect(42, 752, 528, 1, '#e2e8f0');
    text('QC Management Tool - Confidential - Internal Use Only', 186, 770, 7, '#94a3b8', 'F1');

    return drawPdfDocument(ops);
}

function buildPdfBuffer(lines) {
    const safeLines = lines.length ? lines : ['No data available'];
    const maxLines = 38;
    const visible = safeLines.slice(0, maxLines);

    const textOps = [
        'BT',
        '/F1 12 Tf',
        '50 800 Td',
        ...visible.map((line, idx) => {
            const op = `(${escapePdfText(line)}) Tj`;
            return idx === 0 ? op : `T* ${op}`;
        }),
        'ET',
    ].join('\n');

    const objects = {
        1: '<< /Type /Catalog /Pages 2 0 R >>',
        2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        4: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        5: `<< /Length ${Buffer.byteLength(textOps, 'utf8')} >>\nstream\n${textOps}\nendstream`,
    };

    let pdf = '%PDF-1.4\n';
    const offsets = [0];

    for (let i = 1; i <= 5; i++) {
        offsets[i] = Buffer.byteLength(pdf, 'utf8');
        pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
    }

    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += 'xref\n';
    pdf += '0 6\n';
    pdf += '0000000000 65535 f \n';
    for (let i = 1; i <= 5; i++) {
        pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }

    pdf += 'trailer\n';
    pdf += '<< /Size 6 /Root 1 0 R >>\n';
    pdf += 'startxref\n';
    pdf += `${xrefOffset}\n`;
    pdf += '%%EOF';

    return Buffer.from(pdf, 'utf8');
}

function downloadDisposition(filename) {
    const safeFilename = String(filename || 'report.dat')
        .replace(/[\r\n]/g, '')
        .replace(/"/g, "'");
    return `attachment; filename="${safeFilename}"`;
}

async function buildReportPayload(reportType, format, presentation) {
    const sql = REPORT_SQL_BY_TYPE[reportType] || REPORT_SQL_BY_TYPE.dashboard;
    const result = await db.query(sql);
    const rows = result.rows || [];
    const generatedAt = new Date().toISOString();

    if (format === 'json') {
        const content = Buffer.from(JSON.stringify({ generated_at: generatedAt, report_type: reportType, rows }, null, 2), 'utf8');
        return { content, filename: `${reportType}-${Date.now()}.json` };
    }

    if (format === 'csv') {
        const content = Buffer.from(rowsToCsv(rows), 'utf8');
        return { content, filename: `${reportType}-${Date.now()}.csv` };
    }

    if (format === 'xlsx') {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ message: 'No data available' }]);
        XLSX.utils.book_append_sheet(wb, ws, 'Report');
        const content = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        return { content, filename: `${reportType}-${Date.now()}.xlsx` };
    }

    const reportPresentation = normalizePresentation(presentation, reportType, rows, generatedAt);
    const content = buildStyledPdfBuffer(reportPresentation);
    return { content, filename: `${safeReportSlug(reportPresentation.name)}-${Date.now()}.pdf` };
}

// Validation schema for report generation
const generateReportSchema = z.object({
    report_type: z.enum(['project_status', 'resource_utilization', 'task_export', 'test_results', 'dashboard']),
    format: z.enum(['xlsx', 'csv', 'json', 'pdf']).default('json'),
    filters: z.object({
        project_ids: z.array(z.string().uuid()).optional(),
        status: z.array(z.string()).optional(),
        date_from: z.string().optional(),
        date_to: z.string().optional()
    }).optional(),
    presentation: z.object({
        report_id: z.string().optional(),
        name: z.string(),
        category: z.string().optional(),
        generated_label: z.string().optional(),
        range: z.string().optional(),
        project: z.string().optional(),
        summary: z.string().optional(),
        summary_tone: z.string().optional(),
        kpis: z.array(z.object({
            label: z.string(),
            value: z.string(),
            sub: z.string().optional(),
            delta: z.string().optional(),
            trend: z.string().optional(),
        })).optional(),
        chart: z.object({
            title: z.string(),
            unit: z.string().optional(),
            bars: z.array(z.object({
                label: z.string(),
                value: z.coerce.number(),
                status: z.string().optional(),
            })),
        }).optional(),
        columns: z.array(z.string()).optional(),
        rows: z.array(z.object({
            c: z.array(z.string()),
            status: z.string().optional(),
            rate: z.coerce.number().optional(),
            defects: z.coerce.number().optional(),
            rec: z.string().optional(),
        })).optional(),
        gauge: z.object({
            value: z.coerce.number(),
            label: z.string(),
            caption: z.string().optional(),
        }).optional(),
    }).optional(),
    user_email: z.string().email().optional()
});

// POST /reports - Generate report (returns job_id)
router.post('/', requireAuth, requirePermission('qc.reports.generate'), async (req, res, next) => {
    try {
        // Validate request
        const data = generateReportSchema.parse(req.body);

        // Generate job ID
        const jobId = uuidv4();

        // Insert job into database
        await db.query(
            `INSERT INTO report_jobs (
                id, report_type, format, status, filters, user_email
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                jobId,
                data.report_type,
                data.format,
                'processing',
                data.filters ? JSON.stringify(data.filters) : null,
                data.user_email || 'anonymous'
            ]
        );

        if (REPORT_SQL_BY_TYPE[data.report_type]) {
            try {
                const payload = await buildReportPayload(data.report_type, data.format, data.presentation);
                await db.query(
                    `UPDATE report_jobs
                     SET status = $1,
                         result_data = $2,
                         download_url = $3,
                         error_message = NULL,
                         completed_at = NOW(),
                         updated_at = NOW()
                     WHERE id = $4`,
                    [
                        'completed',
                        JSON.stringify({
                            inline_file_base64: payload.content.toString('base64'),
                            mime_type: FORMAT_MIME[data.format] || 'application/octet-stream',
                            filename: payload.filename,
                            file_size: payload.content.length,
                        }),
                        'inline',
                        jobId,
                    ]
                );
            } catch (inlineErr) {
                const message = String(inlineErr.message || 'Report generation failed').slice(0, 1024);
                await db.query(
                    `UPDATE report_jobs
                     SET status = $1,
                         error_message = $2,
                         completed_at = NOW(),
                         updated_at = NOW()
                     WHERE id = $3`,
                    ['failed', message, jobId]
                );

                return res.status(500).json({
                    success: false,
                    error: 'Failed to generate report',
                    message,
                });
            }

            return res.status(202).json({
                success: true,
                message: 'Report generation started',
                data: {
                    job_id: jobId,
                    status: 'processing',
                    report_type: data.report_type,
                    format: data.format,
                    estimated_completion: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
                    status_url: `/reports/${jobId}`,
                },
            });
        }

        // Trigger n8n workflow for report generation (async)
        try {
            await triggerWorkflow('generate-report', {
                job_id: jobId,
                report_type: data.report_type,
                format: data.format,
                filters: data.filters || {},
                user_email: data.user_email
            }, { strict: true });
        } catch (triggerErr) {
            const errorMessage = String(triggerErr.message || 'Unknown report trigger error').slice(0, 1024);
            await db.query(
                `UPDATE report_jobs
                 SET status = $1,
                     error_message = $2,
                     completed_at = NOW(),
                     updated_at = NOW()
                 WHERE id = $3`,
                ['failed', errorMessage, jobId]
            );

            return res.status(502).json({
                success: false,
                error: 'Failed to start report generation',
                message: errorMessage
            });
        }

        // Return 202 Accepted with job_id
        res.status(202).json({
            success: true,
            message: 'Report generation started',
            data: {
                job_id: jobId,
                status: 'processing',
                report_type: data.report_type,
                format: data.format,
                estimated_completion: new Date(Date.now() + 2 * 60 * 1000).toISOString(), // +2 minutes
                status_url: `/reports/${jobId}`
            }
        });
    } catch (err) {
        next(err);
    }
});

// GET /reports/:job_id/download - Proxy report file download through API (avoids browser CORS)
router.get('/:job_id/download', requireAuth, requirePermission('qc.reports.view'), async (req, res, next) => {
    try {
        const { job_id } = req.params;

        const result = await db.query('SELECT * FROM report_jobs WHERE id = $1', [job_id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Report job not found' });
        }

        const job = result.rows[0];
        if (job.status !== 'completed' || !job.download_url) {
            return res.status(409).json({ error: 'Report is not ready for download' });
        }

        if (job.result_data && job.result_data.inline_file_base64) {
            const inlineData = job.result_data;
            const contentBuffer = Buffer.from(inlineData.inline_file_base64, 'base64');
            const contentType = inlineData.mime_type || FORMAT_MIME[job.format] || 'application/octet-stream';
            const filename = inlineData.filename || job.filename || `report-${job.id}.${job.format || 'dat'}`;

            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', downloadDisposition(filename));
            res.setHeader('Content-Length', contentBuffer.length);
            return res.send(contentBuffer);
        }

        const upstream = await axios.get(job.download_url, {
            responseType: 'stream',
            timeout: 30000,
        });

        const filename = job.filename || `report-${job.id}.${job.format || 'dat'}`;
        const contentType = upstream.headers['content-type'] || FORMAT_MIME[job.format] || 'application/octet-stream';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', downloadDisposition(filename));

        const contentLength = upstream.headers['content-length'];
        if (contentLength) {
            res.setHeader('Content-Length', contentLength);
        }

        upstream.data.on('error', (streamErr) => {
            if (!res.headersSent) {
                res.status(502).json({ error: 'Failed to stream report file' });
                return;
            }
            res.destroy(streamErr);
        });

        upstream.data.pipe(res);
    } catch (err) {
        if (err.response) {
            return res.status(502).json({ error: 'Failed to fetch report file from source' });
        }
        next(err);
    }
});

// GET /reports/:job_id - Check report status
router.get('/:job_id', requireAuth, requirePermission('qc.reports.view'), async (req, res, next) => {
    try {
        const { job_id } = req.params;

        const result = await db.query(
            'SELECT * FROM report_jobs WHERE id = $1',
            [job_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Report job not found' 
            });
        }

        const job = result.rows[0];
        const hasInlineFile = Boolean(job.result_data && job.result_data.inline_file_base64);
        const proxiedDownloadUrl = (job.download_url || hasInlineFile)
            ? `${req.protocol}://${req.get('host')}/reports/${job.id}/download`
            : null;

        res.json({
            success: true,
            data: {
                job_id: job.id,
                report_type: job.report_type,
                format: job.format,
                status: job.status,
                download_url: proxiedDownloadUrl,
                filename: job.filename || (job.result_data && job.result_data.filename) || null,
                file_size: job.file_size || (job.result_data && job.result_data.file_size) || null,
                error_message: job.error_message,
                filters: job.filters,
                created_at: job.created_at,
                completed_at: job.completed_at
            }
        });
    } catch (err) {
        next(err);
    }
});

// POST /reports/callback - n8n callback to update job status (webhook)
router.post('/callback', async (req, res, next) => {
    try {
        const { job_id, status, download_url, filename, file_size, error_message } = req.body;

        if (!job_id || !status) {
            return res.status(400).json({ error: 'job_id and status are required' });
        }

        // Update job status
        await db.query(
            `UPDATE report_jobs 
             SET status = $1,
                 download_url = $2,
                 filename = $3,
                 file_size = $4,
                 error_message = $5,
                 completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN NOW() ELSE completed_at END
             WHERE id = $6`,
            [status, download_url, filename, file_size, error_message, job_id]
        );

        res.json({ success: true, message: 'Report job updated' });
    } catch (err) {
        next(err);
    }
});

// GET /reports - List all report jobs (with pagination)
router.get('/', requireAuth, requirePermission('qc.reports.view'), async (req, res, next) => {
    try {
        const { user_email, status, limit = 50, offset = 0 } = req.query;

        let query = 'SELECT * FROM report_jobs WHERE 1=1';
        const params = [];
        let paramCount = 1;

        if (user_email) {
            query += ` AND user_email = $${paramCount}`;
            params.push(user_email);
            paramCount++;
        }

        if (status) {
            query += ` AND status = $${paramCount}`;
            params.push(status);
            paramCount++;
        }

        query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await db.query(query, params);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                total: result.rowCount
            }
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
