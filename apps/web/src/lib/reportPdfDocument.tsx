import React from 'react';
import {
    Document, Page, View, Text, StyleSheet, Svg, Circle, Rect, Path, G, Line, Font,
} from '@react-pdf/renderer';
import type { ReportDefinition } from '@/components/reports/reportTypes';

// ─── Fonts ──────────────────────────────────────────────────────────────────
// The PDF "standard 14" fonts (Helvetica/Times/Courier) only carry Latin
// (WinAnsi) glyphs, so any Arabic text rendered with them collapses to garbled
// symbols — react-pdf emits the low byte of each code point against the Latin
// encoding table. Tajawal is a static TTF that covers BOTH Latin and Arabic, so
// react-pdf embeds a Type0 subset and shapes Arabic (RTL + letter joining)
// correctly. Served from /public so the browser-side renderer can fetch it.
Font.register({
    family: 'Tajawal',
    fonts: [
        { src: '/fonts/Tajawal-Regular.ttf', fontWeight: 400 },
        { src: '/fonts/Tajawal-Bold.ttf', fontWeight: 700 },
    ],
});
// Disable hyphenation: the default callback splits words and breaks Arabic joining.
Font.registerHyphenationCallback((word) => [word]);

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
    complete:   '#10b981',
    ontrack:    '#3b82f6',
    inprogress: '#f59e0b',
    atrisk:     '#f43f5e',
    ready:      '#10b981',
    generating: '#f59e0b',
    failed:     '#f43f5e',
};

const STATUS_LABELS: Record<string, string> = {
    complete:   'ON TRACK',
    ontrack:    'STABLE',
    inprogress: 'WATCH',
    atrisk:     'AT RISK',
    ready:      'READY',
    generating: 'GENERATING',
    failed:     'FAILED',
};

const STATUS_BADGE_BG: Record<string, string> = {
    complete:   '#d1fae5',
    ontrack:    '#dbeafe',
    inprogress: '#fef3c7',
    atrisk:     '#ffe4e6',
    ready:      '#d1fae5',
    generating: '#fef3c7',
    failed:     '#ffe4e6',
};

const STATUS_BADGE_TEXT: Record<string, string> = {
    complete:   '#065f46',
    ontrack:    '#1e40af',
    inprogress: '#92400e',
    atrisk:     '#9f1239',
    ready:      '#065f46',
    generating: '#92400e',
    failed:     '#9f1239',
};

const SUMMARY_BG: Record<string, string> = {
    complete:   '#ecfdf5',
    ontrack:    '#eff6ff',
    inprogress: '#fffbeb',
    atrisk:     '#fff1f2',
};

const SUMMARY_BORDER: Record<string, string> = {
    complete:   '#a7f3d0',
    ontrack:    '#bfdbfe',
    inprogress: '#fde68a',
    atrisk:     '#fecdd3',
};

