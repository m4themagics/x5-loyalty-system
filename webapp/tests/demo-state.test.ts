import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  demoBudgetSnapshotSchema,
  demoDecisionResponseSchema,
  demoEventResponseSchema,
  demoProfileSnapshotSchema,
  type DemoDecisionResponse,
} from '@pyaterochka-game-demo/contracts'

import { craftDiscount } from '../src/features/home/profile-discount-crafting'
import {
  addChestItem,
  recordLoginVisit,
  applyCraft,
  applyDecision,
  applyEvent,
  applyRedemption,
  createDemoState,
  refreshDemoSavings,
  releaseExpiredPromise,
  resolveDemoState,
  revealGrant,
  serializeDemoState,
} from '../src/features/home/demo-state'
import { buildDemoReceipt } from '../src/features/home/demo-receipt'

const examples = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../recsys/contract/examples',
)

function readExample(name: string): unknown {
  return JSON.parse(readFileSync(path.join(examples, name), 'utf8')) as unknown
}

const NOW_MS = 1_788_598_800_000
const profile = demoProfileSnapshotSchema.parse(readExample('profile-empty.json'))
const budget = demoBudgetSnapshotSchema.parse(readExample('budget.json'))
const offer = demoDecisionResponseSchema.parse(readExample('decision-response-offer.json'))
const noAction = demoDecisionResponseSchema.parse(readExample('decision-response-no-action.json'))
const grantedEvent = demoEventResponseSchema.parse(readExample('event-response-granted.json'))
const duplicateEvent = demoEventResponseSchema.parse(readExample('event-response-duplicate.json'))

function offeredState() {
  const initial = createDemoState(profile, budget)
  return applyDecision(initial, offer, initial.revision, NOW_MS)
}

function grantedState() {
  const state = offeredState()
  const receipt = buildDemoReceipt('qualifying', state.challenge!, NOW_MS, 'rcp-test-1')
  return applyEvent(state, grantedEvent, receipt, state.revision, NOW_MS)
}

