// Canonical status/severity labels per migration 033. Tuleap and legacy QC
// data ship in mixed-case and use older synonyms; map them to the labels the
// v_bug_summary views filter on, otherwise the dashboards count zero.
const STATUS_MAP = {
  'open': 'New',
  'new': 'New',
  'backlog': 'New',
  'in progress': 'In Progress',
  'assigned': 'Assigned',
  'reopened': 'Reopened',
  'blocked': 'Blocked',
  'resolved': 'Fixed',
  'fixed': 'Fixed',
  'verified': 'Verified',
  'duplicate': 'Duplicate',
  'closed': 'Closed',
};

const SEVERITY_MAP = {
  'critical': 'Critical Impact',
  'critical impact': 'Critical Impact',
  'high': 'Major impact',
  'major impact': 'Major impact',
  'medium': 'Minor Impact',
  'minor impact': 'Minor Impact',
  'low': 'Cosmetic impact',
  'cosmetic impact': 'Cosmetic impact',
  'none': 'None',
};

function normalizeBugStatus(raw) {
  if (raw == null || raw === '') return 'New';
  return STATUS_MAP[String(raw).toLowerCase().trim()] || 'New';
}

function normalizeBugSeverity(raw) {
  if (raw == null || raw === '') return 'None';
  return SEVERITY_MAP[String(raw).toLowerCase().trim()] || 'None';
}

module.exports = {
  normalizeBugStatus,
  normalizeBugSeverity,
};
