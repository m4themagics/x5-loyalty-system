import { expect, test } from 'bun:test'

import {
  addInventoryItem,
  consumeInventoryItems,
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

test('crafting consumes one copy of every slotted item and removes empty stacks', () => {
  const inventory = [
    { itemId: 'club-toaster', quantity: 2 },
    { itemId: 'milk-pitcher', quantity: 1 },
  ]

  expect(consumeInventoryItems(
    inventory,
    ['club-toaster', 'club-toaster', 'milk-pitcher'],
  )).toEqual([])
})

test('crafting refuses to consume more copies than the inventory contains', () => {
  expect(() => consumeInventoryItems(
    [{ itemId: 'club-toaster', quantity: 1 }],
    ['club-toaster', 'club-toaster'],
  )).toThrow('Not enough inventory items')
})
