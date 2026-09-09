import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { demoBudgetSnapshotSchema, demoProfileSnapshotSchema } from '@pyaterochka-game-demo/contracts'
import { createDemoState, applyCraft } from '../src/features/home/demo-state'
import { createDemoStore, selectDemoProfile, resolveDemoStore, serializeDemoStore } from '../src/features/home/demo-store'
import { createDemoTrade, respondDemoTrade, expireDemoTrades, createTradeSeedProfiles } from '../src/features/home/demo-trades'
import { craftDiscount } from '../src/features/home/profile-discount-crafting'
import { DEMO_REFERRAL_WINDOW_DAYS } from '../src/features/home/demo-progress'

const read = (name: string) => JSON.parse(readFileSync(new URL(`../../recsys/contract/examples/${name}`, import.meta.url), 'utf8'))
const base = demoProfileSnapshotSchema.parse(read('profile-empty.json'))
const budget = demoBudgetSnapshotSchema.parse(read('budget.json'))
const NOW = 1_788_685_200_000
const [a, b] = createTradeSeedProfiles(base, NOW)

function initial() {
  let store = createDemoStore(createDemoState(a, budget))
  store = selectDemoProfile(store, b, budget)
  return selectDemoProfile(store, a, budget)
}

function offer(store = initial(), id = 'trade-1') {
  return createDemoTrade(store, { trade_id: id, actor_profile_id: a.profile_id, receiver_profile_id: b.profile_id, offered_item_id: 'milk-pitcher', requested_item_id: 'breakfast-pan', expected_store_revision: store.store_revision }, NOW)
}

