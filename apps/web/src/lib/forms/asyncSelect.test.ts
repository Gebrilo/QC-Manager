import { describe, expect, it } from 'vitest';
import { shouldRestoreAsyncSelectValue } from './asyncSelect';

describe('shouldRestoreAsyncSelectValue', () => {
    it('restores a saved value after its option becomes available', () => {
        expect(shouldRestoreAsyncSelectValue('res-1', ['res-1', 'res-2'], false)).toBe(true);
    });

    it('does not restore when the user has edited the field', () => {
        expect(shouldRestoreAsyncSelectValue('res-1', ['res-1'], true)).toBe(false);
    });

    it('does not restore empty or missing option values', () => {
        expect(shouldRestoreAsyncSelectValue('', ['res-1'], false)).toBe(false);
        expect(shouldRestoreAsyncSelectValue('res-3', ['res-1', 'res-2'], false)).toBe(false);
    });
});
