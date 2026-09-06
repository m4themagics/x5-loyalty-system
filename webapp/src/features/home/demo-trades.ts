import {
  DEMO_TRADE_REQUIRED_PURCHASE_DAYS, DEMO_TRADE_TTL_MS, DEMO_TRADE_WEEKLY_LIMIT,
  DEMO_TRADE_WINDOW_MS, demoTradeCreateSchema, demoTradeRespondSchema,
  type DemoInventoryEntry, type DemoProfileSnapshot, type DemoTrade,
  type DemoTradeCreate, type DemoTradeRespond,
} from '@pyaterochka-game-demo/contracts'
import type { DemoStore } from './demo-store'
import { availableDemoInventory } from './demo-state'
import { profileItems } from './profile-items'

export type DemoTradeResult = { store: DemoStore; reason: string }

export function confirmedTradePurchaseDays(profile: DemoProfileSnapshot, nowMs: number): number {
  const days = profile.receipts.filter((receipt) => !receipt.returned && receipt.purchased_at_ms <= nowMs
    && receipt.lines.some((line) => line.paid && line.amount_kopecks > 0 && line.quantity > 0))
    .map((receipt) => new Date(receipt.purchased_at_ms + 3 * 60 * 60 * 1000).toISOString().slice(0, 10))
  return new Set(days).size
}

export function completedTradesInWindow(store: DemoStore, profileId: string, nowMs: number): number {
  return store.trades.filter((trade) => trade.status === 'accepted' && trade.resolved_at_ms! > nowMs - DEMO_TRADE_WINDOW_MS
    && trade.resolved_at_ms! <= nowMs && (trade.sender_profile_id === profileId || trade.receiver_profile_id === profileId)).length
}

function eligibility(store: DemoStore, ids: string[], nowMs: number): string | null {
  for (const id of ids) {
    const state = store.profiles[id]
    if (state === undefined) return 'trade_profile_missing'
    if (confirmedTradePurchaseDays(state.profile, nowMs) < DEMO_TRADE_REQUIRED_PURCHASE_DAYS) return 'trade_purchase_days_insufficient'
    if (completedTradesInWindow(store, id, nowMs) >= DEMO_TRADE_WEEKLY_LIMIT) return 'trade_weekly_limit'
  }
  return null
}

/** Отправитель подтверждает передачу своего предмета созданием предложения; оба предмета резервируются. */
export function createDemoTrade(initial: DemoStore, input: DemoTradeCreate, nowMs: number): DemoTradeResult {
  const parsed = demoTradeCreateSchema.safeParse(input)
  if (!parsed.success) return { store: initial, reason: 'trade_invalid_command' }
  const command = parsed.data
  const store = expireDemoTrades(initial, nowMs)
  const refuse = (reason: string) => ({ store, reason })
  if (command.actor_profile_id !== store.active_profile_id) return refuse('trade_actor_mismatch')
  const existing = store.trades.find((trade) => trade.trade_id === command.trade_id)
  if (existing !== undefined) {
    const same = existing.sender_profile_id === command.actor_profile_id && existing.receiver_profile_id === command.receiver_profile_id
      && existing.offered_item_id === command.offered_item_id && existing.requested_item_id === command.requested_item_id
    return refuse(same ? 'trade_idempotent' : 'trade_id_conflict')
  }
  if (command.expected_store_revision !== initial.store_revision) return refuse('trade_stale_revision')
  if (command.actor_profile_id === command.receiver_profile_id) return refuse('trade_self_exchange')
  const failure = eligibility(store, [command.actor_profile_id, command.receiver_profile_id], nowMs)
  if (failure !== null) return refuse(failure)
  const offered = profileItems.find((item) => item.id === command.offered_item_id)
  const requested = profileItems.find((item) => item.id === command.requested_item_id)
  if (offered === undefined || requested === undefined) return refuse('trade_unknown_item')
  if (offered.rarity !== requested.rarity) return refuse('trade_rarity_mismatch')
  if (offered.id === requested.id) return refuse('trade_identical_items')
  const senderCopies = availableDemoInventory(store.profiles[command.actor_profile_id]).find((entry) => entry.item_id === offered.id)?.quantity ?? 0
  const receiverCopies = availableDemoInventory(store.profiles[command.receiver_profile_id]).find((entry) => entry.item_id === requested.id)?.quantity ?? 0
  if (senderCopies < 1 || receiverCopies < 1) return refuse('trade_duplicate_unavailable')
  const trade: DemoTrade = {
    trade_id: command.trade_id, sender_profile_id: command.actor_profile_id, receiver_profile_id: command.receiver_profile_id,
    offered_item_id: offered.id, requested_item_id: requested.id, rarity: offered.rarity, quantity: 1,
    created_at_ms: nowMs, expires_at_ms: nowMs + DEMO_TRADE_TTL_MS, status: 'pending', resolved_at_ms: null, revision: 1,
  }
  return { store: transition(store, [...store.trades, trade]), reason: 'trade_created' }
}

