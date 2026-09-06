import type {
  DemoBudgetSnapshot,
  DemoCard,
  DemoChallenge,
  DemoDecisionResponse,
  DemoEventResponse,
  DemoProfileSnapshot,
  DemoReceipt,
  DemoRiskAssessment,
} from '@pyaterochka-game-demo/contracts'

import type { CraftedDiscount } from './profile-discount-crafting'
import { DEMO_AVATAR_MAX_LEVEL, DEMO_COUPON_MAX_KOPECKS, DEMO_INSTANCE_RESERVE_KOPECKS, DEMO_RANKING_WINDOW_DAYS } from '@pyaterochka-game-demo/contracts'

/**
 * Демонстрационное состояние персонального сценария: один версионированный снимок в одной
 * вкладке браузера. Это не защищённый серверный реестр прав и не подтверждает выдачу товара.
 *
 * `revision` растёт при каждом применении результата. Ответ, полученный для прошлой ревизии,
 * отбрасывается и не перезаписывает более новое состояние.
 */

// v2 сбрасывает старые снимки: их Ads-обещания нельзя списать безопасно.
export const DEMO_STATE_VERSION = 2

export type DemoState = {
  state_version: typeof DEMO_STATE_VERSION
  revision: number
  profile: DemoProfileSnapshot
  budget: DemoBudgetSnapshot
  challenge: DemoChallenge | null
  card: DemoCard | null
  decision: DemoDecisionSummary | null
  last_grant: DemoGrantSummary | null
  last_receipt: { challenge_id: string; receipt: DemoReceipt } | null
  redemptions: { coupon_id: string; redeemed_at_ms: number; saved_kopecks: number }[]
  trade_reserved_items: { item_id: string; quantity: number }[]
  last_risk: DemoRiskAssessment | null
}

export type DemoDecisionSummary = {
  decision_id: string
  status: DemoDecisionResponse['status']
  reason_codes: string[]
  card_source: DemoCard['source'] | null
  llm_error: string | null
  coupon_available_kopecks: number
  physical_available_kopecks: number
}

export type DemoGrantSummary = {
  reward_id: string
  item_id: string
  sku_id: string | null
  revealed: boolean
}

export function createDemoState(
  profile: DemoProfileSnapshot,
  budget: DemoBudgetSnapshot,
): DemoState {
  const inventoryLiability = profile.inventory.reduce(
    (total, entry) => total + entry.quantity * DEMO_INSTANCE_RESERVE_KOPECKS,
    0,
  )
  const couponLiability = profile.active_coupon?.max_kopecks ?? 0
  return {
    state_version: DEMO_STATE_VERSION,
    revision: 1,
    profile,
    budget: {
      ...budget,
      coupon_reserved_kopecks: Math.max(
        budget.coupon_reserved_kopecks,
        inventoryLiability + couponLiability,
      ),
    },
    challenge: null,
    card: null,
    decision: null,
    last_grant: null,
    last_receipt: null,
    redemptions: [],
    trade_reserved_items: [],
    last_risk: null,
  }
}

/** Освобождает резервы истёкшего невыполненного обещания. Заработанное не отменяется. */
export function releaseExpiredPromise(state: DemoState, nowMs: number): DemoState {
  const promise = state.profile.outstanding_promise
  if (promise === null || promise.fulfilled || promise.deadline_ms >= nowMs) return state
  if (state.challenge === null) return state

  return {
    ...state,
    revision: state.revision + 1,
    profile: { ...state.profile, outstanding_promise: null },
    budget: releaseReserves(state.budget, state.challenge),
    challenge: null,
    card: null,
  }
}

export function applyDecision(
  state: DemoState,
  response: DemoDecisionResponse,
  requestRevision: number,
  nowMs: number,
): DemoState {
  if (requestRevision !== state.revision) return state

  const summary: DemoDecisionSummary = {
    decision_id: response.decision_id,
    status: response.status,
    reason_codes: response.reason_codes,
    card_source: response.card?.source ?? null,
    llm_error: response.diagnostics.llm.error,
    coupon_available_kopecks: response.diagnostics.coupon_available_kopecks,
    physical_available_kopecks: response.diagnostics.physical_available_kopecks,
  }

  if (response.status === 'no_action' || response.challenge === null) {
    return { ...state, revision: state.revision + 1, decision: summary }
  }

  return {
    ...state,
    revision: state.revision + 1,
    profile: {
      ...state.profile,
      outstanding_promise: {
        challenge_id: response.challenge.challenge_id,
        challenge_version: response.challenge.challenge_version,
        decision_id: response.decision_id,
        published_at_ms: nowMs,
        deadline_ms: response.challenge.target.deadline_ms,
        fulfilled: false,
      },
    },
    budget: holdReserves(state.budget, response.challenge),
    challenge: response.challenge,
    card: response.card,
    decision: summary,
    last_grant: null,
  }
}

