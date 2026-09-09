import { createEan13, isValidEan13 } from './profile-barcode'
import { DEMO_COUPON_MAX_KOPECKS } from '@pyaterochka-game-demo/contracts'
import { profileItems, type ItemRarity } from './profile-items'

const RARITY_POINTS: Record<ItemRarity, number> = {
  common: 1,
  epic: 2,
  legendary: 3,
}

export const DISCOUNT_RECIPES = [
  {
    id: 'breakfast',
    title: 'Good Morning',
    category: 'Breakfast, bakery and hot drinks',
    itemIds: ['club-toaster', 'milk-pitcher', 'travel-mug', 'breakfast-pan', 'barista-machine', 'baker-apron', 'fruit-basket'],
  },
  {
    id: 'fresh',
    title: 'Fresh Pick',
    category: 'Vegetables, fruit and healthy food',
    itemIds: ['fruit-basket', 'vegetable-crate', 'power-blender', 'freshness-dome', 'milk-pitcher', 'breakfast-pan'],
  },
  {
    id: 'movie',
    title: 'No-Cook Evening',
    category: 'Snacks, drinks and ready meals',
    itemIds: ['snack-bowl', 'pizza-oven', 'picnic-cooler', 'legendary-sandwich-press', 'freezer-chest'],
  },
  {
    id: 'asian',
    title: 'Asian Dinner',
    category: 'Fish, rice, noodles and Asian sauces',
    itemIds: ['sushi-kit', 'dragon-wok', 'royal-cauldron', 'chef-knife', 'vegetable-crate', 'treasure-pantry'],
  },
  {
    id: 'chef',
    title: "Chef's Dinner",
    category: 'Meat, fresh food and cooking',
    itemIds: ['chef-knife', 'master-grill', 'golden-chef-hat', 'vegetable-crate', 'magic-fridge', 'royal-cauldron'],
  },
  {
    id: 'dessert',
    title: 'Sweet Break',
    category: 'Desserts, coffee and baking supplies',
    itemIds: ['baker-apron', 'barista-machine', 'crystal-icecream-maker', 'milk-pitcher', 'fruit-basket', 'travel-mug'],
  },
  {
    id: 'pantry',
    title: 'Home Pantry',
    category: 'Groceries, frozen food and long-life products',
    itemIds: ['treasure-pantry', 'freezer-chest', 'magic-fridge', 'picnic-cooler', 'club-toaster', 'legendary-sandwich-press'],
  },
] as const

export type DiscountCraftingPreview = {
  title: string
  category: string
  rarity: ItemRarity
  rarityScore: number
  synergyBonus: number
  percent: number
  recipeId: string | null
}

export type CraftedDiscount = DiscountCraftingPreview & {
  maxKopecks: number
  id: string
  itemIds: string[]
  barcode: string
  createdAt: number
}

export type CraftingGuidance = {
  title: string
  description: string
  matchedCount: number
  suggestedItemIds: string[]
}

export function getCraftingGuidance(itemIds: readonly string[]): CraftingGuidance {
  if (itemIds.length === 0) {
    return {
      title: 'Collect a themed set',
      description: 'Related products add up to +3% to the final discount.',
      matchedCount: 0,
      suggestedItemIds: [...DISCOUNT_RECIPES[0].itemIds.slice(0, 3)],
    }
  }

  const recipe = findBestRecipe(itemIds)
  const selectedIds = new Set(itemIds)
  const matchedCount = countDistinctMatches(recipe.itemIds, selectedIds)
  const suggestedItemIds = recipe.itemIds
    .filter((itemId) => !selectedIds.has(itemId))
    .slice(0, Math.max(1, 4 - itemIds.length))

  return {
    title: `Closest set: "${recipe.title}"`,
    description: matchedCount >= 3
      ? 'The themed bonus is already active. A fourth match makes it stronger.'
      : `Matches: ${matchedCount} of 3 for the +2% bonus.`,
    matchedCount,
    suggestedItemIds: [...suggestedItemIds],
  }
}

