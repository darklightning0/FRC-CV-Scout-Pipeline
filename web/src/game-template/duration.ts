export const MILLISECONDS_PER_SECOND = 1000;

export function millisecondsToSeconds(milliseconds: number | undefined | null): number {
    if (typeof milliseconds !== 'number' || Number.isNaN(milliseconds)) return 0;
    return milliseconds / MILLISECONDS_PER_SECOND;
}

export function formatDurationSecondsLabel(milliseconds: number | undefined | null): string {
    return `${Math.round(millisecondsToSeconds(milliseconds))}s`;
}
