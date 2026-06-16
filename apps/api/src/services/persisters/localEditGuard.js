'use strict';

// "QC edit wins until synced": the inbound Tuleap sync must not overwrite a row
// that holds a local edit which has not yet been confirmed in Tuleap. A save
// flips sync_status to 'pending' and then 'synced' (push ok) or 'failed' (push
// rejected, e.g. an unbindable assignee). 'pending'/'failed' therefore mark a
// QC-side change that Tuleap does not yet have — skip the inbound overwrite so
// the user's edit survives. Retry logic clears 'failed'/'pending' to 'synced',
// after which inbound sync resumes normally.
const UNSYNCED_STATUSES = new Set(['pending', 'failed']);

function hasUnsyncedLocalEdit(row) {
  return !!row && UNSYNCED_STATUSES.has(row.sync_status);
}

module.exports = { hasUnsyncedLocalEdit, UNSYNCED_STATUSES };
