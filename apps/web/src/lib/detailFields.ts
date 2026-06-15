import { stripHtml } from '@/lib/stripHtml';

const ACRONYMS: Record<string, string> = {
    id: 'ID',
    url: 'URL',
    cc: 'CC',
    qc: 'QC',
    api: 'API',
    ui: 'UI',
    tuleap: 'Tuleap',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/;

export function humanizeLabel(key: string): string {
    return key
        .split('_')
        .filter(Boolean)
        .map(word => ACRONYMS[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export function isUuid(value: unknown): boolean {
    return typeof value === 'string' && UUID_RE.test(value);
}

export function formatFieldValue(value: unknown): string | null {
    if (value === null || value === undefined) return null;

    if (typeof value === 'boolean') return value ? 'Yes' : 'No';

    if (Array.isArray(value)) {
        const primitives = value.filter(
            item => item !== null && item !== undefined && typeof item !== 'object',
        );
        if (primitives.length === 0) return null;
        return primitives.map(String).join(', ');
    }

    if (typeof value === 'object') return null;

    if (typeof value === 'number') return String(value);

    const str = String(value);
    if (str.trim() === '') return null;

    if (ISO_DATE_RE.test(str)) {
        const date = new Date(str);
        if (!Number.isNaN(date.getTime())) {
            return date.toLocaleDateString();
        }
    }

    const stripped = stripHtml(str);
    return stripped === '' ? null : stripped;
}
