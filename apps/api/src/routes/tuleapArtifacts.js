const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { defaultClient } = require('../services/tuleapClient');
const { defaultRegistry } = require('../services/tuleapFieldRegistry');
const {
  buildUserStoryPayload,
  buildTestCasePayload,
  buildBugPayload,
} = require('../services/tuleapPayloadBuilder');
const db = require('../config/db');
const { toTuleap } = require('../services/tuleapTransformEngine');
const { emitToTuleap: emitBug } = require('../services/emitters/bug');
const { emitToTuleap: emitTask } = require('../services/emitters/task');
const { emitToTuleap: emitUserStory } = require('../services/emitters/user_story');
const { emitToTuleap: emitTestCase } = require('../services/emitters/test_case');
const { UnifiedPatchSchema } = require('../schemas/tuleapUnified');
const { adoptStagedAttachments } = require('./artifactAttachments');

const FALLBACK_TRACKER_IDS = {
  'user-story': () => Number(process.env.TULEAP_TRACKER_USER_STORY),
  'test-case':  () => Number(process.env.TULEAP_TRACKER_TEST_CASE),
  'task':       () => Number(process.env.TULEAP_TRACKER_TASK),
  'bug':        () => Number(process.env.TULEAP_TRACKER_BUG),
};

async function resolveConfig(artifactType, projectId) {
  if (!projectId) return null;
  const dbType = artifactType === 'user-story' ? 'user_story' : artifactType;
  const result = await db.pool.query(
    'SELECT * FROM tuleap_sync_config WHERE qc_project_id = $1 AND tracker_type = $2 AND is_active = true LIMIT 1',
    [projectId, dbType]
  );
  return result.rows[0] || null;
}

async function resolveTrackerId(artifactType, projectId) {
  const config = await resolveConfig(artifactType, projectId);
  if (config) return { trackerId: config.tuleap_tracker_id, config };
  const fallback = FALLBACK_TRACKER_IDS[artifactType];
  if (fallback) return { trackerId: fallback(), config: null };
  return { trackerId: null, config: null };
}

const REQUIRED_FIELDS = {
  'user-story': ['summary', 'status', 'requirementVersion'],
  'test-case':  ['title', 'testSteps', 'expectedResult'],
  'task':       ['taskTitle', 'assignedTo', 'team', 'status', 'parentStoryArtifactId'],
  'bug':        ['bugTitle', 'environment', 'serviceName'],
};

const BUILDERS = {
  'user-story': buildUserStoryPayload,
  'test-case':  buildTestCasePayload,
  'bug':        buildBugPayload,
};

router.get('/:type/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const response = await defaultClient.get(`/artifacts/${id}`);
    const artifact = { ...response.data };
    const trackerId = artifact?.tracker?.id;
    if (trackerId) {
      try {
        const configResult = await db.pool.query(
          'SELECT qc_project_id FROM tuleap_sync_config WHERE tuleap_tracker_id = $1 AND is_active = true LIMIT 1',
          [trackerId]
        );
        if (configResult.rows[0]) {
          artifact.project_id = configResult.rows[0].qc_project_id;
        }
      } catch (_) { /* enrichment is non-fatal */ }
    }
    return res.status(200).json(artifact);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: 'Artifact not found' });
    return res.status(err.status || 502).json({ error: err.message, tuleap_status: err.status, details: err.raw });
  }
});

router.get('/:type', requireAuth, async (req, res) => {
  const { type } = req.params;
  if (!FALLBACK_TRACKER_IDS[type]) {
    return res.status(404).json({ error: `Unknown artifact type: ${type}` });
  }
  const { trackerId } = await resolveTrackerId(type, req.query.project_id);
  if (!trackerId) {
    return res.status(400).json({ error: `No tracker configured for artifact type: ${type}` });
  }
  const limit  = Number(req.query.limit)  || 50;
  const offset = Number(req.query.offset) || 0;

  try {
    const response = await defaultClient.get(`/trackers/${trackerId}/artifacts`, { params: { limit, offset } });
    const items = Array.isArray(response.data) ? response.data : (response.data.collection || []);
    return res.status(200).json({ data: items, total: items.length });
  } catch (err) {
    return res.status(err.status || 502).json({ error: err.message, tuleap_status: err.status, details: err.raw });
  }
});

