import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { demoBudgetSnapshotSchema, demoProfileSnapshotSchema } from '@pyaterochka-game-demo/contracts'
import { createDemoState, applyCraft } from '../src/features/home/demo-state'
import { createDemoStore, selectDemoProfile, resolveDemoStore, serializeDemoStore } from '../src/features/home/demo-store'
import { createDemoTrade, respondDemoTrade, expireDemoTrades, createTradeSeedProfiles } from '../src/features/home/demo-trades'
import { craftDiscount } from '../src/features/home/profile-discount-crafting'

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

describe('обмен цифровыми предметами', () => {
  test('резервирует оба предмета, затем передаёт их одним снимком без изменения денежного резерва', () => {
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

  test('крафт не расходует резерв, а каждую доступную копию можно предложить отдельно', () => {
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

  test('позволяет предложить единственную доступную копию предмета', () => {
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

  test('отклонение и истечение через 24 часа освобождают предметы без передачи', () => {
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

  test('допускает только предметы одинаковой редкости и два оплаченных покупочных дня', () => {
    const store = initial()
    const receiver = store.profiles[b.profile_id]
    receiver.profile = { ...receiver.profile, inventory: [...receiver.profile.inventory, { item_id: 'power-blender', quantity: 2 }] }
    const request = { trade_id: 'rare', actor_profile_id: a.profile_id, receiver_profile_id: b.profile_id, offered_item_id: 'milk-pitcher', requested_item_id: 'power-blender', expected_store_revision: store.store_revision }
    expect(createDemoTrade(store, request, NOW).reason).toBe('trade_rarity_mismatch')
    receiver.profile = { ...receiver.profile, receipts: receiver.profile.receipts.slice(0, 1) }
    expect(offer(store).reason).toBe('trade_purchase_days_insufficient')
  })

  test('устаревшая версия и чужое подтверждение не изменяют снимок', () => {
    const created = offer()
    const command = { trade_id: 'trade-1', actor_profile_id: b.profile_id, action: 'accept' as const, expected_store_revision: 0, expected_trade_revision: 1 }
    const receiver = selectDemoProfile(created.store, b, budget)
    expect(respondDemoTrade(receiver, command, NOW + 1).reason).toBe('trade_stale_revision')
    expect(respondDemoTrade(created.store, { ...command, actor_profile_id: a.profile_id, expected_store_revision: created.store.store_revision }, NOW + 1).reason).toBe('trade_receiver_required')
  })

  test('повтор create и accept идемпотентен, ограничение три обмена действует на обоих', () => {
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

  test('store v1 мигрирует в v3 без потери состояния, ожидающий обмен переживает reload', () => {
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
