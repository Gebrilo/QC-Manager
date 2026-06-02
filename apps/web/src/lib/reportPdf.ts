import html2canvas from 'html2canvas';
import { PDFDocument } from 'pdf-lib';

function safeFilename(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        || 'report';
}

export async function downloadElementAsPdf(element: HTMLElement, reportName: string) {
    const canvas = await html2canvas(element, {
        backgroundColor: '#f8fafc',
        logging: false,
        scale: Math.min(window.devicePixelRatio || 1, 2),
        useCORS: true,
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
    });

    const imageData = canvas.toDataURL('image/png');
    const pdf = await PDFDocument.create();
    const image = await pdf.embedPng(imageData);

    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const scale = pageWidth / image.width;
    const imageHeight = image.height * scale;
    const pageCount = Math.max(1, Math.ceil(imageHeight / pageHeight));

    for (let i = 0; i < pageCount; i++) {
        const page = pdf.addPage([pageWidth, pageHeight]);
        page.drawImage(image, {
            x: 0,
            y: pageHeight - imageHeight + (i * pageHeight),
            width: pageWidth,
            height: imageHeight,
        });
    }

    const bytes = await pdf.save();
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([buffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeFilename(reportName)}-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