describe('digital item exchange', () => {
  test('reserves both items, then transfers them in one snapshot without changing the money reserve', () => {
    const created = offer()
    expect(created.reason).toBe('trade_created')
    expect(created.store.profiles[a.profile_id].trade_reserved_items).toEqual([{ item_id: 'milk-pitcher', quantity: 1 }])
    const current = selectDemoProfile(created.store, b, budget)
    const accepted = respondDemoTrade(current, { trade_id: 'trade-1', actor_profile_id: b.profile_id, action: 'accept', expected_store_revision: current.store_revision, expected_trade_revision: 1 }, NOW + 1)
    expect(accepted.reason).toBe('trade_accepted')
    expect(accepted.store.trades[0].status).toBe('accepted')
    expect(accepted.store.profiles[a.profile_id].profile.inventory.find((entry) => entry.item_id === 'breakfast-pan')?.quantity).toBe(1)
    expect(accepted.store.profiles[b.profile_id].profile.inventory.find((entry) => entry.item_id === 'milk-pitcher')?.quantity).toBe(1)
    expect(accepted.store.profiles[a.profile_id].budget).toEqual(created.store.profiles[a.profile_id].budget)
    expect(accepted.store.profiles[b.profile_id].budget).toEqual(created.store.profiles[b.profile_id].budget)
    expect(accepted.store.profiles[a.profile_id].trade_reserved_items).toEqual([])
  })

  test('crafting does not spend the reserve, and every available copy can be offered separately', () => {
    const created = offer()
    const state = created.store.profiles[a.profile_id]
    const ids = ['milk-pitcher', 'milk-pitcher', 'club-toaster', 'travel-mug']
    expect(applyCraft(state, craftDiscount(ids, NOW, 0.5), NOW)).toBe(state)
    const second = offer(created.store, 'trade-2')
    expect(second.reason).toBe('trade_created')
    expect(second.store.profiles[a.profile_id].trade_reserved_items).toEqual([
      { item_id: 'milk-pitcher', quantity: 2 },
    ])
    expect(offer(second.store, 'trade-3').reason).toBe('trade_duplicate_unavailable')
  })

  test('allows offering the only available copy of an item', () => {
    const store = initial()
    const result = createDemoTrade(store, {
      trade_id: 'single-copy',
      actor_profile_id: a.profile_id,
      receiver_profile_id: b.profile_id,
      offered_item_id: 'club-toaster',
      requested_item_id: 'fruit-basket',
      expected_store_revision: store.store_revision,
    }, NOW)

    expect(result.reason).toBe('trade_created')
    expect(result.store.profiles[a.profile_id].trade_reserved_items).toEqual([
      { item_id: 'club-toaster', quantity: 1 },
    ])
  })

  test('a decline and a 24-hour expiry free the items without a transfer', () => {
    const created = offer()
    const current = selectDemoProfile(created.store, b, budget)
    const rejected = respondDemoTrade(current, { trade_id: 'trade-1', actor_profile_id: b.profile_id, action: 'reject', expected_store_revision: current.store_revision, expected_trade_revision: 1 }, NOW + 1)
    expect(rejected.reason).toBe('trade_rejected')
    expect(rejected.store.profiles[a.profile_id].profile.inventory).toEqual(a.inventory)
    expect(rejected.store.profiles[a.profile_id].trade_reserved_items).toEqual([])
    const expired = expireDemoTrades(created.store, NOW + 86_400_000)
    expect(expired.trades[0].status).toBe('expired')
    expect(expired.profiles[b.profile_id].trade_reserved_items).toEqual([])
  })

  test('admits only items of equal rarity and two paid purchase days', () => {
    const store = initial()
    const receiver = store.profiles[b.profile_id]
    receiver.profile = { ...receiver.profile, inventory: [...receiver.profile.inventory, { item_id: 'power-blender', quantity: 2 }] }
    const request = { trade_id: 'rare', actor_profile_id: a.profile_id, receiver_profile_id: b.profile_id, offered_item_id: 'milk-pitcher', requested_item_id: 'power-blender', expected_store_revision: store.store_revision }
    expect(createDemoTrade(store, request, NOW).reason).toBe('trade_rarity_mismatch')
    receiver.profile = { ...receiver.profile, receipts: receiver.profile.receipts.slice(0, 1) }
    expect(offer(store).reason).toBe('trade_purchase_days_insufficient')
  })

  test("a stale revision and someone else's confirmation leave the snapshot unchanged", () => {
    const created = offer()
    const command = { trade_id: 'trade-1', actor_profile_id: b.profile_id, action: 'accept' as const, expected_store_revision: 0, expected_trade_revision: 1 }
    const receiver = selectDemoProfile(created.store, b, budget)
    expect(respondDemoTrade(receiver, command, NOW + 1).reason).toBe('trade_stale_revision')
    expect(respondDemoTrade(created.store, { ...command, actor_profile_id: a.profile_id, expected_store_revision: created.store.store_revision }, NOW + 1).reason).toBe('trade_receiver_required')
  })

  test('repeating create and accept is idempotent, and the three-trade limit binds both sides', () => {
    const created = offer()
    expect(offer(created.store).reason).toBe('trade_idempotent')
    const receiver = selectDemoProfile(created.store, b, budget)
    const command = { trade_id: 'trade-1', actor_profile_id: b.profile_id, action: 'accept' as const, expected_store_revision: receiver.store_revision, expected_trade_revision: 1 }
    const accepted = respondDemoTrade(receiver, command, NOW + 1)
    expect(respondDemoTrade(accepted.store, command, NOW + 2).store).toBe(accepted.store)
    const capped = initial()
    capped.trades = [1, 2, 3].map((id) => ({ ...accepted.store.trades[0], trade_id: `past-${id}` }))
    expect(createDemoTrade(capped, { trade_id: 'fourth', actor_profile_id: a.profile_id, receiver_profile_id: b.profile_id, offered_item_id: 'milk-pitcher', requested_item_id: 'breakfast-pan', expected_store_revision: capped.store_revision }, NOW + 2).reason).toBe('trade_weekly_limit')
  })

  test('store v1 migrates to v3 without losing state, and a pending trade survives a reload', () => {
    const store = initial()
    const legacy = { store_version: 1, active_profile_id: store.active_profile_id, profiles: store.profiles, referral_awards: [] }
    const migrated = resolveDemoStore(JSON.stringify(legacy))!
    expect(migrated.store_version).toBe(3)
    expect(migrated.trades).toEqual([])
    expect(migrated.profiles[a.profile_id].profile.inventory).toEqual(a.inventory)
    const pending = offer().store
    expect(resolveDemoStore(serializeDemoStore(pending))).toEqual(pending)
  })
})

describe('referral link between seeded profiles', () => {
  test('Boris was invited by Anna, and the invitation precedes his own paid receipts', () => {
    // The case asks to show the referral calculation, not only cover it with a unit test:
    // without an invited seed profile the panel always answered referral_not_invited.
    expect(a.referral.invited_by_profile_id).toBeNull()
    expect(b.referral.invited_by_profile_id).toBe(a.profile_id)
    expect(b.referral.had_confirmed_purchase_before_invite).toBe(false)
    expect(b.referral.inviter_rewards_in_window).toBe(0)

    const invitedAt = b.referral.invited_at_ms!
    const earliestPaid = Math.min(...b.receipts.map((receipt) => receipt.purchased_at_ms))
    // Otherwise the "already our customer" rule would apply and no reward would ever be granted.
    expect(invitedAt).toBeLessThan(earliestPaid)
    // The first purchase must fall inside the seven-day invitation window.
    expect(earliestPaid - invitedAt).toBeLessThan(DEMO_REFERRAL_WINDOW_DAYS * 86_400_000)
  })
})
