export const COUNTDOWN_DURATION_MS = 24 * 60 * 60 * 1_000

export type ChestCycleState =
  | { status: 'counting'; deadline: number }
  | { status: 'openable' }
  | { status: 'claimed'; claimedAt: number }

export function resolveChestCycle(
  savedCycle: string | null,
  now: number,
): ChestCycleState {
  if (savedCycle === null) return { status: 'openable' }

  const legacyDeadline = Number(savedCycle)
  if (Number.isFinite(legacyDeadline)) {
    return advanceChestCycle({ status: 'counting', deadline: legacyDeadline }, now)
  }

  try {
    const parsed = JSON.parse(savedCycle) as unknown
    if (!isRecord(parsed) || typeof parsed.status !== 'string') {
      return { status: 'openable' }
    }

    if (parsed.status === 'openable') return { status: 'openable' }
    if (parsed.status === 'counting' && isFiniteNumber(parsed.deadline)) {
      return advanceChestCycle({ status: 'counting', deadline: parsed.deadline }, now)
    }
    if (parsed.status === 'claimed' && isFiniteNumber(parsed.claimedAt)) {
      return advanceChestCycle(
        beginNextChestCycle({ status: 'claimed', claimedAt: parsed.claimedAt }),
        now,
      )
    }
  } catch {
    return { status: 'openable' }
  }

  return { status: 'openable' }
}

export function advanceChestCycle(
  cycle: ChestCycleState,
  now: number,
): ChestCycleState {
  if (cycle.status === 'counting' && cycle.deadline <= now) {
    return { status: 'openable' }
  }
  return cycle
}

export function claimChest(
  cycle: ChestCycleState,
  claimedAt: number,
): ChestCycleState {
  if (cycle.status !== 'openable') return cycle
  return { status: 'claimed', claimedAt }
}

export function beginNextChestCycle(cycle: ChestCycleState): ChestCycleState {
  if (cycle.status !== 'claimed') return cycle
  return {
    status: 'counting',
    deadline: cycle.claimedAt + COUNTDOWN_DURATION_MS,
  }
}

export function serializeChestCycle(cycle: ChestCycleState): string {
  return JSON.stringify(cycle)
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
