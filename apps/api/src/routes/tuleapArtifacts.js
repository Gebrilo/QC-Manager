const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { defaultClient } = require('../services/tuleapClient');
const { defaultRegistry } = require('../services/tuleapFieldRegistry');
const {
  buildUserStoryPayload,
  buildTestCasePayload,
  buildTaskPayload,
  buildBugPayload,
} = require('../services/tuleapPayloadBuilder');
const db = require('../config/db');
const { toTuleap } = require('../services/tuleapTransformEngine');

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
  'task':       buildTaskPayload,
  'bug':        buildBugPayload,
};

router.get('/:type/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const response = await defaultClient.get(`/artifacts/${id}`);
    return res.status(200).json(response.data);
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
    const response = await defaultClient.get('/artifacts', { params: { tracker: trackerId, limit, offset } });
    const items = Array.isArray(response.data) ? response.data : (response.data.collection || []);
    return res.status(200).json({ data: items, total: items.length });
  } catch (err) {
    return res.status(err.status || 502).json({ error: err.message, tuleap_status: err.status, details: err.raw });
  }
});

router.patch('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
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

router.post('/:type', requireAuth, async (req, res) => {
  const { type } = req.params;

  if (!FALLBACK_TRACKER_IDS[type]) {
    return res.status(404).json({ error: `Unknown artifact type: ${type}` });
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
