'use strict';

const crypto = require('crypto');
const db = require('../config/db');
const { generateTaskId } = require('./persisters/task');

const AI_SOURCE = 'ai_intake';
const STORY_REQUEST_TYPE = 'ai_intake_user_story';
const TASK_REQUEST_TYPE = 'ai_intake_task_generation';
const MAX_MARKDOWN_CHARS = parseInt(process.env.AI_INTAKE_MAX_MARKDOWN_CHARS || '', 10) || 50000;
const MAX_TASKS = parseInt(process.env.AI_INTAKE_MAX_TASKS || '', 10) || 20;

function safeJson(value) {
    try {
        return JSON.stringify(value ?? null);
    } catch {
        return JSON.stringify({ error: 'Payload could not be serialized' });
    }
}

function sanitizeMarkdown(input) {
    const value = String(input ?? '')
        .replace(/\r\n/g, '\n')
        .replace(/\u0000/g, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
        .trim();

    if (!value) {
        const err = new Error('content_markdown is required');
        err.status = 400;
        throw err;
    }

    if (value.length > MAX_MARKDOWN_CHARS) {
        const err = new Error(`content_markdown exceeds the ${MAX_MARKDOWN_CHARS} character limit`);
        err.status = 413;
        throw err;
    }

    return value;
}

function normalizeContentForHash(content) {
    return String(content || '')
        .replace(/\r\n/g, '\n')
        .replace(/\u0000/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function hashContent(content) {
    return crypto.createHash('sha256').update(normalizeContentForHash(content), 'utf8').digest('hex');
}

function deMarkdown(text) {
    return String(text || '')
        .replace(/[`*_>#\-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseTaskTitleAndDescription(value) {
    const text = String(value || '')
        .replace(/[`*_>#]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text) return null;

    const priorityMatch = text.match(/^\[(High|Medium|Low)\]\s+/i);
    const priority = priorityMatch
        ? priorityMatch[1].charAt(0).toUpperCase() + priorityMatch[1].slice(1).toLowerCase()
        : undefined;
    const withoutPriority = priorityMatch ? text.slice(priorityMatch[0].length).trim() : text;
    const separator = withoutPriority.match(/\s+-\s+|:\s+/);
    const title = deMarkdown(separator ? withoutPriority.slice(0, separator.index).trim() : withoutPriority);
    const description = deMarkdown(separator ? withoutPriority.slice(separator.index + separator[0].length).trim() : '');

    return title ? { title, description, priority } : null;
}

function parseSuggestedTasks(lines) {
    const tasks = [];
    let current = null;

    const finishCurrent = () => {
        if (current?.title) {
            tasks.push({
                title: current.title,
                description: current.description?.trim() || '',
                priority: current.priority,
            });
        }
        current = null;
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        const taskHeading = line.match(/^#{3,6}\s+(?:Task\s*\d+\s*[:.)-]?\s*)?(.*)$/i);
        const taskBullet = line.match(/^[-*]\s+(?:\[[ x]\]\s*)?(.*)$/i);
        const titleField = line.match(/^(?:title|task|name)\s*:\s*(.*)$/i);
        const priorityField = line.match(/^priority\s*:\s*(High|Medium|Low)$/i);
        const descriptionField = line.match(/^(?:description|notes)\s*:\s*(.*)$/i);

        if (taskHeading || taskBullet || titleField) {
            finishCurrent();
            current = parseTaskTitleAndDescription((taskHeading || taskBullet || titleField)[1]);
            continue;
        }

        if (!current) {
            current = parseTaskTitleAndDescription(line);
            continue;
        }

        if (priorityField) {
            current.priority = priorityField[1];
            continue;
        }

        if (descriptionField) {
            current.description = [current.description, descriptionField[1]].filter(Boolean).join('\n');
            continue;
        }

        current.description = [current.description, rawLine.trim()].filter(Boolean).join('\n');
    }

    finishCurrent();
    return tasks;
}

function collectSections(markdown) {
    const lines = markdown.split('\n');
    const sections = new Map();
    let title = '';
    let current = 'intro';
    sections.set(current, []);

    const push = (section, line) => {
        if (!sections.has(section)) {
            sections.set(section, []);
        }
        sections.get(section).push(line);
    };

    for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
            const level = heading[1].length;
            const headingText = deMarkdown(heading[2]);

            if (!title && level <= 2) {
                title = headingText || title;
                current = 'body';
                continue;
            }

            if (/^description$/i.test(headingText) || /^overview$/i.test(headingText) || /^summary$/i.test(headingText) || /^background$/i.test(headingText)) {
                current = 'description';
            } else if (/^acceptance criteria$/i.test(headingText) || /^acceptance$/i.test(headingText)) {
                current = 'acceptance_criteria';
            } else if (/^(suggested tasks|tasks|generated tasks|subtasks)$/i.test(headingText)) {
                current = 'tasks';
            } else {
                current = headingText.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'section';
            }
            continue;
        }

        if (!title && line.trim()) {
            title = deMarkdown(line);
            continue;
        }

        push(current, rawLine);
    }

    if (!sections.has('body')) {
        sections.set('body', []);
    }

    const description = sections.get('description')?.join('\n').trim()
        || sections.get('body')?.join('\n').trim()
        || sections.get('intro')?.join('\n').trim()
        || '';
    const acceptanceCriteria = sections.get('acceptance_criteria')?.join('\n').trim() || '';

    return {
        title: deMarkdown(title) || 'Untitled AI Story',
        description,
        acceptance_criteria: acceptanceCriteria,
        warnings: acceptanceCriteria ? [] : ['Acceptance criteria could not be extracted'],
        suggested_tasks: parseSuggestedTasks(sections.get('tasks') || []),
    };
}

function normalizeTaskInput(task) {
    const name = deMarkdown(task?.task_name || task?.title || '');
    if (!name) {
        const err = new Error('Each task requires a task_name or title');
        err.status = 400;
        throw err;
    }
    if (name.length > 255) {
        const err = new Error(`Task title '${name.slice(0, 32)}...' exceeds the 255 character limit`);
        err.status = 400;
        throw err;
    }

    const definitionOfDone = Array.isArray(task?.definition_of_done)
        ? task.definition_of_done.map(item => String(item).trim()).filter(Boolean)
        : [];
    const notes = typeof task?.notes === 'string' ? task.notes.trim() : '';
    const notesWithDefinition = definitionOfDone.length > 0
        ? [notes, `Definition of done:\n${definitionOfDone.map(item => `- ${item}`).join('\n')}`].filter(Boolean).join('\n\n')
        : notes;

    return {
        task_name: name,
        description: typeof task?.description === 'string' ? task.description.trim() : '',
        notes: notesWithDefinition,
        priority: ['High', 'Medium', 'Low'].includes(task?.priority) ? task.priority : 'Medium',
        estimate_days: task?.estimate_days ?? null,
        deadline: task?.deadline || null,
        expected_start_date: task?.expected_start_date || null,
        actual_start_date: task?.actual_start_date || null,
        tags: Array.isArray(task?.tags) ? task.tags.map(tag => String(tag).trim()).filter(Boolean) : null,
    };
}

async function getProjectAiIntake(projectId) {
    const result = await db.query(
        `SELECT id, project_id, project_name, team_id, ai_intake_enabled
           FROM projects
          WHERE id = $1 AND deleted_at IS NULL`,
        [projectId]
    );
    return result.rows[0] || null;
}

async function requireAiIntakeProject(projectId) {
    const project = await getProjectAiIntake(projectId);
    if (!project) {
        const err = new Error('Project not found');
        err.status = 404;
        throw err;
    }
    if (!project.ai_intake_enabled) {
        const err = new Error('AI intake is disabled for this project');
        err.status = 403;
        throw err;
    }
    return project;
}

function buildAiVisibility(projectRow) {
    return {
        owner_team_id: projectRow?.team_id || null,
        visibility_scope: projectRow?.team_id ? 'team' : 'project',
    };
}

async function findDuplicateStoryIntake({ projectId, contentHash }) {
    const result = await db.query(
        `SELECT id, user_story_id, generated_content
           FROM ai_content_generation_logs
          WHERE request_type = $1
            AND project_id = $2
            AND (content_hash = $3 OR source_content_hash = $3)
            AND force_import = FALSE
            AND status <> 'failed'
          LIMIT 1`,
        [STORY_REQUEST_TYPE, projectId, contentHash]
    );
    return result.rows[0] || null;
}

async function insertAiContentLog({
    requestType,
    projectId = null,
    userStoryId = null,
    contentHash = null,
    rawPayload = null,
    generatedContent = null,
    status = 'received',
    errorMessage = null,
    forceImport = false,
    source = null,
}) {
    const result = await db.query(`
        INSERT INTO ai_content_generation_logs (
            request_type,
            project_id,
            user_story_id,
            content_hash,
            source_content_hash,
            raw_payload,
            generated_content,
            status,
            error_message,
            force_import,
            source,
            processed_at
        ) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $7 IN ('processed', 'rejected', 'failed') THEN NOW() ELSE NULL END)
        RETURNING *
    `, [
        requestType,
        projectId,
        userStoryId,
        contentHash,
        rawPayload === null ? null : safeJson(rawPayload),
        generatedContent === null ? null : safeJson(generatedContent),
        status,
        errorMessage,
        forceImport,
        source,
    ]);
    return result.rows[0];
}

async function updateAiContentLog(id, patch) {
    const fields = [];
    const values = [];
    let idx = 1;

    for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        if (key === 'generated_content' || key === 'raw_payload') {
            fields.push(`${key} = $${idx++}`);
            values.push(value === null ? null : safeJson(value));
        } else {
            fields.push(`${key} = $${idx++}`);
            values.push(value);
        }
    }

    if (!fields.includes('processed_at = $' + idx)) {
        if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
            fields.push(`processed_at = CASE WHEN $${idx} IN ('processed', 'rejected', 'failed') THEN NOW() ELSE processed_at END`);
            values.push(patch.status);
            idx += 1;
        }
    }

    if (fields.length === 0) {
        return null;
    }

    const result = await db.query(
        `UPDATE ai_content_generation_logs
            SET ${fields.join(', ')}
          WHERE id = $${idx}
          RETURNING *`,
        [...values, id]
    );
    return result.rows[0] || null;
}

async function createStandaloneAiStory({
    projectRow,
    parsedStory,
    rawPayload,
    actorUserId = null,
}) {
    const visibility = buildAiVisibility(projectRow);
    const result = await db.query(`
        INSERT INTO user_stories (
            tuleap_artifact_id,
            tuleap_tracker_id,
            tuleap_url,
            title,
            description,
            acceptance_criteria,
            generated_by_ai,
            source,
            status,
            requirement_version,
            priority,
            ba_author,
            project_id,
            sync_status,
            owner_team_id,
            visibility_scope,
            created_by_user_id
        ) VALUES (
            NULL, NULL, NULL, $1, $2, $3, TRUE, 'ai_intake', 'Review', '1', $4, NULL, $5, 'standalone', $6, $7, $8
        )
        RETURNING *
    `, [
        parsedStory.title,
        parsedStory.description || '',
        parsedStory.acceptance_criteria || '',
        parsedStory.priority || 'None',
        projectRow.id,
        visibility.owner_team_id,
        visibility.visibility_scope,
        actorUserId,
    ]);
    return result.rows[0];
}

async function findExistingTaskTitle({ storyId, title }) {
    const result = await db.query(
        `SELECT id
           FROM tasks
          WHERE parent_user_story_id = $1
            AND deleted_at IS NULL
            AND LOWER(task_name) = LOWER($2)
          LIMIT 1`,
        [storyId, title]
    );
    return result.rows[0] || null;
}

async function createStandaloneAiTask({
    projectRow,
    storyId,
    taskInput,
    actorUserId = null,
}) {
    const normalized = normalizeTaskInput(taskInput);
    const task_id = await generateTaskId(db.query.bind(db));
    const visibility = buildAiVisibility(projectRow);

    const result = await db.query(`
        INSERT INTO tasks (
            task_id,
            project_id,
            task_name,
            description,
            status,
            priority,
            estimate_days,
            deadline,
            tags,
            notes,
            expected_start_date,
            actual_start_date,
            completed_date,
            parent_user_story_id,
            sync_status,
            generated_by_ai,
            source,
            owner_team_id,
            visibility_scope,
            created_by_user_id
        ) VALUES (
            $1, $2, $3, $4, 'Todo', $5, $6, $7, $8, $9, $10, $11, NULL, $12, 'standalone', TRUE, 'ai_intake', $13, $14, $15
        )
        RETURNING *
    `, [
        task_id,
        projectRow.id,
        normalized.task_name,
        normalized.description || '',
        normalized.priority || 'Medium',
        normalized.estimate_days,
        normalized.deadline,
        normalized.tags,
        normalized.notes || '',
        normalized.expected_start_date,
        normalized.actual_start_date,
        storyId,
        visibility.owner_team_id,
        visibility.visibility_scope,
        actorUserId,
    ]);

    return result.rows[0];
}

async function touchStoryForAiActivity(storyId) {
    const result = await db.query(
        `UPDATE user_stories
            SET updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [storyId]
    );
    return result.rows[0] || null;
}

async function loadAiStoryContext(storyId) {
    const result = await db.query(
        `SELECT us.*, p.project_name, p.team_id, p.ai_intake_enabled
           FROM user_stories us
           LEFT JOIN projects p ON p.id = us.project_id
          WHERE us.id = $1 AND us.deleted_at IS NULL`,
        [storyId]
    );
    return result.rows[0] || null;
}

async function loadGeneratedTasks(storyId) {
    const result = await db.query(
        `SELECT *
           FROM v_tasks_with_metrics
          WHERE parent_user_story_id = $1 AND deleted_at IS NULL
          ORDER BY created_at ASC`,
        [storyId]
    );
    return result.rows || [];
}

async function loadLatestTaskGenerationLog(storyId) {
    const result = await db.query(
        `SELECT *
           FROM ai_content_generation_logs
          WHERE user_story_id = $1 AND request_type = $2
          ORDER BY created_at DESC
          LIMIT 1`,
        [storyId, TASK_REQUEST_TYPE]
    );
    return result.rows[0] || null;
}

async function loadAiSourceForStory(storyId) {
    const result = await db.query(
        `SELECT *
           FROM ai_content_generation_logs
          WHERE request_type = $1
            AND (
                user_story_id = $2
                OR generated_content->>'story_id' = $2
            )
          ORDER BY created_at DESC
          LIMIT 1`,
        [STORY_REQUEST_TYPE, storyId]
    );
    const row = result.rows[0];
    if (!row) return null;

    const rawPayload = row.raw_payload && typeof row.raw_payload === 'object' ? row.raw_payload : {};
    return {
        source: AI_SOURCE,
        source_agent: rawPayload.source_agent || rawPayload.agent || null,
        skill_name: rawPayload.skill_name || rawPayload.skill || null,
        source_conversation_id: rawPayload.source_conversation_id || rawPayload.conversation_id || null,
        content_hash: row.source_content_hash || row.content_hash || null,
        raw_markdown: rawPayload.content_markdown || rawPayload.markdown || '',
    };
}

async function createAiTasksForStory({
    projectRow,
    storyId,
    tasks,
    actorUserId = null,
}) {
    const created = [];
    const skippedTitles = [];
    const seen = new Set();

    for (const rawTask of tasks) {
        const normalized = normalizeTaskInput(rawTask);
        const key = normalized.task_name.toLowerCase();
        if (seen.has(key)) {
            skippedTitles.push(normalized.task_name);
            continue;
        }
        seen.add(key);

        const existing = await findExistingTaskTitle({ storyId, title: normalized.task_name });
        if (existing) {
            skippedTitles.push(normalized.task_name);
            continue;
        }

        const task = await createStandaloneAiTask({
            projectRow,
            storyId,
            taskInput: normalized,
            actorUserId,
        });
        created.push(task);
    }

    return {
        tasks: created,
        skipped_titles: skippedTitles,
    };
}

module.exports = {
    AI_SOURCE,
    STORY_REQUEST_TYPE,
    TASK_REQUEST_TYPE,
    MAX_MARKDOWN_CHARS,
    MAX_TASKS,
    safeJson,
    sanitizeMarkdown,
    normalizeContentForHash,
    hashContent,
    parseAiStoryMarkdown: collectSections,
    normalizeTaskInput,
    getProjectAiIntake,
    requireAiIntakeProject,
    buildAiVisibility,
    findDuplicateStoryIntake,
    insertAiContentLog,
    updateAiContentLog,
    createStandaloneAiStory,
    createStandaloneAiTask,
    findExistingTaskTitle,
    touchStoryForAiActivity,
    loadAiStoryContext,
    loadGeneratedTasks,
    loadLatestTaskGenerationLog,
    loadAiSourceForStory,
    createAiTasksForStory,
};
