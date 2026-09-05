import { expect, test } from 'bun:test'
import { demoTradeCreateSchema, demoTradeSchema } from './demo-trade'

const trade = {
  trade_id: 'trade-1', sender_profile_id: 'a', receiver_profile_id: 'b',
  offered_item_id: 'milk-pitcher', requested_item_id: 'breakfast-pan', rarity: 'common',
  quantity: 1, created_at_ms: 1000, expires_at_ms: 1000 + 86_400_000,
  status: 'pending', resolved_at_ms: null, revision: 1,
}

test('trade contract fixes one item, a 24-hour deadline and different participants', () => {
  expect(demoTradeSchema.safeParse(trade).success).toBe(true)
  expect(demoTradeSchema.safeParse({ ...trade, quantity: 2 }).success).toBe(false)
  expect(demoTradeSchema.safeParse({ ...trade, expires_at_ms: 1001 }).success).toBe(false)
  expect(demoTradeSchema.safeParse({ ...trade, receiver_profile_id: 'a' }).success).toBe(false)
  expect(demoTradeSchema.safeParse({ ...trade, status: 'accepted' }).success).toBe(false)
})

test('trade commands require an explicit observed store revision and reject unknown fields', () => {
  const command = { trade_id: 'trade-1', actor_profile_id: 'a', receiver_profile_id: 'b', offered_item_id: 'milk-pitcher', requested_item_id: 'breakfast-pan', expected_store_revision: 1 }
  expect(demoTradeCreateSchema.safeParse(command).success).toBe(true)
  expect(demoTradeCreateSchema.safeParse({ ...command, expected_store_revision: undefined }).success).toBe(false)
  expect(demoTradeCreateSchema.safeParse({ ...command, coupon_id: 'coupon' }).success).toBe(false)
})
