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

const TRACKER_IDS = {
  'user-story': () => Number(process.env.TULEAP_TRACKER_USER_STORY),
  'test-case':  () => Number(process.env.TULEAP_TRACKER_TEST_CASE),
  'task':       () => Number(process.env.TULEAP_TRACKER_TASK),
  'bug':        () => Number(process.env.TULEAP_TRACKER_BUG),
};

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
  if (!TRACKER_IDS[type]) {
    return res.status(404).json({ error: `Unknown artifact type: ${type}` });
  }
  const trackerId = TRACKER_IDS[type]();
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

  if (!type || !TRACKER_IDS[type]) {
    return res.status(400).json({ error: 'type is required and must be a valid artifact type (user-story, test-case, task, bug)' });
  }
  if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
    return res.status(400).json({ error: 'fields object is required and must not be empty' });
  }

  const trackerId = TRACKER_IDS[type]();
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

  if (!TRACKER_IDS[type]) {
    return res.status(404).json({ error: `Unknown artifact type: ${type}` });
  }

  const trackerId = TRACKER_IDS[type]();
  const builder   = BUILDERS[type];
  const input     = { ...req.body, trackerId };

  const required = REQUIRED_FIELDS[type] || [];
  const missing  = required.filter(k => !input[k] && input[k] !== 0);
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
