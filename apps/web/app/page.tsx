import type { Metadata } from 'next';
import { PublicLandingPage } from '@/components/landing/PublicLandingPage';

const configuredRevalidate = Number(process.env.LANDING_PAGE_REVALIDATE_SECONDS || 60);

function metadataBaseFromEnv() {
    if (!process.env.PUBLIC_SITE_URL) return undefined;
    try {
        return new URL(process.env.PUBLIC_SITE_URL);
    } catch {
        return undefined;
    }
}

const publicSiteUrl = metadataBaseFromEnv();

export const revalidate = Number.isFinite(configuredRevalidate) && configuredRevalidate > 0
    ? configuredRevalidate
    : 60;

export const metadata: Metadata = {
    ...(publicSiteUrl ? { metadataBase: publicSiteUrl } : {}),
    title: 'QC Manager',
    description: 'QC Manager public overview, roadmap, and changelog for quality management teams.',
    openGraph: {
        title: 'QC Manager',
        description: 'Plan, test, govern, and report quality work from one operational workspace.',
        type: 'website',
    },
};

export default function Home() {
    return <PublicLandingPage />;
}
