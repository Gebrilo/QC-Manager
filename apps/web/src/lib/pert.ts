export function pertEstimate(
    optimistic: number,
    mostLikely: number,
    pessimistic: number
): number {
    return Math.round(((optimistic + 4 * mostLikely + pessimistic) / 6) * 100) / 100;
}

export function pertStdDev(optimistic: number, pessimistic: number): number {
    return Math.round(((pessimistic - optimistic) / 6) * 100) / 100;
}