export function respondDemoTrade(initial: DemoStore, input: DemoTradeRespond, nowMs: number): DemoTradeResult {
  const parsed = demoTradeRespondSchema.safeParse(input)
  if (!parsed.success) return { store: initial, reason: 'trade_invalid_command' }
  const command = parsed.data
  const store = expireDemoTrades(initial, nowMs)
  const refuse = (reason: string) => ({ store, reason })
  const trade = store.trades.find((candidate) => candidate.trade_id === command.trade_id)
  if (trade === undefined) return refuse('trade_not_found')
  if (command.actor_profile_id !== trade.receiver_profile_id) return refuse('trade_receiver_required')
  if (command.actor_profile_id !== store.active_profile_id) return refuse('trade_actor_mismatch')
  const resultStatus = command.action === 'accept' ? 'accepted' : 'rejected'
  if (trade.status === resultStatus) return refuse('trade_idempotent')
  if (trade.status === 'expired') return refuse('trade_expired')
  if (trade.status !== 'pending') return refuse('trade_already_resolved')
  if (command.expected_store_revision !== initial.store_revision || command.expected_trade_revision !== trade.revision) return refuse('trade_stale_revision')
  if (nowMs < trade.created_at_ms) return refuse('trade_invalid_time')
  const next = { ...trade, status: resultStatus, resolved_at_ms: nowMs, revision: trade.revision + 1 } as DemoTrade
  const trades = store.trades.map((candidate) => candidate.trade_id === trade.trade_id ? next : candidate)
  if (command.action === 'reject') return { store: transition(store, trades), reason: 'trade_rejected' }
  const failure = eligibility(store, [trade.sender_profile_id, trade.receiver_profile_id], nowMs)
  if (failure !== null) return refuse(failure)
  const sender = store.profiles[trade.sender_profile_id]
  const receiver = store.profiles[trade.receiver_profile_id]
  if (!hasReservedCopy(sender.profile.inventory, sender.trade_reserved_items, trade.offered_item_id)
    || !hasReservedCopy(receiver.profile.inventory, receiver.trade_reserved_items, trade.requested_item_id)) return refuse('trade_reservation_missing')
  return {
    store: transition(store, trades, {
      [trade.sender_profile_id]: swapCopy(sender.profile.inventory, trade.offered_item_id, trade.requested_item_id),
      [trade.receiver_profile_id]: swapCopy(receiver.profile.inventory, trade.requested_item_id, trade.offered_item_id),
    }),
    reason: 'trade_accepted',
  }
}

function hasReservedCopy(inventory: DemoInventoryEntry[], reserved: DemoInventoryEntry[], itemId: string): boolean {
  const quantity = inventory.find((entry) => entry.item_id === itemId)?.quantity ?? 0
  const held = reserved.find((entry) => entry.item_id === itemId)?.quantity ?? 0
  return held > 0 && quantity >= held
}

function swapCopy(inventory: DemoInventoryEntry[], outgoing: string, incoming: string): DemoInventoryEntry[] {
  const counts = new Map(inventory.map((entry) => [entry.item_id, entry.quantity]))
  counts.set(outgoing, (counts.get(outgoing) ?? 0) - 1)
  counts.set(incoming, (counts.get(incoming) ?? 0) + 1)
  return [...counts].filter(([, quantity]) => quantity > 0).map(([item_id, quantity]) => ({ item_id, quantity }))
}

/** Истечение освобождает только игровые блокировки; купонные финансовые обязательства остаются. */
export function expireDemoTrades(store: DemoStore, nowMs: number): DemoStore {
  if (!store.trades.some((trade) => trade.status === 'pending' && trade.expires_at_ms <= nowMs)) return store
  return transition(store, store.trades.map((trade) => trade.status === 'pending' && trade.expires_at_ms <= nowMs
    ? { ...trade, status: 'expired', resolved_at_ms: nowMs, revision: trade.revision + 1 } : trade))
}

