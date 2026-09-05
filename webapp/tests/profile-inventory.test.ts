import { expect, test } from 'bun:test'

import {
  addInventoryItem,
  resolveInventory,
  serializeInventory,
} from '../src/features/home/profile-inventory'

test('a received item is added to an empty inventory', () => {
  expect(addInventoryItem([], 'club-toaster')).toEqual([
    { itemId: 'club-toaster', quantity: 1 },
  ])
})

test('a duplicate item increases its quantity without using another slot', () => {
  expect(addInventoryItem(
    [{ itemId: 'club-toaster', quantity: 1 }],
    'club-toaster',
  )).toEqual([{ itemId: 'club-toaster', quantity: 2 }])
})

test('inventory survives serialization and ignores invalid saved entries', () => {
  const inventory = [
    { itemId: 'club-toaster', quantity: 2 },
    { itemId: 'dragon-wok', quantity: 1 },
  ]

  expect(resolveInventory(serializeInventory(inventory))).toEqual(inventory)
  expect(resolveInventory('{"version":1,"entries":[{"itemId":"unknown","quantity":4}]}'))
    .toEqual([])
  expect(resolveInventory('not-json')).toEqual([])
})
