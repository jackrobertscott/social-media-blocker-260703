export const ALLOWED_TEMPORARY_DURATIONS_MINUTES = [15, 30, 60, 120] as const;

export function normaliseTemporaryDurationMinutes(
  durationMinutes: number,
): number | null {
  return ALLOWED_TEMPORARY_DURATIONS_MINUTES.some(
    (allowedDuration) => allowedDuration === durationMinutes,
  )
    ? durationMinutes
    : null;
}
