import { expect, test } from 'bun:test'

import {
  COUNTDOWN_DURATION_MS,
  formatCountdown,
  restartCountdownDeadline,
  resolveCountdownDeadline,
} from '../src/features/home/profile-countdown'

test('profile chest countdown starts at 24 hours and formats real remaining time', () => {
  const now = 1_000_000
  const deadline = resolveCountdownDeadline(null, now)

  expect(deadline).toBe(now + COUNTDOWN_DURATION_MS)
  expect(formatCountdown(deadline - now)).toBe('24:00:00')
  expect(formatCountdown(deadline - now - 1_000)).toBe('23:59:59')
})

test('profile chest countdown keeps a valid saved deadline and renews an expired one', () => {
  const now = 1_000_000

  expect(resolveCountdownDeadline(String(now + 30_000), now)).toBe(now + 30_000)
  expect(resolveCountdownDeadline(String(now - 1), now)).toBe(now + COUNTDOWN_DURATION_MS)
  expect(resolveCountdownDeadline('not-a-number', now)).toBe(now + COUNTDOWN_DURATION_MS)
})

test('profile chest countdown never renders a negative value', () => {
  expect(formatCountdown(-10_000)).toBe('00:00:00')
})

test('opening the profile chest restarts a fresh 24 hour countdown', () => {
  const openedAt = 1_000_000
  const deadline = restartCountdownDeadline(openedAt)

  expect(deadline).toBe(openedAt + COUNTDOWN_DURATION_MS)
  expect(formatCountdown(deadline - openedAt)).toBe('24:00:00')
})