export function applyEvent(
  state: DemoState,
  response: DemoEventResponse,
  receipt: DemoReceipt,
  requestRevision: number,
  nowMs: number,
): DemoState {
  if (requestRevision !== state.revision) return state
  if (state.challenge === null) return state

  const processed = rememberEvent(state.profile.processed_event_ids, response.event_id, receipt)
  const receiptsWithProof = state.profile.receipts.some((existing) => existing.receipt_id === receipt.receipt_id)
    ? state.profile.receipts
    : [...state.profile.receipts, receipt]
  const lastReceipt = { challenge_id: state.challenge.challenge_id, receipt }

  if (response.grant === null) {
    return {
      ...state,
      revision: state.revision + 1,
      last_receipt: lastReceipt,
      last_risk: response.risk,
      profile: {
        ...state.profile,
        receipts: receiptsWithProof,
        processed_event_ids: processed,
      },
    }
  }

  const alreadyIssued = state.profile.issued_rewards.some(
    (reward) => reward.reward_id === response.grant?.reward_id,
  )
  if (alreadyIssued) {
    return {
      ...state,
      revision: state.revision + 1,
      last_receipt: lastReceipt,
      last_risk: response.risk,
      profile: { ...state.profile, processed_event_ids: processed },
    }
  }

  return {
    ...state,
    revision: state.revision + 1,
    last_receipt: lastReceipt,
    last_risk: response.risk,
    profile: {
      ...state.profile,
      receipts: receiptsWithProof,
      processed_event_ids: processed,
      inventory: addInventoryQuantity(state.profile.inventory, response.grant.item_id),
      issued_rewards: [
        ...state.profile.issued_rewards,
        {
          reward_id: response.grant.reward_id,
          challenge_id: state.challenge.challenge_id,
          source_event_id: response.event_id,
          item_instance_id: response.grant.item_instance_id,
          item_id: response.grant.item_id,
          sku_entitlement_id: response.grant.sku_entitlement_id,
          sku_id: response.grant.sku_id,
          issued_at_ms: nowMs,
        },
      ],
      outstanding_promise:
        state.profile.outstanding_promise === null
          ? null
          : { ...state.profile.outstanding_promise, fulfilled: true },
    },
    budget: settleIssuedReward(state.budget, state.challenge, response.grant.sku_id !== null),
    last_grant: {
      reward_id: response.grant.reward_id,
      item_id: response.grant.item_id,
      sku_id: response.grant.sku_id,
      revealed: false,
    },
  }
}

/** Раскрытие анимацией только помечает результат показанным и ничего не начисляет. */
export function revealGrant(state: DemoState): DemoState {
  if (state.last_grant === null || state.last_grant.revealed) return state
  return { ...state, last_grant: { ...state.last_grant, revealed: true } }
}

export function applyCraft(
  state: DemoState,
  discount: CraftedDiscount,
  nowMs: number,
): DemoState {
  if (state.profile.active_coupon !== null) return state
  if (consumeInventoryQuantities(availableDemoInventory(state), discount.itemIds) === null) return state

  const inventory = consumeInventoryQuantities(state.profile.inventory, discount.itemIds)
  if (inventory === null) return state

  const completed = discount.recipeId !== null
    && !state.profile.progress.completed_recipe_ids.includes(discount.recipeId)
    ? [...state.profile.progress.completed_recipe_ids, discount.recipeId]
    : state.profile.progress.completed_recipe_ids

  return {
    ...state,
    revision: state.revision + 1,
    profile: {
      ...state.profile,
      inventory,
      active_coupon: {
        coupon_id: discount.id,
        recipe_id: discount.recipeId,
        percent: discount.percent,
        max_kopecks: DEMO_COUPON_MAX_KOPECKS,
        redeemed_kopecks: null,
        created_at_ms: nowMs,
      },
      progress: {
        ...state.profile.progress,
        completed_recipe_ids: completed,
        avatar_level: Math.min(completed.length, DEMO_AVATAR_MAX_LEVEL),
      },
    },
  }
}

/** Демонстрационное погашение: экономия считается по фактически списанной сумме, не по номиналу. */
export function applyRedemption(
  state: DemoState,
  basketKopecks: number,
  nowMs: number = Date.now(),
): DemoState {
  const coupon = state.profile.active_coupon
  if (coupon === null || coupon.redeemed_kopecks !== null) return state
  if (!Number.isSafeInteger(basketKopecks) || basketKopecks < 0) return state

  const savedKopecks = Math.min(
    Math.floor((basketKopecks * coupon.percent) / 100),
    DEMO_COUPON_MAX_KOPECKS,
  )

  return refreshDemoSavings({
    ...state,
    revision: state.revision + 1,
    redemptions: [...state.redemptions, { coupon_id: coupon.coupon_id, redeemed_at_ms: nowMs, saved_kopecks: savedKopecks }],
    profile: {
      ...state.profile,
      active_coupon: null,
    },
    budget: {
      ...state.budget,
      coupon_reserved_kopecks: Math.max(
        0,
        state.budget.coupon_reserved_kopecks - coupon.max_kopecks,
      ),
      coupon_settled_kopecks: state.budget.coupon_settled_kopecks + savedKopecks,
    },
  }, nowMs)
}

