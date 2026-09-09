import { expect, test } from 'bun:test'

import {
  craftDiscount,
  getCraftingGuidance,
  previewCraftedDiscount,
  resolveCraftedDiscount,
  serializeCraftedDiscount,
} from '../src/features/home/profile-discount-crafting'

test('four matching items create a themed discount with a synergy bonus', () => {
  const preview = previewCraftedDiscount([
    'fruit-basket',
    'vegetable-crate',
    'power-blender',
    'freshness-dome',
  ])

  expect(preview).toMatchObject({
    title: 'Fresh Pick',
    category: 'Vegetables, fruit and healthy food',
    rarity: 'epic',
    rarityScore: 7,
    synergyBonus: 3,
    percent: 10,
  })
})

test('duplicate items can fill slots but do not fake a recipe synergy', () => {
  const preview = previewCraftedDiscount([
    'fruit-basket',
    'fruit-basket',
    'fruit-basket',
    'fruit-basket',
  ])

  expect(preview).toMatchObject({
    title: 'Discount on fruit',
    synergyBonus: 0,
    percent: 5,
  })
})

test('crafting guidance names the nearest recipe and useful next items', () => {
  const guidance = getCraftingGuidance(['club-toaster', 'milk-pitcher'])

  expect(guidance.title).toBe('Closest set: "Good Morning"')
  expect(guidance.suggestedItemIds).toContain('travel-mug')
  expect(guidance.matchedCount).toBe(2)
})

test('a crafted discount survives local serialization', () => {
  const discount = craftDiscount(
    ['snack-bowl', 'pizza-oven', 'picnic-cooler', 'legendary-sandwich-press'],
    1_700_000_000_000,
    .42,
  )

  expect(discount.barcode).toMatch(/^\d{13}$/)
  expect(resolveCraftedDiscount(serializeCraftedDiscount(discount))).toEqual(discount)
  expect(resolveCraftedDiscount('not-json')).toBeNull()
})

test('a discount cannot be created before all four slots are filled', () => {
  expect(previewCraftedDiscount(['club-toaster', 'milk-pitcher', 'travel-mug']))
    .toBeNull()
})