export function previewCraftedDiscount(
  itemIds: readonly string[],
): DiscountCraftingPreview | null {
  if (itemIds.length !== 4) return null

  const items = itemIds.map((itemId) => {
    const item = profileItems.find((candidate) => candidate.id === itemId)
    if (item === undefined) throw new Error(`Unknown profile item: ${itemId}`)
    return item
  })
  const selectedIds = new Set(itemIds)
  const recipe = findBestRecipe(itemIds)
  const matchedCount = countDistinctMatches(recipe.itemIds, selectedIds)
  const hasRecipe = matchedCount >= 3
  const synergyBonus = hasRecipe ? (matchedCount >= 4 ? 3 : 2) : 0
  const rarityScore = items.reduce(
    (total, item) => total + RARITY_POINTS[item.rarity],
    0,
  )
  const strongestItem = [...items].sort(
    (left, right) => RARITY_POINTS[right.rarity] - RARITY_POINTS[left.rarity],
  )[0]

  return {
    title: hasRecipe ? recipe.title : `Discount on ${lowerFirst(strongestItem.category)}`,
    category: hasRecipe ? recipe.category : strongestItem.category,
    rarity: resolveDiscountRarity(rarityScore),
    rarityScore,
    synergyBonus,
    percent: Math.min(18, basePercentForScore(rarityScore) + synergyBonus),
    recipeId: hasRecipe ? recipe.id : null,
  }
}

export function craftDiscount(
  itemIds: readonly string[],
  createdAt: number = Date.now(),
  randomValue: number = Math.random(),
): CraftedDiscount {
  const preview = previewCraftedDiscount(itemIds)
  if (preview === null) throw new Error('Four items are required to craft a discount')
  const normalizedRandom = Number.isFinite(randomValue)
    ? Math.min(Math.max(randomValue, 0), 1 - Number.EPSILON)
    : 0

  return {
    ...preview,
    maxKopecks: DEMO_COUPON_MAX_KOPECKS,
    id: `discount-${createdAt}-${Math.floor(normalizedRandom * 1_000_000)}`,
    itemIds: [...itemIds],
    barcode: createEan13(createdAt, normalizedRandom),
    createdAt,
  }
}

export function serializeCraftedDiscount(discount: CraftedDiscount): string {
  return JSON.stringify({ version: 1, discount })
}

export function resolveCraftedDiscount(rawDiscount: string | null): CraftedDiscount | null {
  if (rawDiscount === null) return null

  try {
    const saved = JSON.parse(rawDiscount) as { version?: unknown; discount?: Partial<CraftedDiscount> }
    const discount = saved.discount
    if (
      saved.version !== 1
      || discount === undefined
      || typeof discount.id !== 'string'
      || typeof discount.title !== 'string'
      || typeof discount.category !== 'string'
      || !['common', 'epic', 'legendary'].includes(discount.rarity ?? '')
      || typeof discount.rarityScore !== 'number'
      || typeof discount.synergyBonus !== 'number'
      || typeof discount.percent !== 'number'
      || typeof discount.recipeId !== 'string' && discount.recipeId !== null
      || !Array.isArray(discount.itemIds)
      || discount.itemIds.length !== 4
      || !discount.itemIds.every((itemId) =>
        typeof itemId === 'string' && profileItems.some((item) => item.id === itemId))
      || typeof discount.barcode !== 'string'
      || !isValidEan13(discount.barcode)
      || typeof discount.createdAt !== 'number'
    ) {
      return null
    }

    if (discount.maxKopecks !== undefined && discount.maxKopecks !== 1000 && discount.maxKopecks !== DEMO_COUPON_MAX_KOPECKS) return null
    return { ...discount, maxKopecks: discount.maxKopecks ?? 1000 } as CraftedDiscount
  } catch {
    return null
  }
}

function findBestRecipe(itemIds: readonly string[]) {
  const selectedIds = new Set(itemIds)
  return [...DISCOUNT_RECIPES].sort((left, right) =>
    countDistinctMatches(right.itemIds, selectedIds)
      - countDistinctMatches(left.itemIds, selectedIds))[0]
}

function countDistinctMatches(
  recipeItemIds: readonly string[],
  selectedIds: ReadonlySet<string>,
): number {
  return recipeItemIds.filter((itemId) => selectedIds.has(itemId)).length
}

function resolveDiscountRarity(score: number): ItemRarity {
  if (score <= 6) return 'common'
  if (score <= 9) return 'epic'
  return 'legendary'
}

function basePercentForScore(score: number): number {
  if (score <= 5) return 5
  if (score <= 7) return 7
  if (score <= 9) return 10
  if (score <= 11) return 13
  return 15
}

function lowerFirst(value: string): string {
  return `${value.charAt(0).toLocaleLowerCase('en-US')}${value.slice(1)}`
}
