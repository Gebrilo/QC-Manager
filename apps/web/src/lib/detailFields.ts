const ACRONYMS: Record<string, string> = {
    id: 'ID',
    url: 'URL',
    cc: 'CC',
    qc: 'QC',
    api: 'API',
    ui: 'UI',
    tuleap: 'Tuleap',
};

export function humanizeLabel(key: string): string {
    return key
        .split('_')
        .filter(Boolean)
        .map(word => ACRONYMS[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
