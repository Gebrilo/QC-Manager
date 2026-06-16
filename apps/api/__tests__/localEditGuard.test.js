'use strict';

const { hasUnsyncedLocalEdit, UNSYNCED_STATUSES } = require('../src/services/persisters/localEditGuard');

describe('hasUnsyncedLocalEdit', () => {
  it('treats pending and failed as unsynced local edits', () => {
    expect(hasUnsyncedLocalEdit({ sync_status: 'pending' })).toBe(true);
    expect(hasUnsyncedLocalEdit({ sync_status: 'failed' })).toBe(true);
  });

  it('treats synced/standalone/null as safe to overwrite from Tuleap', () => {
    expect(hasUnsyncedLocalEdit({ sync_status: 'synced' })).toBe(false);
    expect(hasUnsyncedLocalEdit({ sync_status: 'standalone' })).toBe(false);
    expect(hasUnsyncedLocalEdit({ sync_status: null })).toBe(false);
    expect(hasUnsyncedLocalEdit({})).toBe(false);
  });

  it('is null-safe', () => {
    expect(hasUnsyncedLocalEdit(null)).toBe(false);
    expect(hasUnsyncedLocalEdit(undefined)).toBe(false);
  });

  it('exposes the guarded status set', () => {
    expect([...UNSYNCED_STATUSES].sort()).toEqual(['failed', 'pending']);
  });
});
