const { normalize } = require('../src/services/tuleapValueNormalizer');

describe('tuleapValueNormalizer.normalize', () => {
  it('extracts a simple value field by name', () => {
    const raw = {
      values: [
        { field_id: 1, name: 'bug_title', label: 'Title', value: 'Login crashes' }
      ]
    };
    const result = normalize(raw, null);
    expect(result).toEqual({ bug_title: 'Login crashes' });
  });

  it('prefers name over label when both are present', () => {
    const raw = {
      values: [
        { field_id: 1, name: 'severity', label: 'Localized Severity', value: 'high' }
      ]
    };
    expect(normalize(raw, null)).toEqual({ severity: 'high' });
  });

  it('falls back to label when name is missing', () => {
    const raw = {
      values: [
        { field_id: 1, label: 'fallback_key', value: 'x' }
      ]
    };
    expect(normalize(raw, null)).toEqual({ fallback_key: 'x' });
  });

  it('skips fields with no name or label', () => {
    const raw = { values: [{ field_id: 1, value: 'orphan' }] };
    expect(normalize(raw, null)).toEqual({});
  });

  it('skips fields whose value is null or undefined and have no values array', () => {
    const raw = {
      values: [
        { name: 'a', value: null },
        { name: 'b', value: undefined },
        { name: 'c', value: 'kept' }
      ]
    };
    expect(normalize(raw, null)).toEqual({ c: 'kept' });
  });

  it('returns label from values[] when single bind_value_id is present (no value)', () => {
    const raw = {
      values: [
        { name: 'severity', values: [{ id: 303, label: 'Major impact' }] }
      ]
    };
    expect(normalize(raw, null)).toEqual({ severity: 'Major impact' });
  });

  it('handles a multi-bind values array by returning array of labels', () => {
    const raw = {
      values: [
        {
          name: 'environment',
          values: [
            { id: 1, label: 'DEV' },
            { id: 2, label: 'TEST' }
          ]
        }
      ]
    };
    expect(normalize(raw, null)).toEqual({ environment: ['DEV', 'TEST'] });
  });

  it('resolves bind_value_ids against tracker definition when no inline values', () => {
    const raw = {
      values: [
        { name: 'severity', bind_value_ids: [303] }
      ]
    };
    const tracker = {
      fields: [
        {
          name: 'severity',
          values: [
            { id: 303, label: 'Major impact' },
            { id: 304, label: 'Minor impact' }
          ]
        }
      ]
    };
    expect(normalize(raw, tracker)).toEqual({ severity: 'Major impact' });
  });

  it('resolves multi bind_value_ids against tracker definition', () => {
    const raw = {
      values: [
        { name: 'environment', bind_value_ids: [1, 2] }
      ]
    };
    const tracker = {
      fields: [
        {
          name: 'environment',
          values: [
            { id: 1, label: 'DEV' },
            { id: 2, label: 'TEST' },
            { id: 3, label: 'PROD' }
          ]
        }
      ]
    };
    expect(normalize(raw, tracker)).toEqual({ environment: ['DEV', 'TEST'] });
  });

  it('returns empty object for missing or empty values array', () => {
    expect(normalize({}, null)).toEqual({});
    expect(normalize({ values: [] }, null)).toEqual({});
    expect(normalize(null, null)).toEqual({});
  });
});
