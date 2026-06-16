export function shouldRestoreAsyncSelectValue(
    savedValue: string | null | undefined,
    optionValues: Array<string | null | undefined>,
    isDirty: boolean
) {
    if (isDirty || !savedValue) return false;
    return optionValues.some(value => value === savedValue);
}
