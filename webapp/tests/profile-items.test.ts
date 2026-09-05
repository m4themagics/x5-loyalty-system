import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { profileItems } from '../src/features/home/profile-items'

test('the profile item pool has 24 unique items split evenly by rarity', () => {
  expect(profileItems).toHaveLength(24)
  expect(new Set(profileItems.map((item) => item.id)).size).toBe(24)
  expect(new Set(profileItems.map((item) => item.iconSrc)).size).toBe(24)

  for (const rarity of ['common', 'epic', 'legendary'] as const) {
    expect(profileItems.filter((item) => item.rarity === rarity)).toHaveLength(8)
  }
})

test('every profile item points to an optimized webp icon', () => {
  for (const item of profileItems) {
    expect(item.iconSrc.endsWith('.webp')).toBe(true)

    const iconPath = fileURLToPath(
      new URL(`../public${item.iconSrc}`, import.meta.url),
    )
    expect(existsSync(iconPath)).toBe(true)
  }
})

test('item descriptions hint at their use without revealing a discount category', () => {
  for (const item of profileItems) {
    expect(item.description.toLocaleLowerCase('ru-RU')).not.toContain('скидк')
    expect(item.description.toLocaleLowerCase('ru-RU')).not.toContain(
      item.category.toLocaleLowerCase('ru-RU'),
    )
  }
})
