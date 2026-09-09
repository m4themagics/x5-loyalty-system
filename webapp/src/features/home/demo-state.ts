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
import { profileItems } from './profile-items'
import { DEMO_AVATAR_MAX_LEVEL, DEMO_COUPON_MAX_KOPECKS, DEMO_INSTANCE_RESERVE_KOPECKS, DEMO_RANKING_WINDOW_DAYS } from '@pyaterochka-game-demo/contracts'

/**
 * Demonstration state of the personal scenario: one versioned snapshot in one browser tab.
 * This is not a protected server-side entitlement ledger and does not confirm fulfilment.
 *
 * `revision` grows every time a result is applied. A response produced for an older revision
 * is discarded and never overwrites newer state.
 */

// v2 drops older snapshots: their Ads promises cannot be settled safely.
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
  item_reserve_kopecks: number
  login_box: { days: number; last_day: number | null; claimed_days: number[]; reserved: boolean }
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
    item_reserve_kopecks: DEMO_INSTANCE_RESERVE_KOPECKS,
    login_box: { days: 0, last_day: null, claimed_days: [], reserved: false },
  }
}

/** Releases the reserves of an expired unfulfilled promise. Earned rights are never revoked. */
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

/** The reveal animation only marks the result as shown; it grants nothing. */
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

/** A box item lands in the same inventory as a challenge reward. */
/**
 * Demonstration mode: the box opens without collecting login days.
 * Set to `false` to restore three distinct days and the four-boxes-per-28-days cap.
 */
export const DEMO_UNLIMITED_CHEST = true

/** Whether the fund has enough free money to reserve another instance. */
export function canReserveInstance(state: DemoState): boolean {
  const available = state.budget.coupon_fund_kopecks
    - state.budget.coupon_settled_kopecks - state.budget.coupon_reserved_kopecks
  return state.login_box.reserved || available >= DEMO_INSTANCE_RESERVE_KOPECKS
}

export function addChestItem(state: DemoState, itemId: string, nowMs: number = Date.now()): DemoState {
  if (!profileItems.some(item => item.id === itemId)) return state
  if (!DEMO_UNLIMITED_CHEST && (!state.login_box.reserved || state.login_box.days !== 3)) return state
  if (!canReserveInstance(state)) return state
  const today = Math.max(loginDay(nowMs), state.login_box.last_day ?? 0)

  // The shown box's reserve moves to the item; otherwise money is held for a new instance.
  return {
    ...state,
    revision: state.revision + 1,
    profile: { ...state.profile, inventory: addInventoryQuantity(state.profile.inventory, itemId) },
    budget: state.login_box.reserved ? state.budget : {
      ...state.budget,
      coupon_reserved_kopecks: state.budget.coupon_reserved_kopecks + DEMO_INSTANCE_RESERVE_KOPECKS,
    },
    login_box: {
      days: 0,
      last_day: today,
      reserved: false,
      claimed_days: [...state.login_box.claimed_days.filter(day => day > today - 28), today],
    },
  }
}

/** Moscow calendar days. A tab left open in the background earns no days. */
export function loginDay(nowMs: number): number {
  return Math.floor((nowMs + 3 * 3_600_000) / 86_400_000)
}

/** A started promise is fully reserved; missed days do not reset progress. */
export function recordLoginVisit(state: DemoState, nowMs: number): DemoState {
  const box = state.login_box
  const today = loginDay(nowMs)
  if (!Number.isSafeInteger(today) || (box.last_day !== null && today <= box.last_day) || box.days === 3) return state
  const claimed = box.claimed_days.filter(day => day > today - 28)
  const available = state.budget.coupon_fund_kopecks
    - state.budget.coupon_settled_kopecks - state.budget.coupon_reserved_kopecks
  if (!box.reserved && (claimed.length >= 4 || available < DEMO_INSTANCE_RESERVE_KOPECKS)) return state
  return {
    ...state,
    revision: state.revision + 1,
    login_box: { days: box.days + 1, last_day: today, claimed_days: claimed, reserved: true },
    budget: {
      ...state.budget,
      coupon_reserved_kopecks: state.budget.coupon_reserved_kopecks
        + (box.reserved ? 0 : DEMO_INSTANCE_RESERVE_KOPECKS),
    },
  }
}

export type LoginGreeting = { days: number; ready: boolean }

/**
 * The login dialog appears only when a new day is counted, not on every state update:
 * restoring from storage and recomputing savings must not open it.
 */
export function loginGreetingFor(previous: DemoState, next: DemoState): LoginGreeting | null {
  if (next.login_box.days <= previous.login_box.days) return null
  return { days: next.login_box.days, ready: next.login_box.days === 3 }
}

/** Demo redemption: savings are counted from the amount actually deducted, not the face value. */
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
    coupon.max_kopecks,
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

/** Window (now - 28 days, now]; older redemptions stay in the log but leave the ranking. */
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
    // Older instances are topped up to the new cap exactly once.
    // The fund is not increased: if it runs short, new promises are blocked and rights are kept.
    const oldReserve = saved.item_reserve_kopecks ?? 250
    const delta = Math.max(0, DEMO_INSTANCE_RESERVE_KOPECKS - oldReserve)
    const count = saved.profile.inventory.reduce((total, entry) => total + entry.quantity, 0)
    const pending = saved.profile.outstanding_promise?.fulfilled === false && saved.challenge != null
    const challenge = pending && delta > 0 ? { ...saved.challenge!, reservation: {
      ...saved.challenge!.reservation,
      coupon_reserve_kopecks: saved.challenge!.reservation.coupon_reserve_kopecks + delta,
    } } : saved.challenge
    return { ...saved, challenge,
      budget: { ...saved.budget, coupon_reserved_kopecks: saved.budget.coupon_reserved_kopecks + delta * (count + Number(pending)) },
      item_reserve_kopecks: DEMO_INSTANCE_RESERVE_KOPECKS,
      login_box: saved.login_box ?? { days: 0, last_day: null, claimed_days: [], reserved: false },
      last_receipt: saved.last_receipt ?? null, redemptions: saved.redemptions ?? [], trade_reserved_items: saved.trade_reserved_items ?? [], last_risk: saved.last_risk ?? null } as DemoState
  } catch {
    return null
  }
}

/** Copies offered in a trade stay owned but become unavailable for spending. */
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
