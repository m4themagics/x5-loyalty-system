/**
 * What the character wears. Kept apart from inventory: owning an item and wearing it differ.
 * The worn set lives in the browser like the rest of the demo state.
 */
const OUTFIT_STORAGE_KEY = 'pyaterochka_profile_worn_items'

/** Only these catalog items are wearable: the other twenty-two have no dressed frames. */
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

/** What was taken off stays off, and an item spent on crafting stops being worn by itself. */
export function toggleWornItem(
  worn: readonly WearableItemId[],
  itemId: WearableItemId,
): readonly WearableItemId[] {
  return worn.includes(itemId)
    ? worn.filter((wornId) => wornId !== itemId)
    : [...worn, itemId]
}