router.patch('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  if (req.body && req.body.artifact_type) {
    let body = req.body;
    if (!body.project_id || body.project_id === '') {
      try {
        const artResponse = await defaultClient.get(`/artifacts/${id}`);
        const trackerId = artResponse.data?.tracker?.id;
        if (trackerId) {
          const configResult = await db.pool.query(
            'SELECT qc_project_id FROM tuleap_sync_config WHERE tuleap_tracker_id = $1 AND is_active = true LIMIT 1',
            [trackerId]
          );
          if (configResult.rows[0]) {
            body = { ...body, project_id: configResult.rows[0].qc_project_id };
          }
        }
      } catch (_) { /* fallback lookup is non-fatal; schema will surface the error */ }
    }
    const parsed = UnifiedPatchSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid unified patch payload', details: parsed.error.format() });
    }
    const unified = parsed.data;
    if (['bug', 'task', 'user_story'].includes(unified.artifact_type)) {
      const trackerType = unified.artifact_type;
      const configResult = await db.pool.query(
        `SELECT * FROM tuleap_sync_config WHERE qc_project_id = $1 AND tracker_type = $2 AND is_active = true`,
        [unified.project_id, trackerType]
      );
      const config = configResult.rows[0];
      if (!config) {
        return res.status(400).json({ error: `No active ${trackerType} config for project ${unified.project_id}` });
      }
      const unifiedWithTuleap = {
        ...unified,
        tuleap: { ...(unified.tuleap || {}), artifact_id: Number(id) },
      };
      const EMITTERS = { bug: emitBug, task: emitTask, user_story: emitUserStory, test_case: emitTestCase };
      const emitter = EMITTERS[trackerType];
      try {
        const result = await emitter(unifiedWithTuleap, config, 'update', {
          client: defaultClient,
          registry: defaultRegistry,
          query: db.pool.query.bind(db.pool),
        });
        return res.status(200).json({ updated: true, ...result });
      } catch (err) {
        return res.status(err.status || 502).json({ error: err.message, tuleap_status: err.status, details: err.raw });
      }
    }
  }

  const { type, fields } = req.body;

  if (!type || !FALLBACK_TRACKER_IDS[type]) {
    return res.status(400).json({ error: 'type is required and must be a valid artifact type (user-story, test-case, task, bug)' });
  }
  if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
    return res.status(400).json({ error: 'fields object is required and must not be empty' });
  }

  const trackerId = FALLBACK_TRACKER_IDS[type]();
  const values = [];

  try {
    for (const [fieldName, fieldValue] of Object.entries(fields)) {
      const field = await defaultRegistry.getField(trackerId, fieldName);
      if (['sb', 'rb', 'msb'].includes(field.type)) {
        const bound = await defaultRegistry.resolveBindValue(trackerId, fieldName, fieldValue);
        values.push({ field_id: field.field_id, bind_value_ids: [bound.id] });
      } else {
        values.push({ field_id: field.field_id, value: fieldValue });
      }
    }
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    await defaultClient.put(`/artifacts/${id}`, { values });
    return res.status(200).json({ updated: true });
  } catch (err) {
    return res.status(err.status || 502).json({ error: err.message, tuleap_status: err.status, details: err.raw });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    await defaultClient.delete(`/artifacts/${id}`);
    return res.status(200).json({ deleted: true });
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: 'Artifact not found' });
    return res.status(err.status || 502).json({ error: err.message, tuleap_status: err.status, details: err.raw });
  }
});

