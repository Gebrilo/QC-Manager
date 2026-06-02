import { pdf } from '@react-pdf/renderer';
import React from 'react';
import { ReportPdfDocument, type ReportPdfData } from './reportPdfDocument';

function safeFilename(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        || 'report';
}

export async function createReportPdfBlob(data: ReportPdfData): Promise<{ blob: Blob; fileName: string }> {
    // pdf() expects a Document element; cast needed because our props don't extend DocumentProps
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = React.createElement(ReportPdfDocument, data) as any;
    const blob = await pdf(element).toBlob();
    const fileName = `${safeFilename(data.report.name)}-${new Date().toISOString().slice(0, 10)}.pdf`;
    return { blob, fileName };
}

export async function downloadReportAsPdf(data: ReportPdfData): Promise<void> {
    const { blob, fileName } = await createReportPdfBlob(data);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
