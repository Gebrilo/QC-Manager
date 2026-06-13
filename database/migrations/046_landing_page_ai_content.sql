-- Migration 046: Configurable public landing page + AI content logs

CREATE TABLE IF NOT EXISTS landing_page_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    singleton_key BOOLEAN NOT NULL DEFAULT TRUE UNIQUE,
    hero_title VARCHAR(255) NOT NULL DEFAULT 'QC Manager',
    hero_subtitle TEXT NOT NULL DEFAULT 'Plan, test, govern, and report quality work from one operational workspace.',
    hero_cta_label VARCHAR(100) NOT NULL DEFAULT 'Sign in',
    hero_cta_url TEXT NOT NULL DEFAULT '/login',
    hero_secondary_cta_label VARCHAR(100) DEFAULT 'Create account',
    hero_secondary_cta_url TEXT DEFAULT '/register',
    marketing_intro_title VARCHAR(255) NOT NULL DEFAULT 'Built for quality teams that need execution clarity',
    marketing_intro_description TEXT NOT NULL DEFAULT 'QC Manager connects projects, tasks, test cases, bugs, governance metrics, and Tuleap sync activity so teams can see quality risk before release day.',
    show_features BOOLEAN NOT NULL DEFAULT TRUE,
    show_roadmap BOOLEAN NOT NULL DEFAULT TRUE,
    show_changelog BOOLEAN NOT NULL DEFAULT TRUE,
    show_footer_cta BOOLEAN NOT NULL DEFAULT TRUE,
    footer_cta_title VARCHAR(255) DEFAULT 'Ready to bring quality work into focus?',
    footer_cta_description TEXT DEFAULT 'Sign in to manage active work or request access from your QC Manager administrator.',
    footer_cta_label VARCHAR(100) DEFAULT 'Open QC Manager',
    footer_cta_url TEXT DEFAULT '/login',
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS landing_page_features (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    icon_key VARCHAR(80),
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);
CREATE INDEX IF NOT EXISTS idx_landing_features_active_order
    ON landing_page_features(is_active, display_order, created_at);

CREATE TABLE IF NOT EXISTS roadmap_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'planned',
    priority VARCHAR(30) NOT NULL DEFAULT 'medium',
    target_date DATE,
    completion_date DATE,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    source_reference VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    CONSTRAINT roadmap_items_status_check CHECK (status IN ('planned', 'in_progress', 'completed')),
    CONSTRAINT roadmap_items_priority_check CHECK (priority IN ('low', 'medium', 'high', 'critical'))
);
CREATE INDEX IF NOT EXISTS idx_roadmap_items_public_status_order
    ON roadmap_items(is_public, status, display_order, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_roadmap_items_source_reference_unique
    ON roadmap_items(source_reference)
    WHERE source_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS changelog_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version_number VARCHAR(50),
    title VARCHAR(255) NOT NULL,
    content_markdown TEXT NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    generated_by_ai BOOLEAN NOT NULL DEFAULT FALSE,
    source VARCHAR(30) NOT NULL DEFAULT 'manual',
    source_reference VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    CONSTRAINT changelog_entries_source_check CHECK (source IN ('manual', 'ai_agent', 'github', 'n8n', 'system'))
);
CREATE INDEX IF NOT EXISTS idx_changelog_entries_published
    ON changelog_entries(is_published, published_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_changelog_entries_source_reference
    ON changelog_entries(source, source_reference);

CREATE TABLE IF NOT EXISTS ai_content_generation_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_type VARCHAR(30) NOT NULL,
    raw_payload JSONB,
    generated_content JSONB,
    status VARCHAR(30) NOT NULL DEFAULT 'received',
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    source VARCHAR(80),
    CONSTRAINT ai_content_generation_logs_request_type_check CHECK (request_type IN ('changelog', 'roadmap', 'landing_copy')),
    CONSTRAINT ai_content_generation_logs_status_check CHECK (status IN ('received', 'processed', 'rejected', 'failed'))
);
CREATE INDEX IF NOT EXISTS idx_ai_content_logs_type_status_created
    ON ai_content_generation_logs(request_type, status, created_at DESC);

INSERT INTO landing_page_config (
    hero_title,
    hero_subtitle,
    hero_cta_label,
    hero_cta_url,
    hero_secondary_cta_label,
    hero_secondary_cta_url,
    marketing_intro_title,
    marketing_intro_description,
    footer_cta_title,
    footer_cta_description,
    footer_cta_label,
    footer_cta_url,
    created_by,
    updated_by
)
SELECT
    'QC Manager',
    'Plan, test, govern, and report quality work from one operational workspace.',
    'Sign in',
    '/login',
    'Create account',
    '/register',
    'Built for quality teams that need execution clarity',
    'QC Manager connects projects, tasks, test cases, bugs, governance metrics, and Tuleap sync activity so teams can see quality risk before release day.',
    'Ready to bring quality work into focus?',
    'Sign in to manage active work or request access from your QC Manager administrator.',
    'Open QC Manager',
    '/login',
    'system',
    'system'
WHERE NOT EXISTS (SELECT 1 FROM landing_page_config);

INSERT INTO landing_page_features (title, description, icon_key, display_order, is_active, created_by, updated_by)
SELECT title, description, icon_key, display_order, TRUE, 'system', 'system'
FROM (VALUES
    ('Quality work tracking', 'Manage tasks, stories, bugs, and linked artifacts without losing the context around release readiness.', 'clipboard-list', 10),
    ('Test execution visibility', 'Track cases, suites, runs, results, coverage, and defects in one connected quality workspace.', 'test-tube', 20),
    ('Governance and reporting', 'Use dashboards, quality gates, release controls, and exportable reports to make release decisions with evidence.', 'bar-chart', 30),
    ('Tuleap and n8n automation', 'Keep external artifact sync and workflow automation traceable without giving agents general admin access.', 'workflow', 40)
) AS defaults(title, description, icon_key, display_order)
WHERE NOT EXISTS (SELECT 1 FROM landing_page_features);
