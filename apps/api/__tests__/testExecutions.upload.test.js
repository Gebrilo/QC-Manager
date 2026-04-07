/**
 * Jest tests for POST /test-executions/upload-excel — execution_date field
 */

jest.mock('../src/config/db', () => ({ pool: { connect: jest.fn() } }));

let validateExecutionDate;

beforeAll(() => {
  ({ validateExecutionDate } = require('../src/routes/testExecutions'));
});

describe('validateExecutionDate', () => {
  const today = new Date().toISOString().split('T')[0];

  test('returns null for undefined input (no date provided)', () => {
    expect(validateExecutionDate(undefined)).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(validateExecutionDate('')).toBeNull();
  });

  test('returns the date string for a valid past date', () => {
    expect(validateExecutionDate('2026-01-15')).toBe('2026-01-15');
  });

  test('returns the date string for today', () => {
    expect(validateExecutionDate(today)).toBe(today);
  });

  test('throws for a future date', () => {
    expect(() => validateExecutionDate('2099-12-31')).toThrow(
      'Execution date cannot be in the future'
    );
  });

  test('returns null for an invalid format (not YYYY-MM-DD)', () => {
    expect(validateExecutionDate('15/01/2026')).toBeNull();
  });

  test('returns null for a non-date string that fails the regex', () => {
    expect(validateExecutionDate('not-a-date')).toBeNull();
  });
});