describe('демонстрационное состояние персонального сценария', () => {
  test('публикует обещание и держит полный максимальный резерв', () => {
    const state = offeredState()
    expect(state.profile.outstanding_promise?.fulfilled).toBe(false)
    expect(state.budget.coupon_reserved_kopecks).toBe(2500)
    expect(state.budget.physical_reserved_kopecks).toBe(2500)
    expect(state.card?.source).toBe('fallback')
  })

  test('no_action сохраняет инвентарь и не создаёт обещания', () => {
    const initial = createDemoState(profile, budget)
    const state = applyDecision(initial, noAction, initial.revision, NOW_MS)
    expect(state.challenge).toBeNull()
    expect(state.profile.outstanding_promise).toBeNull()
    expect(state.decision?.reason_codes).toEqual(['promise_already_outstanding'])
  })

  test('устаревший ответ не перезаписывает более новое состояние', () => {
    const initial = createDemoState(profile, budget)
    const stale: DemoDecisionResponse = { ...offer, decision_id: 'dec_stale' }
    const state = applyDecision(initial, stale, initial.revision - 1, NOW_MS)
    expect(state).toBe(initial)
  })

  test('подходящий чек начисляет предмет и право на товар ровно один раз', () => {
    const state = grantedState()
    expect(state.profile.inventory).toEqual([{ item_id: 'milk-pitcher', quantity: 1 }])
    expect(state.profile.issued_rewards).toHaveLength(1)
    expect(state.profile.issued_rewards[0].sku_id).toBe('gift-milk-500')
    expect(state.profile.outstanding_promise?.fulfilled).toBe(true)
    expect(state.budget.coupon_settled_kopecks).toBe(0)
    expect(state.budget.physical_settled_kopecks).toBe(2500)
    expect(state.budget.coupon_reserved_kopecks).toBe(2500)
  })

  test('повтор того же начисления не выдаёт вторую награду', () => {
    const first = grantedState()
    const receipt = buildDemoReceipt('qualifying', first.challenge!, NOW_MS, 'rcp-test-1')
    const second = applyEvent(first, grantedEvent, receipt, first.revision, NOW_MS)
    expect(second.profile.issued_rewards).toHaveLength(1)
    expect(second.profile.inventory).toEqual([{ item_id: 'milk-pitcher', quantity: 1 }])
  })

  test('идемпотентный повтор без выдачи ничего не начисляет', () => {
    const state = offeredState()
    const receipt = buildDemoReceipt('qualifying', state.challenge!, NOW_MS, 'rcp-test-2')
    const next = applyEvent(state, duplicateEvent, receipt, state.revision, NOW_MS)
    expect(next.profile.inventory).toEqual([])
    expect(next.profile.issued_rewards).toEqual([])
    expect(next.profile.processed_event_ids).toContain('rcp-test-2')
  })

  test('раскрытие анимацией только помечает награду показанной', () => {
    const state = grantedState()
    const revealed = revealGrant(state)
    expect(revealed.last_grant?.revealed).toBe(true)
    expect(revealed.profile.inventory).toEqual(state.profile.inventory)
    expect(revealGrant(revealed)).toBe(revealed)
  })

  test('истёкшее невыполненное обещание освобождает резерв', () => {
    const state = offeredState()
    const released = releaseExpiredPromise(state, state.challenge!.target.deadline_ms + 1)
    expect(released.profile.outstanding_promise).toBeNull()
    expect(released.budget.coupon_reserved_kopecks).toBe(0)
    expect(released.budget.physical_reserved_kopecks).toBe(0)
  })

  test('действующее обещание не освобождается', () => {
    const state = offeredState()
    expect(releaseExpiredPromise(state, NOW_MS)).toBe(state)
  })

  test('четыре предмета дают один купон и один завершённый рецепт', () => {
    const itemIds = ['club-toaster', 'milk-pitcher', 'travel-mug', 'breakfast-pan']
    let state = createDemoState(
      { ...profile, inventory: itemIds.map((item_id) => ({ item_id, quantity: 1 })) },
      budget,
    )
    state = applyCraft(state, craftDiscount(itemIds, NOW_MS, 0.5), NOW_MS)

    expect(state.profile.inventory).toEqual([])
    expect(state.profile.active_coupon?.percent).toBe(8)
    expect(state.profile.active_coupon?.max_kopecks).toBe(10000)
    expect(state.profile.progress.completed_recipe_ids).toEqual(['breakfast'])
    expect(state.profile.progress.avatar_level).toBe(1)
    expect(state.budget.coupon_reserved_kopecks).toBe(10000)
    expect(state.budget.coupon_settled_kopecks).toBe(0)
  })

  test('активный купон блокирует создание второго', () => {
    const itemIds = ['club-toaster', 'milk-pitcher', 'travel-mug', 'breakfast-pan']
    let state = createDemoState(
      {
        ...profile,
        inventory: itemIds.map((item_id) => ({ item_id, quantity: 2 })),
      },
      budget,
    )
    state = applyCraft(state, craftDiscount(itemIds, NOW_MS, 0.5), NOW_MS)
    const blocked = applyCraft(state, craftDiscount(itemIds, NOW_MS + 1, 0.5), NOW_MS + 1)
    expect(blocked).toBe(state)
  })

  test('повтор того же рецепта не поднимает уровень аватара', () => {
    const itemIds = ['club-toaster', 'milk-pitcher', 'travel-mug', 'breakfast-pan']
    let state = createDemoState(
      { ...profile, inventory: itemIds.map((item_id) => ({ item_id, quantity: 2 })) },
      budget,
    )
    state = applyCraft(state, craftDiscount(itemIds, NOW_MS, 0.5), NOW_MS)
    state = applyRedemption(state, 45_000)
    state = applyCraft(state, craftDiscount(itemIds, NOW_MS + 1, 0.5), NOW_MS + 1)

    expect(state.profile.progress.completed_recipe_ids).toEqual(['breakfast'])
    expect(state.profile.progress.avatar_level).toBe(1)
  })

  test('погашение записывает фактическую экономию не выше максимума купона', () => {
    const itemIds = ['club-toaster', 'milk-pitcher', 'travel-mug', 'breakfast-pan']
    let state = createDemoState(
      { ...profile, inventory: itemIds.map((item_id) => ({ item_id, quantity: 1 })) },
      budget,
    )
    state = applyCraft(state, craftDiscount(itemIds, NOW_MS, 0.5), NOW_MS)
    state = applyRedemption(state, 45_000)

    expect(state.profile.active_coupon).toBeNull()
    expect(state.profile.progress.redeemed_savings_28d_kopecks).toBe(3600)
  })

  test('крафт без достаточного количества копий не меняет состояние', () => {
    const state = createDemoState(profile, budget)
    const itemIds = ['club-toaster', 'milk-pitcher', 'travel-mug', 'breakfast-pan']
    expect(applyCraft(state, craftDiscount(itemIds, NOW_MS, 0.5), NOW_MS)).toBe(state)
  })

  test('состояние переживает перезагрузку и отбрасывает мусор', () => {
    const state = grantedState()
    expect(resolveDemoState(serializeDemoState(state))).toEqual(state)
    expect(resolveDemoState(null)).toBeNull()
    expect(resolveDemoState('не json')).toBeNull()
    expect(resolveDemoState(JSON.stringify({ state_version: 99 }))).toBeNull()
  })

  test('сохраняет точный последний чек для воспроизводимого повтора', () => {
    const state = grantedState()
    expect(state.last_receipt?.receipt.receipt_id).toBe('rcp-test-1')
    expect(state.last_receipt?.challenge_id).toBe(state.challenge?.challenge_id)
    const replay = applyEvent(state, duplicateEvent, state.last_receipt!.receipt, state.revision, NOW_MS + 1)
    expect(replay.profile.receipts.filter((receipt) => receipt.receipt_id === 'rcp-test-1')).toHaveLength(1)
  })

  test('экономия учитывает окно 28 дней по времени погашения, без повторов', () => {
    const ids = ['club-toaster', 'milk-pitcher', 'travel-mug', 'breakfast-pan']
    let state = createDemoState({ ...profile, inventory: ids.map((item_id) => ({ item_id, quantity: 1 })) }, budget)
    state = applyCraft(state, craftDiscount(ids, NOW_MS, 0.5), NOW_MS)
    state = applyRedemption(state, 1000, NOW_MS)
    expect(state.profile.progress.redeemed_savings_28d_kopecks).toBe(80)
    expect(state.budget.coupon_reserved_kopecks).toBe(0)
    expect(state.budget.coupon_settled_kopecks).toBe(80)
    expect(applyRedemption(state, 1000, NOW_MS + 1).redemptions).toHaveLength(1)
    expect(refreshDemoSavings(state, NOW_MS + 28 * 86_400_000).profile.progress.redeemed_savings_28d_kopecks).toBe(0)
  })

  test('новый снимок резервирует максимум будущего купона для уже выданных предметов', () => {
    const itemIds = ['club-toaster', 'milk-pitcher', 'travel-mug']
    const state = createDemoState(
      { ...profile, inventory: itemIds.map((item_id) => ({ item_id, quantity: 1 })) },
      budget,
    )
    expect(state.budget.coupon_reserved_kopecks).toBe(7500)
  })
  test('предмет из коробки попадает в общий инвентарь и удерживает свой резерв', () => {
    const initial = createDemoState({ ...profile, inventory: [] }, budget)
    expect(initial.budget.coupon_reserved_kopecks).toBe(0)

    const ready = [0, 1, 2].reduce((state, day) => recordLoginVisit(state, NOW_MS + day * 86_400_000), initial)
    const withItem = addChestItem(ready, 'club-toaster', NOW_MS + 2 * 86_400_000)
    expect(withItem.profile.inventory).toEqual([{ item_id: 'club-toaster', quantity: 1 }])
    expect(withItem.budget.coupon_reserved_kopecks).toBe(2500)

    const nextReady = [3, 4, 5].reduce((state, day) => recordLoginVisit(state, NOW_MS + day * 86_400_000), withItem)
    const withDuplicate = addChestItem(nextReady, 'club-toaster', NOW_MS + 5 * 86_400_000)
    expect(withDuplicate.profile.inventory).toEqual([{ item_id: 'club-toaster', quantity: 2 }])
    expect(withDuplicate.budget.coupon_reserved_kopecks).toBe(5000)
  })
})
