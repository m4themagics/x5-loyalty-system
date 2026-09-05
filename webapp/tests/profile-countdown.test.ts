import { expect, test } from 'bun:test'

import {
  COUNTDOWN_DURATION_MS,
  advanceChestCycle,
  beginNextChestCycle,
  claimChest,
  formatCountdown,
  resolveChestCycle,
  serializeChestCycle,
} from '../src/features/home/profile-countdown'

test('a new demo profile starts with a chest that can be opened immediately', () => {
  expect(resolveChestCycle(null, 1_000_000)).toEqual({ status: 'openable' })
})

test('a legacy deadline is unlocked once so old browser data cannot block the demo', () => {
  const now = 1_000_000
  const cycle = resolveChestCycle(String(now + 30_000), now)

  expect(cycle).toEqual({ status: 'openable' })
})

test('a current version future deadline remains in the counting state', () => {
  const now = 1_000_000
  const counting = { status: 'counting', deadline: now + 30_000 } as const
  const cycle = resolveChestCycle(serializeChestCycle(counting), now)

  expect(cycle).toEqual(counting)
  expect(formatCountdown(cycle.status === 'counting' ? cycle.deadline - now : 0))
    .toBe('00:00:30')
})

test('an expired deadline becomes openable and stays openable after reload', () => {
  const now = 1_000_000
  const expired = { status: 'counting', deadline: now - 1 } as const
  const openable = resolveChestCycle(serializeChestCycle(expired), now)

  expect(openable).toEqual({ status: 'openable' })
  expect(resolveChestCycle(serializeChestCycle(openable), now + 60_000))
    .toEqual({ status: 'openable' })
})

test('a running countdown transitions to openable when its deadline passes', () => {
  const counting = { status: 'counting', deadline: 1_001_000 } as const

  expect(advanceChestCycle(counting, 1_000_999)).toEqual(counting)
  expect(advanceChestCycle(counting, 1_001_000)).toEqual({ status: 'openable' })
})

test('claiming an openable chest records the claim before starting a new 24 hour cycle', () => {
  const claimedAt = 1_000_000
  const claimed = claimChest({ status: 'openable' }, claimedAt)
  const nextCycle = beginNextChestCycle(claimed)

  expect(claimed).toEqual({ status: 'claimed', claimedAt })
  expect(nextCycle).toEqual({
    status: 'counting',
    deadline: claimedAt + COUNTDOWN_DURATION_MS,
  })
  expect(formatCountdown(
    nextCycle.status === 'counting' ? nextCycle.deadline - claimedAt : 0,
  )).toBe('24:00:00')
})

test('invalid saved data fails open instead of silently postponing the reward', () => {
  expect(resolveChestCycle('not-valid-state', 1_000_000)).toEqual({ status: 'openable' })
})

test('an unversioned cycle from the broken release is unlocked during migration', () => {
  const oldCycle = JSON.stringify({ status: 'counting', deadline: 2_000_000 })

  expect(resolveChestCycle(oldCycle, 1_000_000)).toEqual({ status: 'openable' })
})

test('profile chest countdown never renders a negative value', () => {
  expect(formatCountdown(-10_000)).toBe('00:00:00')
})