const SUMMARY_TEXT_COLOR: Record<string, string> = {
    complete:   '#065f46',
    ontrack:    '#1e40af',
    inprogress: '#92400e',
    atrisk:     '#881337',
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    page: {
        fontFamily: 'Tajawal',
        fontSize: 9,
        backgroundColor: '#ffffff',
        paddingTop: 40,
        paddingBottom: 52,
        paddingHorizontal: 45,
    },
    // Header
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
    headerLeft: { flex: 1 },
    headerRight: { alignItems: 'flex-end' },
    category: { fontSize: 7, fontFamily: 'Tajawal', fontWeight: 'bold', color: '#94a3b8', marginBottom: 3 },
    title: { fontSize: 22, fontFamily: 'Tajawal', fontWeight: 'bold', color: '#0f172a' },
    stamp: { fontSize: 8, color: '#94a3b8', marginTop: 4 },
    brand: { fontSize: 12, fontFamily: 'Tajawal', fontWeight: 'bold', color: '#4f46e5' },
    brandSub: { fontSize: 7, color: '#94a3b8', marginTop: 2 },
    // Divider
    divider: { height: 3, borderRadius: 2, backgroundColor: '#4f46e5', marginBottom: 10 },
    // Meta row
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginBottom: 14 },
    metaItem: { flexDirection: 'row', alignItems: 'center' },
    metaKey: { fontSize: 7, fontFamily: 'Tajawal', fontWeight: 'bold', color: '#94a3b8' },
    metaVal: { fontSize: 8, fontFamily: 'Tajawal', fontWeight: 'bold', color: '#334155', marginLeft: 4 },
    // Summary
    summaryBox: { borderRadius: 6, padding: 10, marginBottom: 14 },
    summaryLabel: { fontSize: 7, fontFamily: 'Tajawal', fontWeight: 'bold', marginBottom: 4 },
    summaryText: { fontSize: 9, color: '#334155', lineHeight: 1.6 },
    // KPIs
    kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
    kpiCard: { flex: 1, borderRadius: 7, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', padding: 10 },
    kpiLabel: { fontSize: 7, fontFamily: 'Tajawal', fontWeight: 'bold', color: '#94a3b8', marginBottom: 5 },
    kpiValueRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 2 },
    kpiValue: { fontSize: 19, fontFamily: 'Tajawal', fontWeight: 'bold', color: '#0f172a', lineHeight: 1 },
    kpiDelta: { fontSize: 7.5, fontFamily: 'Tajawal', fontWeight: 'bold', marginLeft: 4, marginBottom: 1 },
    kpiSub: { fontSize: 7.5, color: '#94a3b8' },
    // Charts row
    chartsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    gaugeCard: { flex: 2, borderRadius: 7, borderWidth: 1, borderColor: '#e2e8f0', padding: 10, alignItems: 'center' },
    chartCard: { flex: 3, borderRadius: 7, borderWidth: 1, borderColor: '#e2e8f0', padding: 10 },
    sectionLabel: { fontSize: 7, fontFamily: 'Tajawal', fontWeight: 'bold', color: '#94a3b8', marginBottom: 8 },
    // Table
    tableLabel: { fontSize: 7, fontFamily: 'Tajawal', fontWeight: 'bold', color: '#94a3b8', marginBottom: 6 },
    tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1.5, borderBottomColor: '#e2e8f0', paddingBottom: 4, marginBottom: 1 },
    tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingVertical: 5, alignItems: 'center' },
    tableCell: { fontSize: 8.5, color: '#475569' },
    tableCellBold: { fontSize: 8.5, fontFamily: 'Tajawal', fontWeight: 'bold', color: '#1e293b' },
    tableHeaderCell: { fontSize: 7, fontFamily: 'Tajawal', fontWeight: 'bold', color: '#94a3b8' },
    badge: { borderRadius: 10, paddingHorizontal: 5, paddingVertical: 2 },
    badgeText: { fontSize: 6.5, fontFamily: 'Tajawal', fontWeight: 'bold' },
    // Rate bar
    rateBarTrack: { height: 5, borderRadius: 3, backgroundColor: '#f1f5f9', width: 60 },
    rateBarFill: { height: 5, borderRadius: 3 },
    rateText: { fontSize: 8, color: '#475569', marginLeft: 5 },
    // Footer
    footer: {
        position: 'absolute',
        bottom: 20,
        left: 45,
        right: 45,
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
        paddingTop: 7,
        alignItems: 'center',
    },
    footerText: { fontSize: 7, color: '#94a3b8' },
});

// ─── Gauge arc helper ─────────────────────────────────────────────────────────

function gaugeColor(v: number): string {
    if (v >= 85) return '#10b981';
    if (v >= 70) return '#3b82f6';
    if (v >= 50) return '#f59e0b';
    return '#f43f5e';
}

