import type { DemoApiFailure } from './demo-api'
import { profileItems } from './profile-items'

/** Shared profile-screen formatters: item lookup, money and deadlines. */
export function findItem(itemId: string | null) {
  if (itemId === null) return null
  return profileItems.find((item) => item.id === itemId) ?? null
}

export function formatRubles(kopecks: number): string {
  return `RUB ${(kopecks / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function daysUntil(deadlineMs: number): number | null {
  const remaining = deadlineMs - Date.now()
  if (remaining <= 0) return 0
  return Math.ceil(remaining / 86_400_000)
}

export function formatDaysLeft(days: number): string {
  if (days === 0) return 'Last day'
  return `${days} ${days === 1 ? 'day' : 'days'} left`
}

export function formatFailure(failure: DemoApiFailure): string {
  return `The challenge is temporarily unavailable (${failure.code}).`
}

/**
 * Short synthetic-profile name for the header. The full label explains what the profile is for
 * ("Showcase profile: three items of a set and a duplicate to trade") and does not fit the
 * avatar circle, so the part before the first explanation is used.
 */
export function shortProfileName(label: string): string {
  const head = label.split(/[:,(]/)[0].trim()
  return head.length === 0 ? 'Profile' : head
}

/** Avatar placeholder: the first letter of the name, until a real photo exists. */
export function profileInitial(label: string): string {
  return shortProfileName(label).charAt(0).toUpperCase()
}