/** Окно (now - 28 суток, now]; старые погашения остаются в журнале, но выходят из рейтинга. */
export function refreshDemoSavings(state: DemoState, nowMs: number): DemoState {
  const start = nowMs - DEMO_RANKING_WINDOW_DAYS * 86_400_000
  const saved = state.redemptions.reduce((total, event) => event.redeemed_at_ms > start && event.redeemed_at_ms <= nowMs
    ? total + event.saved_kopecks : total, 0)
  if (saved === state.profile.progress.redeemed_savings_28d_kopecks) return state
  return {
    ...state,
    revision: state.revision + 1,
    profile: { ...state.profile, progress: { ...state.profile.progress, redeemed_savings_28d_kopecks: saved } },
  }
}

export function serializeDemoState(state: DemoState): string {
  return JSON.stringify(state)
}

export function resolveDemoState(raw: string | null): DemoState | null {
  if (raw === null) return null
  try {
    const saved = JSON.parse(raw) as Partial<DemoState>
    if (
      saved.state_version !== DEMO_STATE_VERSION
      || typeof saved.revision !== 'number'
      || saved.profile === undefined
      || saved.budget === undefined
    ) {
      return null
    }
    return { ...saved, last_receipt: saved.last_receipt ?? null, redemptions: saved.redemptions ?? [], trade_reserved_items: saved.trade_reserved_items ?? [], last_risk: saved.last_risk ?? null } as DemoState
  } catch {
    return null
  }
}

/** Предложенные для обмена копии остаются во владении, но недоступны для расходования. */
export function availableDemoInventory(state: DemoState): DemoProfileSnapshot['inventory'] {
  return state.profile.inventory.flatMap((entry) => {
    const reserved = state.trade_reserved_items.find((item) => item.item_id === entry.item_id)?.quantity ?? 0
    const quantity = Math.max(0, entry.quantity - reserved)
    return quantity > 0 ? [{ ...entry, quantity }] : []
  })
}

function holdReserves(budget: DemoBudgetSnapshot, challenge: DemoChallenge): DemoBudgetSnapshot {
  return {
    ...budget,
    coupon_reserved_kopecks:
      budget.coupon_reserved_kopecks + challenge.reservation.coupon_reserve_kopecks,
    physical_reserved_kopecks:
      budget.physical_reserved_kopecks + challenge.reservation.physical_reserve_kopecks,
  }
}

function releaseReserves(budget: DemoBudgetSnapshot, challenge: DemoChallenge): DemoBudgetSnapshot {
  return {
    ...budget,
    coupon_reserved_kopecks: Math.max(
      0,
      budget.coupon_reserved_kopecks - challenge.reservation.coupon_reserve_kopecks,
    ),
    physical_reserved_kopecks: Math.max(
      0,
      budget.physical_reserved_kopecks - challenge.reservation.physical_reserve_kopecks,
    ),
  }
}

function settleIssuedReward(
  budget: DemoBudgetSnapshot,
  challenge: DemoChallenge,
  physicalIssued: boolean,
): DemoBudgetSnapshot {
  const physicalReserve = challenge.reservation.physical_reserve_kopecks
  return {
    ...budget,
    physical_reserved_kopecks: Math.max(0, budget.physical_reserved_kopecks - physicalReserve),
    physical_settled_kopecks:
      budget.physical_settled_kopecks + (physicalIssued ? physicalReserve : 0),
  }
}

function rememberEvent(
  processed: readonly string[],
  eventId: string,
  receipt: DemoReceipt,
): string[] {
  const next = new Set(processed)
  next.add(eventId)
  next.add(receipt.receipt_id)
  return [...next]
}

function addInventoryQuantity(
  inventory: DemoProfileSnapshot['inventory'],
  itemId: string,
): DemoProfileSnapshot['inventory'] {
  const existing = inventory.find((entry) => entry.item_id === itemId)
  if (existing === undefined) return [...inventory, { item_id: itemId, quantity: 1 }]
  return inventory.map((entry) =>
    entry.item_id === itemId ? { ...entry, quantity: entry.quantity + 1 } : entry)
}

function consumeInventoryQuantities(
  inventory: DemoProfileSnapshot['inventory'],
  itemIds: readonly string[],
): DemoProfileSnapshot['inventory'] | null {
  const required = new Map<string, number>()
  for (const itemId of itemIds) required.set(itemId, (required.get(itemId) ?? 0) + 1)

  for (const [itemId, quantity] of required) {
    const available = inventory.find((entry) => entry.item_id === itemId)?.quantity ?? 0
    if (available < quantity) return null
  }

  return inventory.flatMap((entry) => {
    const remaining = entry.quantity - (required.get(entry.item_id) ?? 0)
    return remaining > 0 ? [{ ...entry, quantity: remaining }] : []
  })
}