async function handleTaskCreate(req, res) {
  const { artifact_type, project_id, common, fields } = req.body;
  const pid = project_id || req.body.project_id;

  if (!pid) {
    return res.status(400).json({ error: 'project_id is required' });
  }

  let config;
  try {
    const configResult = await db.pool.query(
      `SELECT * FROM tuleap_sync_config WHERE qc_project_id = $1 AND tracker_type = 'task' AND is_active = true`,
      [pid]
    );
    config = configResult.rows[0];
  } catch (err) {
    return res.status(500).json({ error: `DB error resolving task config: ${err.message}` });
  }
  if (!config) {
    return res.status(400).json({ error: `No active task config for project ${pid}` });
  }

  let unified;
  if (artifact_type && common) {
    unified = { artifact_type: 'task', project_id: pid, common, fields: fields || {} };
  } else {
    unified = {
      artifact_type: 'task',
      project_id: pid,
      common: {
        title: req.body.taskName || req.body.task_title || req.body.title,
        description: req.body.notes || req.body.description || '',
        status: req.body.status,
        assigned_to: req.body.assignedTo,
      },
      fields: {
        team: req.body.team,
        parent_story_id: req.body.parentStoryArtifactId,
        blocked_reason: req.body.blocked_reason,
      },
    };
  }

  try {
    const result = await emitTask(unified, config, 'create', {
      client: defaultClient,
      registry: defaultRegistry,
      query: db.pool.query.bind(db.pool),
    });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(err.status || 502).json({ error: err.message, tuleap_status: err.status, details: err.raw });
  }
}

async function handleBugCreate(req, res) {
  const { artifact_type, project_id, common, fields } = req.body;
  const temp_id = req.body.temp_id;
  const resolvedType = artifact_type || 'bug';

  if (!project_id && !req.body.project_id) {
    return res.status(400).json({ error: 'project_id is required' });
  }

  const pid = project_id || req.body.project_id;

  let config;
  try {
    const configResult = await db.pool.query(
      `SELECT * FROM tuleap_sync_config WHERE qc_project_id = $1 AND tracker_type = 'bug' AND is_active = true`,
      [pid]
    );
    config = configResult.rows[0];
  } catch (err) {
    return res.status(500).json({ error: `DB error resolving bug config: ${err.message}` });
  }

  if (!config) {
    try {
      const bugData = (artifact_type && common) ? common : {
        title: req.body.summary || req.body.bugTitle || req.body.title,
        description: req.body.description || '',
        status: req.body.status || 'New',
        assigned_to: req.body.assignedTo || null,
        priority: req.body.priority || 'medium',
      };
      const bugFields = (artifact_type && fields) ? fields : {
        severity: req.body.severity || 'medium',
        environment: req.body.environment || null,
        service_name: req.body.serviceName || req.body.service_name || null,
      };
      const bugId = `BUG-${Date.now().toString(36).toUpperCase()}`;
      const result = await db.pool.query(
        `INSERT INTO bugs (bug_id, project_id, title, description, status, severity,
                           priority, environment, service_name, assigned_to, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'EXPLORATORY') RETURNING id`,
        [bugId, pid, bugData.title, bugData.description || null, bugData.status || 'New',
         bugFields.severity || 'medium', bugData.priority || 'medium',
         bugFields.environment || null, bugFields.service_name || null,
         bugData.assigned_to || null]
      );
      const qcId = result.rows[0].id;
      if (temp_id && qcId) {
          await adoptStagedAttachments('bug', qcId, temp_id, req.user?.id)
              .catch(err => console.error('[attachments:adopt] bug-local', err.message));
      }
      return res.status(201).json({
        qc_id: qcId,
        tuleap_artifact_id: null,
        tuleap_url: null,
        artifact_type: 'bug',
        tuleap_warning: `No active Tuleap sync config for this project. Bug saved locally only.`,
      });
    } catch (err) {
      return res.status(500).json({ error: `Failed to save bug locally: ${err.message}` });
    }
  }

  let unified;
  if (artifact_type && common) {
    unified = { artifact_type: 'bug', project_id: pid, common, fields: fields || {} };
  } else {
    unified = {
      artifact_type: 'bug',
      project_id: pid,
      common: {
        title: req.body.summary || req.body.bugTitle || req.body.title,
        description: req.body.description || '',
        status: req.body.status,
        assigned_to: req.body.assignedTo,
        priority: req.body.priority,
      },
      fields: {
        severity: req.body.severity,
        environment: req.body.environment,
        service_name: req.body.serviceName || req.body.service_name,
      },
    };
  }

  try {
    const result = await emitBug(unified, config, 'create', {
      client: defaultClient,
      registry: defaultRegistry,
      query: db.pool.query.bind(db.pool),
    });
    if (temp_id && result.qc_id) {
        await adoptStagedAttachments('bug', result.qc_id, temp_id, req.user?.id)
            .catch(err => console.error('[attachments:adopt] bug', err.message));
    }
    return res.status(201).json(result);
  } catch (err) {
    return res.status(err.status || 502).json({ error: err.message, tuleap_status: err.status, details: err.raw });
  }
}

