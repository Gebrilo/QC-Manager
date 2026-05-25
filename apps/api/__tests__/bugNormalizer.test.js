const {
  normalizeBugStatus,
  normalizeBugSeverity,
} = require('../src/services/normalizers/bug');

describe('bug normalizers', () => {
  describe('normalizeBugStatus', () => {
    it.each([
      ['New', 'New'],
      ['In Progress', 'In Progress'],
      ['Assigned', 'Assigned'],
      ['Reopened', 'Reopened'],
      ['Blocked', 'Blocked'],
      ['Fixed', 'Fixed'],
      ['Verified', 'Verified'],
      ['Duplicate', 'Duplicate'],
      ['Closed', 'Closed'],
      ['open', 'New'],
      ['Open', 'New'],
      ['OPEN', 'New'],
      ['Backlog', 'New'],
      ['backlog', 'New'],
      ['in progress', 'In Progress'],
      ['IN PROGRESS', 'In Progress'],
      ['assigned', 'Assigned'],
      ['reopened', 'Reopened'],
      ['blocked', 'Blocked'],
      ['resolved', 'Fixed'],
      ['Resolved', 'Fixed'],
      ['fixed', 'Fixed'],
      ['verified', 'Verified'],
      ['duplicate', 'Duplicate'],
      ['closed', 'Closed'],
      ['  open  ', 'New'],
      ['  In Progress  ', 'In Progress'],
      [null, 'New'],
      ['', 'New'],
      ['    ', 'New'],
      ['waiting-for-vendor', 'New'],
    ])('normalizes %p to %p', (raw, expected) => {
      expect(normalizeBugStatus(raw)).toBe(expected);
    });
  });

  describe('normalizeBugSeverity', () => {
    it.each([
      ['Critical Impact', 'Critical Impact'],
      ['Major impact', 'Major impact'],
      ['Minor Impact', 'Minor Impact'],
      ['Cosmetic impact', 'Cosmetic impact'],
      ['None', 'None'],
      ['critical', 'Critical Impact'],
      ['Critical', 'Critical Impact'],
      ['CRITICAL', 'Critical Impact'],
      ['Critical impact', 'Critical Impact'],
      ['critical impact', 'Critical Impact'],
      ['CRITICAL IMPACT', 'Critical Impact'],
      ['high', 'Major impact'],
      ['High', 'Major impact'],
      ['HIGH', 'Major impact'],
      ['major impact', 'Major impact'],
      ['MAJOR IMPACT', 'Major impact'],
      ['medium', 'Minor Impact'],
      ['Medium', 'Minor Impact'],
      ['minor impact', 'Minor Impact'],
      ['Minor impact', 'Minor Impact'],
      ['MINOR IMPACT', 'Minor Impact'],
      ['low', 'Cosmetic impact'],
      ['Low', 'Cosmetic impact'],
      ['cosmetic impact', 'Cosmetic impact'],
      ['Cosmetic Impact', 'Cosmetic impact'],
      ['COSMETIC IMPACT', 'Cosmetic impact'],
      ['none', 'None'],
      ['  Critical impact  ', 'Critical Impact'],
      ['  major impact  ', 'Major impact'],
      [null, 'None'],
      ['', 'None'],
      ['    ', 'None'],
      ['enterprise blocker', 'None'],
    ])('normalizes %p to %p', (raw, expected) => {
      expect(normalizeBugSeverity(raw)).toBe(expected);
    });
  });
});
