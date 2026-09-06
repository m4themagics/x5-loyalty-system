/**
 * Что персонаж носит на себе. Отдельно от инвентаря: владеть предметом и носить его — разное.
 * Надетое хранится в браузере, как и остальное состояние демонстрации.
 */
const OUTFIT_STORAGE_KEY = 'pyaterochka_profile_worn_items'

/** Носибельны только эти предметы каталога: для остальных двадцати двух нет одетых кадров. */
export const WEARABLE_ITEM_IDS = ['baker-apron', 'chef-knife'] as const

export type WearableItemId = (typeof WEARABLE_ITEM_IDS)[number]

export function isWearable(itemId: string): itemId is WearableItemId {
  return (WEARABLE_ITEM_IDS as readonly string[]).includes(itemId)
}

export function readWornItemIds(): readonly WearableItemId[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(OUTFIT_STORAGE_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is WearableItemId =>
      typeof value === 'string' && isWearable(value))
  } catch {
    return []
  }
}

export function persistWornItemIds(itemIds: readonly WearableItemId[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(OUTFIT_STORAGE_KEY, JSON.stringify(itemIds))
}

/** Снятое остаётся снятым, а потраченный в крафте предмет перестаёт быть надетым сам. */
export function toggleWornItem(
  worn: readonly WearableItemId[],
  itemId: WearableItemId,
): readonly WearableItemId[] {
  return worn.includes(itemId)
    ? worn.filter((wornId) => wornId !== itemId)
    : [...worn, itemId]
}
