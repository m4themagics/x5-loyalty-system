import type { DemoApiFailure } from './demo-api'
import { profileItems } from './profile-items'

/** Общие форматтеры экрана профиля: каталог предметов, деньги и сроки. */
export function findItem(itemId: string | null) {
  if (itemId === null) return null
  return profileItems.find((item) => item.id === itemId) ?? null
}

export function formatRubles(kopecks: number): string {
  return `${(kopecks / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`
}

export function daysUntil(deadlineMs: number): number | null {
  const remaining = deadlineMs - Date.now()
  if (remaining <= 0) return 0
  return Math.ceil(remaining / 86_400_000)
}

export function formatDaysLeft(days: number): string {
  if (days === 0) return 'Последний день'
  const tail = days % 100 >= 11 && days % 100 <= 14
    ? 'дней'
    : days % 10 === 1
      ? 'день'
      : days % 10 >= 2 && days % 10 <= 4
        ? 'дня'
        : 'дней'
  return `Осталось ${days} ${tail}`
}

export function formatFailure(failure: DemoApiFailure): string {
  return `Задание временно недоступно (${failure.code}).`
}
