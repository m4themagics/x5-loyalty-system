import { profileItems, type ItemRarity, type ProfileItem } from './profile-items'

export const ITEM_DROP_RATES = {
  common: .7,
  epic: .25,
  legendary: .05,
} as const satisfies Record<ItemRarity, number>

export function rollItemRarity(randomValue: number): ItemRarity {
  const roll = normalizeRandomValue(randomValue)
  if (roll < ITEM_DROP_RATES.common) return 'common'
  if (roll < ITEM_DROP_RATES.common + ITEM_DROP_RATES.epic) return 'epic'
  return 'legendary'
}

export function drawProfileItem(random: () => number = Math.random): ProfileItem {
  const rarity = rollItemRarity(random())
  const candidates = profileItems.filter((item) => item.rarity === rarity)
  const itemIndex = Math.floor(normalizeRandomValue(random()) * candidates.length)
  const item = candidates[itemIndex]

  if (item === undefined) {
    throw new Error(`No profile items configured for rarity: ${rarity}`)
  }

  return item
}

function normalizeRandomValue(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), 1 - Number.EPSILON)
}
