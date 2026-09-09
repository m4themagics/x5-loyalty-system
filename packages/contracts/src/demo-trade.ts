import { z } from 'zod'
import { demoItemRaritySchema } from './demo-poc'

export const DEMO_TRADE_TTL_MS = 24 * 60 * 60 * 1000
export const DEMO_TRADE_WINDOW_MS = 7 * DEMO_TRADE_TTL_MS
export const DEMO_TRADE_WEEKLY_LIMIT = 3
export const DEMO_TRADE_REQUIRED_PURCHASE_DAYS = 2
const id = z.string().min(1).max(120)
const revision = z.number().int().nonnegative()

/** Contract of the local exchange. Product entitlements and coupons are never traded. */
export const demoTradeSchema = z.object({
  trade_id: id,
  sender_profile_id: id,
  receiver_profile_id: id,
  offered_item_id: id,
  requested_item_id: id,
  rarity: demoItemRaritySchema,
  quantity: z.literal(1),
  created_at_ms: z.number().int().nonnegative(),
  expires_at_ms: z.number().int().nonnegative(),
  status: z.enum(['pending', 'accepted', 'rejected', 'expired', 'cancelled']),
  resolved_at_ms: z.number().int().nonnegative().nullable(),
  revision: revision.min(1),
}).strict().refine((trade) => trade.sender_profile_id !== trade.receiver_profile_id, 'different participants required')
  .refine((trade) => trade.offered_item_id !== trade.requested_item_id, 'different items required')
  .refine((trade) => trade.expires_at_ms === trade.created_at_ms + DEMO_TRADE_TTL_MS, 'the promise lasts 24 hours')
  .refine((trade) => trade.status === 'pending' ? trade.resolved_at_ms === null : trade.resolved_at_ms !== null, 'resolved timestamp must match status')

export const demoTradeCreateSchema = z.object({
  trade_id: id,
  actor_profile_id: id,
  receiver_profile_id: id,
  offered_item_id: id,
  requested_item_id: id,
  expected_store_revision: revision,
}).strict()

export const demoTradeRespondSchema = z.object({
  trade_id: id,
  actor_profile_id: id,
  action: z.enum(['accept', 'reject']),
  expected_store_revision: revision,
  expected_trade_revision: revision.min(1),
}).strict()

export type DemoTrade = z.infer<typeof demoTradeSchema>
export type DemoTradeCreate = z.infer<typeof demoTradeCreateSchema>
export type DemoTradeRespond = z.infer<typeof demoTradeRespondSchema>