/** Явный сброс демо не оставляет блокировку предмета у второго участника. История завершений сохраняется. */
export function cancelProfileTrades(store: DemoStore, profileId: string, nowMs: number): DemoStore {
  if (!store.trades.some((trade) => trade.status === 'pending' && (trade.sender_profile_id === profileId || trade.receiver_profile_id === profileId))) return store
  return transition(store, store.trades.map((trade) => trade.status === 'pending' && (trade.sender_profile_id === profileId || trade.receiver_profile_id === profileId)
    ? { ...trade, status: 'cancelled', resolved_at_ms: nowMs, revision: trade.revision + 1 } : trade))
}

function transition(store: DemoStore, trades: DemoTrade[], inventories: Record<string, DemoInventoryEntry[]> = {}): DemoStore {
  const profiles = { ...store.profiles }
  for (const [profileId, state] of Object.entries(profiles)) {
    const held = new Map<string, number>()
    for (const trade of trades) {
      if (trade.status !== 'pending') continue
      const itemId = trade.sender_profile_id === profileId ? trade.offered_item_id
        : trade.receiver_profile_id === profileId ? trade.requested_item_id : null
      if (itemId !== null) held.set(itemId, (held.get(itemId) ?? 0) + 1)
    }
    const reservations = [...held].map(([item_id, quantity]) => ({ item_id, quantity }))
    if (inventories[profileId] !== undefined || JSON.stringify(reservations) !== JSON.stringify(state.trade_reserved_items)) {
      profiles[profileId] = { ...state, revision: state.revision + 1, trade_reserved_items: reservations,
        profile: inventories[profileId] === undefined ? state.profile : { ...state.profile, inventory: inventories[profileId] } }
    }
  }
  return { ...store, store_revision: store.store_revision + 1, trades, profiles }
}

/** Подготовленные профили только для локального социального сценария, не бонус регистрации. */
/** Профили-«друзья»: только им можно предложить обмен на экране покупателя. */
export const DEMO_TRADE_FRIEND_PREFIX = 'demo-trade-'

/** Аня пригласила Бориса до его первой покупки: только так виден расчёт реферальной награды. */
const TRADE_SEED_INVITE_MS = 5 * 24 * 60 * 60 * 1000

export function createTradeSeedProfiles(template: DemoProfileSnapshot, nowMs: number): DemoProfileSnapshot[] {
  return [
    { id: 'demo-trade-anya', label: 'Аня', invitedBy: null, inventory: [{ item_id: 'milk-pitcher', quantity: 2 }, { item_id: 'club-toaster', quantity: 1 }, { item_id: 'travel-mug', quantity: 1 }] },
    { id: 'demo-trade-boris', label: 'Борис', invitedBy: 'demo-trade-anya', inventory: [{ item_id: 'breakfast-pan', quantity: 2 }, { item_id: 'fruit-basket', quantity: 1 }, { item_id: 'vegetable-crate', quantity: 1 }] },
  ].map((seed) => ({
    ...template, profile_id: seed.id, label: seed.label, inventory: seed.inventory,
    receipts: [3, 1].map((days) => ({ receipt_id: `${seed.id}-paid-day-${days}`, purchased_at_ms: nowMs - days * DEMO_TRADE_TTL_MS,
      store_id: 'store-trade-synthetic', returned: false, lines: [{ sku_id: 'sku-trade-milk', category: 'Молочные продукты', quantity: 1, paid: true, amount_kopecks: 9900 }] })),
    issued_rewards: [], processed_event_ids: [], active_coupon: null, outstanding_promise: null,
    progress: { completed_recipe_ids: [], avatar_level: 0, redeemed_savings_28d_kopecks: 0 },
    referral: {
      invited_by_profile_id: seed.invitedBy,
      invited_at_ms: seed.invitedBy === null ? null : nowMs - TRADE_SEED_INVITE_MS,
      had_confirmed_purchase_before_invite: false,
      inviter_rewards_in_window: 0,
    },
    risk_signals: { device_id: `${seed.id}-device`, household_id: null, account_age_days: 30, confirmed_purchase_days: 2 },
  }))
}