async function handleUserStoryCreate(req, res) {
  const { artifact_type, project_id, common, fields } = req.body;
  const temp_id = req.body.temp_id;
  const pid = project_id || req.body.project_id;

  if (!pid) {
    return res.status(400).json({ error: 'project_id is required' });
  }

  let config;
  try {
    const configResult = await db.pool.query(
      `SELECT * FROM tuleap_sync_config WHERE qc_project_id = $1 AND tracker_type = 'user_story' AND is_active = true`,
      [pid]
    );
    config = configResult.rows[0];
  } catch (err) {
    return res.status(500).json({ error: `DB error resolving user_story config: ${err.message}` });
  }
  if (!config) {
    try {
      const usData = (artifact_type && common) ? common : {
        title: req.body.summary || req.body.title,
        description: req.body.description || req.body.overviewDescription || '',
        status: req.body.status || 'Draft',
        priority: req.body.priority || 'P3-Medium',
      };
      const usFields = (artifact_type && fields) ? fields : {
        acceptance_criteria: req.body.acceptanceCriteria || req.body.acceptance_criteria || null,
        requirement_version: req.body.requirementVersion || req.body.requirement_version || '1',
      };
      const result = await db.pool.query(
        `INSERT INTO user_stories (title, description, status, priority,
                                    acceptance_criteria, requirement_version, project_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [usData.title, usData.description || null, usData.status || 'Draft',
         usData.priority || 'P3-Medium', usFields.acceptance_criteria || null,
         usFields.requirement_version || '1', pid]
      );
      return res.status(201).json({
        qc_id: result.rows[0].id,
        tuleap_artifact_id: null,
        tuleap_url: null,
        artifact_type: 'user_story',
        tuleap_warning: `No active Tuleap sync config for this project. User story saved locally only.`,
      });
    } catch (err) {
      return res.status(500).json({ error: `Failed to save user story locally: ${err.message}` });
    }
  }

  let unified;
  if (artifact_type && common) {
    const cleanedCommon = { ...common };
    if (cleanedCommon.priority === 'None') delete cleanedCommon.priority;
    unified = { artifact_type: 'user_story', project_id: pid, common: cleanedCommon, fields: fields || {} };
  } else {
    const rawPriority = req.body.priority;
    unified = {
      artifact_type: 'user_story',
      project_id: pid,
      common: {
        title: req.body.summary || req.body.title,
        description: req.body.description || req.body.overviewDescription || '',
        status: req.body.status,
        priority: rawPriority === 'None' ? undefined : rawPriority,
      },
      fields: {
        acceptance_criteria: req.body.acceptanceCriteria || req.body.acceptance_criteria,
        requirement_version: req.body.requirementVersion || req.body.requirement_version,
        ba_author: req.body.baAuthor || req.body.ba_author,
      },
    };
  }

  try {
    const result = await emitUserStory(unified, config, 'create', {
      client: defaultClient,
      registry: defaultRegistry,
      query: db.pool.query.bind(db.pool),
    });
    if (temp_id && result.qc_id) {
        await adoptStagedAttachments('user_story', result.qc_id, temp_id, req.user?.id)
            .catch(err => console.error('[attachments:adopt] user_story', err.message));
    }
    return res.status(201).json(result);
  } catch (err) {
    return res.status(err.status || 502).json({ error: err.message, tuleap_status: err.status, details: err.raw });
  }
}

async function handleTestCaseCreate(req, res) {
  const { artifact_type, project_id, common, fields } = req.body;
  const pid = project_id || req.body.project_id;

  if (!pid) {
    return res.status(400).json({ error: 'project_id is required' });
  }

  const configResult = await db.pool.query(
    `SELECT * FROM tuleap_sync_config WHERE qc_project_id = $1 AND tracker_type = 'test_case' AND is_active = true`,
    [pid]
  );
  const config = configResult.rows[0];
  if (!config) {
    return res.status(400).json({ error: `No active test_case config for project ${pid}` });
  }

  let unified;
  if (artifact_type && common) {
    unified = { artifact_type: 'test_case', project_id: pid, common, fields: fields || {} };
  } else {
    unified = {
      artifact_type: 'test_case',
      project_id: pid,
      common: {
        title: req.body.title,
        description: req.body.description || '',
        status: req.body.status,
        priority: req.body.priority,
      },
      fields: {
        test_steps: req.body.testSteps,
        expected_result: req.body.expectedResult,
      },
    };
  }

  try {
    const result = await emitTestCase(unified, config, 'create', {
      client: defaultClient,
      registry: defaultRegistry,
      query: db.pool.query.bind(db.pool),
    });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(err.status || 502).json({ error: err.message, tuleap_status: err.status, details: err.raw });
  }
}

router.post('/:type', requireAuth, async (req, res) => {
  const { type } = req.params;

  if (!FALLBACK_TRACKER_IDS[type]) {
    return res.status(404).json({ error: `Unknown artifact type: ${type}` });
  }

  const normalizedType = type === 'user-story' ? 'user_story' : type;

  if (normalizedType === 'bug') {
    return handleBugCreate(req, res);
  }

  if (normalizedType === 'task') {
    return handleTaskCreate(req, res);
  }

  if (normalizedType === 'user_story' && (req.body.project_id || req.body.artifact_type)) {
    return handleUserStoryCreate(req, res);
  }

  if (normalizedType === 'test_case' && (req.body.project_id || req.body.artifact_type)) {
    return handleTestCaseCreate(req, res);
  }

  if (req.body.artifact_type && req.body.common) {
    const { artifact_type, project_id, common, fields } = req.body;
    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required for unified payload' });
    }
    const configResult = await db.pool.query(
      `SELECT * FROM tuleap_sync_config WHERE qc_project_id = $1 AND tracker_type = $2 AND is_active = true`,
      [project_id, artifact_type]
    );
    const config = configResult.rows[0];
    if (!config) {
      return res.status(400).json({ error: `No active config for type '${artifact_type}' in project ${project_id}` });
    }
    const tuleapPayload = toTuleap({ artifact_type, common, fields }, config);
    const trackerId = config.tuleap_tracker_id;
    const values = [];
    try {
      for (const [tuleapFieldName, fieldValue] of Object.entries(tuleapPayload)) {
        if (fieldValue === undefined || fieldValue === null) continue;
        const field = await defaultRegistry.getField(trackerId, tuleapFieldName);
        let shape;
        if (['sb', 'rb', 'msb', 'cb'].includes(field.type)) {
          if (Array.isArray(fieldValue)) {
            const boundIds = await Promise.all(
              fieldValue.map(v => defaultRegistry.resolveBindValue(trackerId, tuleapFieldName, v).then(b => b.id))
            );
            shape = { bind_value_ids: boundIds };
          } else {
            const bound = await defaultRegistry.resolveBindValue(trackerId, tuleapFieldName, fieldValue);
            shape = { bind_value_ids: [bound.id] };
          }
        } else if (field.type === 'art_link') {
          const links = Array.isArray(fieldValue)
            ? fieldValue.map(id => ({ id: Number(id) }))
            : [{ id: Number(fieldValue) }];
          shape = { links };
        } else {
          shape = { value: fieldValue };
        }
        values.push({ field_id: field.field_id, ...shape });
      }
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const payload = { tracker: { id: trackerId }, values };
    let response;
    try {
      response = await defaultClient.post('/artifacts', payload);
    } catch (err) {
      return res.status(err.status || 502).json({ error: err.message, tuleap_status: err.status, details: err.raw });
    }
    const artifact = response.data;
    const base = config.tuleap_base_url || process.env.TULEAP_BASE_URL || 'https://tuleap.windinfosys.com';
    return res.status(201).json({
      tuleap_artifact_id: artifact.id,
      tuleap_url: `${base}/plugins/tracker/?aid=${artifact.id}`,
      artifact_type,
      xref: artifact.xref || null,
    });
  }

  const { trackerId, config } = await resolveTrackerId(type, req.body.project_id);
  if (!trackerId) {
    return res.status(400).json({ error: `No tracker configured for artifact type: ${type}` });
  }

  const projectId = req.body.project_id;

  // Dynamic payload building when config has artifact_fields
  if (config && config.artifact_fields && Object.keys(config.artifact_fields).length > 0) {
    const unified = {
      artifact_type: type === 'user-story' ? 'user_story' : type,
      project_id: projectId,
      common: {
        title: req.body.summary || req.body.bugTitle || req.body.taskTitle || req.body.title,
        description: req.body.description || req.body.overviewDescription || '',
        status: req.body.status,
        assigned_to: req.body.assignedTo,
        priority: req.body.priority,
      },
      fields: {},
    };

    const commonBodyKeys = new Set([
      'summary', 'bugTitle', 'taskTitle', 'title',
      'description', 'overviewDescription',
      'status', 'assignedTo', 'priority',
      'project_id', 'trackerId',
    ]);

    const camelToSnakeOverrides = {
      attachmentIds: 'attachments',
      linkedArtifactIds: 'links',
      testCaseArtifactId: 'linked_test_case_ids',
      parentStoryArtifactId: 'parent_story_id',
    };

    for (const key of Object.keys(req.body)) {
      if (commonBodyKeys.has(key)) continue;
      const snakeKey = camelToSnakeOverrides[key] || key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      unified.fields[snakeKey] = req.body[key];
    }

    const tuleapValues = toTuleap(unified, config);
    const values = [];

    try {
      for (const [tuleapFieldName, fieldValue] of Object.entries(tuleapValues)) {
        if (fieldValue === undefined || fieldValue === null) continue;

        const field = await defaultRegistry.getField(trackerId, tuleapFieldName);
        let shape;

        if (['sb', 'rb', 'msb', 'cb'].includes(field.type)) {
          if (Array.isArray(fieldValue)) {
            const boundIds = await Promise.all(
              fieldValue.map(v => defaultRegistry.resolveBindValue(trackerId, tuleapFieldName, v).then(b => b.id))
            );
            shape = { bind_value_ids: boundIds };
          } else {
            const bound = await defaultRegistry.resolveBindValue(trackerId, tuleapFieldName, fieldValue);
            shape = { bind_value_ids: [bound.id] };
          }
        } else if (field.type === 'art_link') {
          const links = Array.isArray(fieldValue)
            ? fieldValue.map(id => ({ id: Number(id) }))
            : [{ id: Number(fieldValue) }];
          shape = { links };
        } else {
          shape = { value: fieldValue };
        }

        values.push({ field_id: field.field_id, ...shape });
      }
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const payload = { tracker: { id: trackerId }, values };

    let response;
    try {
      response = await defaultClient.post('/artifacts', payload);
    } catch (err) {
      return res.status(err.status || 502).json({ error: err.message, tuleap_status: err.status, details: err.raw });
    }

    const artifact = response.data;
    const base = process.env.TULEAP_BASE_URL || 'https://tuleap.windinfosys.com';
    return res.status(201).json({
      tuleap_artifact_id: artifact.id,
      tuleap_url: `${base}/plugins/tracker/?aid=${artifact.id}`,
      artifact_type: type,
      xref: artifact.xref,
    });
  }

  // Fallback to existing builder-based flow
  const builder = BUILDERS[type];
  const input = { ...req.body, trackerId };

  const required = REQUIRED_FIELDS[type] || [];
  const missing = required.filter(k => !input[k] && input[k] !== 0);
  if (missing.length) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  let payload;
  try {
    payload = await builder(input, defaultRegistry);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  let response;
  try {
    response = await defaultClient.post('/artifacts', payload);
  } catch (err) {
    return res.status(err.status || 502).json({ error: err.message, tuleap_status: err.status, details: err.raw });
  }

  const artifact = response.data;
  const base = process.env.TULEAP_BASE_URL || 'https://tuleap.windinfosys.com';
  return res.status(201).json({
    tuleap_artifact_id: artifact.id,
    tuleap_url: `${base}/plugins/tracker/?aid=${artifact.id}`,
    artifact_type: type,
    xref: artifact.xref,
  });
});

module.exports = router;