function gaugeArcPath(cx: number, cy: number, r: number, pct: number): string {
    const clamped = Math.min(99.9, Math.max(0.1, pct));
    const rad = (-90 + 3.6 * clamped) * (Math.PI / 180);
    const x = (cx + r * Math.cos(rad)).toFixed(3);
    const y = (cy + r * Math.sin(rad)).toFixed(3);
    const large = clamped > 50 ? 1 : 0;
    return `M ${cx} ${(cy - r).toFixed(3)} A ${r} ${r} 0 ${large} 1 ${x} ${y}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function GaugePdf({ value, label, caption }: { value: number; label: string; caption: string }) {
    const size = 110;
    const cx = 55;
    const cy = 55;
    const r = 38;
    const pct = Math.min(100, Math.max(0, value));
    const color = gaugeColor(pct);
    const arc = gaugeArcPath(cx, cy, r, pct);

    return (
        <View style={{ alignItems: 'center' }}>
            <Text style={[s.sectionLabel, { marginBottom: 4 }]}>{label.toUpperCase()}</Text>
            <View style={{ position: 'relative', width: size, height: size }}>
                <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                    {/* Background track */}
                    <Circle cx={cx} cy={cy} r={r} fill="none" stroke="#eef2f7" strokeWidth={10} />
                    {/* Progress arc */}
                    {pct > 0 && (
                        <Path d={arc} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" />
                    )}
                </Svg>
                {/* Centered value - overlaid via absolute position */}
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 20, fontFamily: 'Tajawal', fontWeight: 'bold', color: '#0f172a' }}>{pct}%</Text>
                </View>
            </View>
            <Text style={{ fontSize: 7.5, color: '#94a3b8', textAlign: 'center', marginTop: 2 }}>{caption}</Text>
        </View>
    );
}

function BarChartPdf({ chart }: { chart: ReportDefinition['chart'] }) {
    const bars = chart.bars;
    const maxVal = Math.max(...bars.map(b => b.value), 1);
    const n = bars.length;
    const W = 220;
    const H = 76;
    const barW = Math.max(8, Math.min(28, (W - (n - 1) * 6) / n));
    const totalW = barW * n + 6 * (n - 1);
    const startX = (W - totalW) / 2;

    return (
        <View>
            <Text style={s.sectionLabel}>{chart.title.toUpperCase()}</Text>
            {/* Bar SVG */}
            <Svg width={W} height={H + 1}>
                {bars.map((bar, i) => {
                    const barH = Math.max(3, (bar.value / maxVal) * H);
                    const x = startX + i * (barW + 6);
                    const y = H - barH;
                    return (
                        <Rect
                            key={i}
                            x={x} y={y}
                            width={barW} height={barH}
                            fill={STATUS_COLORS[bar.status] || '#94a3b8'}
                            rx={2}
                        />
                    );
                })}
                <Line x1={0} y1={H} x2={W} y2={H} stroke="#e2e8f0" strokeWidth={1} />
            </Svg>
            {/* X-axis labels below — offset by startX to match bar positions */}
            <View style={{ flexDirection: 'row', paddingLeft: startX }}>
                {bars.map((bar, i) => (
                    <Text
                        key={i}
                        style={{ width: barW + 6, fontSize: 6.5, color: '#94a3b8', textAlign: 'center' }}
                    >
                        {bar.label}
                    </Text>
                ))}
            </View>
        </View>
    );
}

function RateBarPdf({ value, status }: { value: number; status: string }) {
    const color = STATUS_COLORS[status] || '#94a3b8';
    const fillW = Math.min(60, Math.max(0, (value / 100) * 60));
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={s.rateBarTrack}>
                <View style={[s.rateBarFill, { width: fillW, backgroundColor: color }]} />
            </View>
            <Text style={s.rateText}>{value}%</Text>
        </View>
    );
}

function BadgePdf({ status }: { status: string }) {
    const bg = STATUS_BADGE_BG[status] || STATUS_BADGE_BG.ontrack;
    const color = STATUS_BADGE_TEXT[status] || STATUS_BADGE_TEXT.ontrack;
    const label = STATUS_LABELS[status] || 'STABLE';
    return (
        <View style={[s.badge, { backgroundColor: bg, alignSelf: 'flex-start' }]}>
            <Text style={[s.badgeText, { color }]}>{label}</Text>
        </View>
    );
}

// ─── Column widths (sum = 1) ──────────────────────────────────────────────────

const COL = { name: 0.28, status: 0.17, rate: 0.23, count: 0.1, rec: 0.22 };

// ─── Document ─────────────────────────────────────────────────────────────────

export interface ReportPdfData {
    report: ReportDefinition;
    gauge: { value: number; label: string; caption: string };
    range: string;
    project: string;
    stamp: string;
}

export function ReportPdfDocument({ report, gauge, range, project, stamp }: ReportPdfData) {
    const tone = report.summaryTone || 'ontrack';

    return (
        <Document>
            <Page size="A4" style={s.page}>

                {/* ── Letterhead ── */}
                <View style={s.headerRow}>
                    <View style={s.headerLeft}>
                        <Text style={s.category}>{report.category.toUpperCase()} REPORT</Text>
                        <Text style={s.title}>{report.name}</Text>
                        <Text style={s.stamp}>Generated {stamp}</Text>
                    </View>
                    <View style={s.headerRight}>
                        <Text style={s.brand}>QC Manager</Text>
                        <Text style={s.brandSub}>Governance System</Text>
                    </View>
                </View>

                {/* ── Indigo divider ── */}
                <View style={s.divider} />

                {/* ── Meta row ── */}
                <View style={s.metaRow}>
                    {[
                        ['REPORTING PERIOD', range],
                        ['SCOPE', project],
                        ['PREPARED BY', 'admin user'],
                        ['CLASSIFICATION', 'Confidential'],
                    ].map(([k, v]) => (
                        <View key={k} style={s.metaItem}>
                            <Text style={s.metaKey}>{k}</Text>
                            <Text style={s.metaVal}>{v}</Text>
                        </View>
                    ))}
                </View>

                {/* ── Executive summary ── */}
                <View style={[
                    s.summaryBox,
                    {
                        backgroundColor: SUMMARY_BG[tone] || SUMMARY_BG.ontrack,
                        borderWidth: 1,
                        borderColor: SUMMARY_BORDER[tone] || SUMMARY_BORDER.ontrack,
                    },
                ]}>
                    <Text style={[s.summaryLabel, { color: SUMMARY_TEXT_COLOR[tone] || SUMMARY_TEXT_COLOR.ontrack }]}>
                        EXECUTIVE SUMMARY
                    </Text>
                    <Text style={s.summaryText}>{report.summary}</Text>
                </View>

                {/* ── KPI tiles ── */}
                <View style={s.kpiRow}>
                    {report.kpis.map((kpi, i) => (
                        <View key={i} style={s.kpiCard}>
                            <Text style={s.kpiLabel}>{kpi.label.toUpperCase()}</Text>
                            <View style={s.kpiValueRow}>
                                <Text style={s.kpiValue}>{kpi.value}</Text>
                                {kpi.delta && (
                                    <Text style={[s.kpiDelta, { color: kpi.trend === 'up' ? '#10b981' : '#f43f5e' }]}>
                                        {kpi.trend === 'up' ? '▲' : '▼'} {kpi.delta}
                                    </Text>
                                )}
                            </View>
                            <Text style={s.kpiSub}>{kpi.sub}</Text>
                        </View>
                    ))}
                </View>

                {/* ── Gauge + Bar chart ── */}
                <View style={s.chartsRow}>
                    <View style={s.gaugeCard}>
                        <GaugePdf value={gauge.value} label={gauge.label} caption={gauge.caption} />
                    </View>
                    <View style={s.chartCard}>
                        <BarChartPdf chart={report.chart} />
                    </View>
                </View>

                {/* ── Detail table ── */}
                {report.rows.length > 0 && (
                    <View>
                        <Text style={s.tableLabel}>DETAIL BREAKDOWN</Text>
                        {/* Header */}
                        <View style={s.tableHeaderRow}>
                            {report.columns.map((col, i) => {
                                const widths = [COL.name, COL.status, COL.rate, COL.count, COL.rec];
                                return (
                                    <Text key={col} style={[s.tableHeaderCell, { flex: widths[i] || 0.15 }]}>
                                        {col.toUpperCase()}
                                    </Text>
                                );
                            })}
                        </View>
                        {/* Rows */}
                        {report.rows.map((row, i) => (
                            <View key={i} style={s.tableRow}>
                                <Text style={[s.tableCellBold, { flex: COL.name }]}>{row.c[0]}</Text>
                                <View style={{ flex: COL.status }}>
                                    <BadgePdf status={row.status} />
                                </View>
                                <View style={{ flex: COL.rate }}>
                                    <RateBarPdf value={row.rate} status={row.status} />
                                </View>
                                <Text style={[s.tableCell, { flex: COL.count }]}>{row.defects}</Text>
                                <Text style={[s.tableCell, { flex: COL.rec }]}>{row.rec}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* ── Footer ── */}
                <View style={s.footer} fixed>
                    <Text style={s.footerText}>
                        QC Management Tool · Confidential · Internal Use Only
                    </Text>
                </View>

            </Page>
        </Document>
    );
}
