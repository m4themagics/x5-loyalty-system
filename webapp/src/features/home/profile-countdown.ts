export const COUNTDOWN_DURATION_MS = 24 * 60 * 60 * 1_000

export function resolveCountdownDeadline(
  savedDeadline: string | null,
  now: number,
): number {
  const parsedDeadline = savedDeadline === null ? Number.NaN : Number(savedDeadline)
  if (Number.isFinite(parsedDeadline) && parsedDeadline > now) return parsedDeadline
  return now + COUNTDOWN_DURATION_MS
}

export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1_000))
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')
}
