import { QCCard, SectionLabel, DetailRow } from '@/components/shared/DetailCard';
import {
    buildAutoDetailFields,
    type BuildAutoDetailFieldsOptions,
} from '@/lib/detailFields';

interface AutoDetailsCardProps extends BuildAutoDetailFieldsOptions {
    record: Record<string, unknown> | null | undefined;
    title?: string;
    className?: string;
}

export function AutoDetailsCard({
    record,
    title = 'Details',
    className,
    exclude,
    labels,
    formatters,
}: AutoDetailsCardProps) {
    const fields = buildAutoDetailFields(record, { exclude, labels, formatters });
    if (fields.length === 0) return null;

    return (
        <QCCard className={className}>
            <SectionLabel>{title}</SectionLabel>
            <div className="space-y-0">
                {fields.map(({ key, label, value }) => (
                    <DetailRow key={key} label={label} value={value} />
                ))}
            </div>
        </QCCard>
    );
}
