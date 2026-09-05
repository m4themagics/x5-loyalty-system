import { expect, test } from 'bun:test'

import {
  ITEM_DROP_RATES,
  drawProfileItem,
  rollItemRarity,
} from '../src/features/home/profile-item-drop'

test('drop rates total 100 percent', () => {
  expect(
    ITEM_DROP_RATES.common
      + ITEM_DROP_RATES.epic
      + ITEM_DROP_RATES.legendary,
  ).toBe(1)
})

test('rarity roll follows the documented 70/25/5 boundaries', () => {
  expect(rollItemRarity(0)).toBe('common')
  expect(rollItemRarity(.699_999)).toBe('common')
  expect(rollItemRarity(.7)).toBe('epic')
  expect(rollItemRarity(.949_999)).toBe('epic')
  expect(rollItemRarity(.95)).toBe('legendary')
  expect(rollItemRarity(.999_999)).toBe('legendary')
})

test('item draw selects an item only from the rolled rarity', () => {
  const common = drawProfileItem(sequenceRandom([.1, .999_999]))
  const epic = drawProfileItem(sequenceRandom([.8, 0]))
  const legendary = drawProfileItem(sequenceRandom([.98, .5]))

  expect(common.rarity).toBe('common')
  expect(epic.rarity).toBe('epic')
  expect(legendary.rarity).toBe('legendary')
})

function sequenceRandom(values: number[]) {
  let index = 0
  return () => values[index++] ?? 0
}
