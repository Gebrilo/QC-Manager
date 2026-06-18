import path from 'path';
import { describe, it, expect } from 'vitest';
import React from 'react';
import { Font, renderToBuffer } from '@react-pdf/renderer';
import type { ReportDefinition } from '@/components/reports/reportTypes';
import type { ReportPdfData } from './reportPdfDocument';

// Regression for the "Arabic renders as garbled symbols in the generated PDF" bug.
//
// Root cause: the report used `fontFamily: 'Helvetica'`, a PDF standard-14 font
// that only carries Latin (WinAnsi) glyphs. react-pdf then emitted the low byte
// of every Arabic code point against the Latin encoding table, so Arabic showed
// up as unrelated punctuation/letters. The fix registers Tajawal (Latin+Arabic),
// making react-pdf embed a Type0 CID subset and shape Arabic correctly.
//
// react-pdf keeps the FIRST registered source per weight, and the document
// registers Tajawal from a browser URL (`/fonts/...`) that Node cannot read. So
// we register the SAME family from the bundled file on disk FIRST, then import
// the document (whose own registration becomes a harmless no-op). Built-in
// Helvetica is left intact — if the styles ever revert to it, no Tajawal/Type0
// subset is embedded and the assertions below fail.
const FONT_DIR = path.resolve(__dirname, '../../public/fonts');
const ARABIC = 'تقرير الجودة الشهري للنظام';

function arabicReport(): ReportDefinition {
    return {
        id: 'ar-test',
        category: 'Governance',
        iconKey: 'pulse',
        name: ARABIC,
        desc: ARABIC,
        lastGenerated: 'now',
        est: '~20s',
        summary: `الملخص التنفيذي: ${ARABIC} — Mixed English 95%.`,
        summaryTone: 'ontrack',
        kpis: [{ label: 'معدل النجاح', value: '89%', sub: 'هذا الأسبوع', delta: '+3%', trend: 'up' }],
        chart: { title: 'النتائج حسب المشروع', unit: '%', bars: [{ label: 'القلب', value: 88, status: 'complete' }] },
        columns: ['المشروع', 'الحالة', 'المعدل', 'العيوب', 'التوصية'],
        rows: [{ c: ['منصة القلب'], status: 'complete', rate: 94, defects: 1, rec: 'موافقة' }],
    };
}

describe('report PDF Arabic rendering', () => {
    it('embeds an Arabic-capable Type0 font subset for Arabic content', async () => {
        // Register the bundled Tajawal from disk BEFORE the document registers
        // its browser-path copy, so the loadable source wins.
        Font.register({
            family: 'Tajawal',
            fonts: [
                { src: path.join(FONT_DIR, 'Tajawal-Regular.ttf'), fontWeight: 400 },
                { src: path.join(FONT_DIR, 'Tajawal-Bold.ttf'), fontWeight: 700 },
            ],
        });

        const { ReportPdfDocument } = await import('./reportPdfDocument');
        const data: ReportPdfData = {
            report: arabicReport(),
            gauge: { value: 89, label: 'معدل النجاح', caption: 'مستقر' },
            range: 'يونيو 2026',
            project: 'كل المشاريع',
            stamp: '2026-06-18',
        };

        // Cast mirrors src/lib/reportPdf.ts: our props don't extend DocumentProps.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const element = React.createElement(ReportPdfDocument, data) as any;
        const buffer = await renderToBuffer(element);
        const pdf = buffer.toString('latin1');

        // A composite (CID) font subset means real Arabic glyphs are embedded and
        // shaped — the standard Latin-only font cannot produce this.
        expect(pdf).toContain('/Subtype /Type0');
        // Both weights of the Arabic-capable family embed as subsets (XXXXXX+Tajawal-*).
        expect(pdf).toMatch(/\/BaseFont \/[A-Z]{6}\+Tajawal-Regular/);
        expect(pdf).toMatch(/\/BaseFont \/[A-Z]{6}\+Tajawal-Bold/);
    });
});
