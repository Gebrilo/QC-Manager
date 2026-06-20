/**
 * Pure helpers for artifact-link form fields (see ArtifactLinkField).
 *
 * These encode the contract that links are persisted as the *correct*
 * identifier for the column behind them — the artifact UUID for FK columns
 * (e.g. bugs.linked_test_case_ids UUID[]), the display id for human-readable
 * reference columns, or the title for title-matched columns — rather than as
 * whatever free text a user happened to type.
 */

export type ArtifactValueKey = 'id' | 'display_id' | 'title';

export interface PickableArtifact {
    id: string;
    display_id: string;
    title: string;
}

/** The string to persist for a chosen artifact, per the field's storage key. */
export function pickStoredValue(item: PickableArtifact, valueKey: ArtifactValueKey): string {
    if (valueKey === 'title') return item.title;
    if (valueKey === 'display_id') return item.display_id;
    return item.id;
}

/** Next field value after adding a selection. Single-select replaces;
 *  multi-select appends without duplicating. */
export function addLinkValue(
    current: string | string[],
    stored: string,
    multiple: boolean,
): string | string[] {
    if (!multiple) return stored;
    const list = Array.isArray(current) ? current : current ? [current] : [];
    return list.includes(stored) ? list : [...list, stored];
}

/** Next field value after removing a selection. */
export function removeLinkValue(
    current: string | string[],
    stored: string,
    multiple: boolean,
): string | string[] {
    if (!multiple) return '';
    const list = Array.isArray(current) ? current : current ? [current] : [];
    return list.filter(v => v !== stored);
}
