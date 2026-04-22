require('dotenv').config();
const { defaultClient } = require('../src/services/tuleapClient');
const { FieldRegistry } = require('../src/services/tuleapFieldRegistry');
const { buildUserStoryPayload, buildTestCasePayload, buildTaskPayload, buildBugPayload } = require('../src/services/tuleapPayloadBuilder');

async function smoke() {
  const reg = new FieldRegistry(defaultClient);

  console.log('--- Testing FieldRegistry for USER STORY tracker ---');
  const usTrackerId = Number(process.env.TULEAP_TRACKER_USER_STORY);
  const summaryId = await reg.getFieldId(usTrackerId, 'summary');
  console.log('summary field_id:', summaryId);

  console.log('--- Building User Story payload (dry run) ---');
  const usPayload = await buildUserStoryPayload({
    trackerId: usTrackerId,
    summary: '[SMOKE TEST] Auto-created user story',
    description: '## Description\nThis is a smoke test.',
    acceptanceCriteria: '## AC\n- Given/When/Then',
    status: 'New',
    baAuthor: 'QC-Manager-Bot',
    requirementVersion: '1',
  }, reg);
  console.log('Payload values count:', usPayload.values.length);
  console.log(JSON.stringify(usPayload, null, 2));

  // Optionally POST (set DRY_RUN=false to actually create)
  if (process.env.DRY_RUN !== 'false') {
    console.log('\nDRY_RUN=true — not submitting. Set DRY_RUN=false to create.');
    return;
  }

  const res = await defaultClient.post('/artifacts', usPayload);
  console.log('Created artifact:', res.data.id, res.data.xref);
}

smoke().catch(err => {
  console.error('Smoke test failed:', err.message);
  if (err.raw) console.error('Tuleap details:', JSON.stringify(err.raw, null, 2));
  process.exit(1);
});