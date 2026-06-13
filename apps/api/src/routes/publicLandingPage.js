const express = require('express');
const router = express.Router();
const db = require('../config/db');

function toLimit(value, fallback = 6, max = 20) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, max);
}

function publicConfig(row) {
    return {
        hero_title: row.hero_title,
        hero_subtitle: row.hero_subtitle,
        hero_cta_label: row.hero_cta_label,
        hero_cta_url: row.hero_cta_url,
        hero_secondary_cta_label: row.hero_secondary_cta_label,
        hero_secondary_cta_url: row.hero_secondary_cta_url,
        marketing_intro_title: row.marketing_intro_title,
        marketing_intro_description: row.marketing_intro_description,
        show_features: row.show_features,
        show_roadmap: row.show_roadmap,
        show_changelog: row.show_changelog,
        show_footer_cta: row.show_footer_cta,
        footer_cta_title: row.footer_cta_title,
        footer_cta_description: row.footer_cta_description,
        footer_cta_label: row.footer_cta_label,
        footer_cta_url: row.footer_cta_url,
        is_public: row.is_public,
    };
}

function publicFeature(row) {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        icon_key: row.icon_key,
        display_order: row.display_order,
    };
}

function publicRoadmapItem(row) {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        priority: row.priority,
        target_date: row.target_date,
        completion_date: row.completion_date,
        display_order: row.display_order,
    };
}

function publicChangelogEntry(row) {
    return {
        id: row.id,
        version_number: row.version_number,
        title: row.title,
        content_markdown: row.content_markdown,
        published_at: row.published_at,
        generated_by_ai: row.generated_by_ai,
        source: row.source,
    };
}

router.get('/', async (req, res, next) => {
    try {
        const changelogLimit = toLimit(req.query.changelog_limit);

        const configResult = await db.query(`
            SELECT *
            FROM landing_page_config
            ORDER BY created_at ASC
            LIMIT 1
        `);
        const config = configResult.rows[0];

        if (!config || config.is_public !== true) {
            return res.status(404).json({ error: 'Landing page is not public' });
        }

        const [featuresResult, roadmapResult, changelogResult] = await Promise.all([
            db.query(`
                SELECT id, title, description, icon_key, display_order
                FROM landing_page_features
                WHERE is_active = true
                ORDER BY display_order ASC, created_at ASC
            `),
            db.query(`
                SELECT id, title, description, status, priority, target_date, completion_date, display_order
                FROM roadmap_items
                WHERE is_public = true
                ORDER BY
                    CASE status
                        WHEN 'in_progress' THEN 1
                        WHEN 'planned' THEN 2
                        WHEN 'completed' THEN 3
                        ELSE 4
                    END,
                    display_order ASC,
                    created_at DESC
            `),
            db.query(`
                SELECT id, version_number, title, content_markdown, published_at, generated_by_ai, source
                FROM changelog_entries
                WHERE is_published = true
                  AND (published_at IS NULL OR published_at <= NOW())
                ORDER BY published_at DESC NULLS LAST, created_at DESC
                LIMIT $1
            `, [changelogLimit]),
        ]);

        res.json({
            config: publicConfig(config),
            features: featuresResult.rows.map(publicFeature),
            roadmap_items: roadmapResult.rows.map(publicRoadmapItem),
            changelog_entries: changelogResult.rows.map(publicChangelogEntry),
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
