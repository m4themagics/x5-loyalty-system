import {
  DEMO_INSTANCE_RESERVE_KOPECKS,
  type DemoBudgetSnapshot,
  type DemoEventResponse,
  type DemoProfileSnapshot,
  type DemoReceipt,
  demoTradeSchema,
  type DemoTrade,
} from '@pyaterochka-game-demo/contracts'

import { createDemoState, resolveDemoState, type DemoState } from './demo-state'
import { DEMO_REFERRAL_WINDOW_DAYS, referralOutcome } from './demo-progress'
import { profileItems } from './profile-items'

type ReferralAward = {
  award_id: string
  inviter_profile_id: string
  invitee_profile_id: string
  receipt_id: string
  item_id: string
  issued_at_ms: number
}

/** Один localStorage write сохраняет оба профиля при реферальном начислении. */
export type DemoStore = {
  store_version: 2
  store_revision: number
  active_profile_id: string
  profiles: Record<string, DemoState>
  referral_awards: ReferralAward[]
  trades: DemoTrade[]
}

export function createDemoStore(state: DemoState): DemoStore {
  return { store_version: 2, store_revision: 1, active_profile_id: state.profile.profile_id, profiles: { [state.profile.profile_id]: state }, referral_awards: [], trades: [] }
}

export function saveDemoProfile(store: DemoStore, state: DemoState): DemoStore {
  return { ...store, store_revision: store.store_revision + 1, active_profile_id: state.profile.profile_id, profiles: { ...store.profiles, [state.profile.profile_id]: state } }
}

export function selectDemoProfile(store: DemoStore, seed: DemoProfileSnapshot, budget: DemoBudgetSnapshot): DemoStore {
  return saveDemoProfile(store, store.profiles[seed.profile_id] ?? createDemoState(seed, budget))
}

export function serializeDemoStore(store: DemoStore): string {
  return JSON.stringify(store)
}

export function resolveDemoStore(raw: string | null): DemoStore | null {
  if (raw === null) return null
  try {
    const value = JSON.parse(raw) as Omit<Partial<DemoStore>, 'store_version'> & { store_version?: number }
    if (value.store_version !== 1 && value.store_version !== 2) {
      const legacy = resolveDemoState(raw)
      return legacy === null ? null : createDemoStore(legacy)
    }
    if (typeof value.active_profile_id !== 'string' || value.profiles === undefined || !Array.isArray(value.referral_awards)) return null
    const profiles: Record<string, DemoState> = {}
    for (const [id, rawState] of Object.entries(value.profiles)) {
      const state = resolveDemoState(JSON.stringify(rawState))
      if (state === null || state.profile.profile_id !== id) return null
      profiles[id] = state
    }
    if (profiles[value.active_profile_id] === undefined) return null
    const trades = value.store_version === 1 ? [] : value.trades?.map((trade) => demoTradeSchema.parse(trade))
    if (trades === undefined) return null
    const storeRevision = value.store_version === 1 ? 1 : value.store_revision
    if (!Number.isSafeInteger(storeRevision) || storeRevision! < 1) return null
    return { store_version: 2, store_revision: storeRevision!, active_profile_id: value.active_profile_id, profiles, referral_awards: value.referral_awards, trades }
  } catch {
    return null
  }
}

/** Только результат разрешённого квалифицирующего события может выдать предмет пригласившему. */
export function applyReferralReward(
  store: DemoStore,
  inviteeId: string,
  response: DemoEventResponse,
  receipt: DemoReceipt,
  nowMs: number,
): { store: DemoStore; reason: string } {
  const refuse = (reason: string) => ({ store, reason })
  const invitee = store.profiles[inviteeId]
  if (invitee === undefined) return refuse('referral_profile_missing')
  if (store.referral_awards.some((award) => award.invitee_profile_id === inviteeId)) return refuse('referral_already_issued')
  if (response.grant === null || response.qualification !== 'qualified' || response.risk.decision !== 'allow') return refuse('referral_no_qualifying_purchase')
  if (!invitee.profile.issued_rewards.some((reward) => reward.reward_id === response.grant?.reward_id)) return refuse('referral_no_qualifying_purchase')

  const referral = invitee.profile.referral
  const inviterId = referral.invited_by_profile_id
  const windowStart = nowMs - DEMO_REFERRAL_WINDOW_DAYS * 86_400_000
  const paidAwards = store.referral_awards.filter((award) => award.inviter_profile_id === inviterId && award.issued_at_ms > windowStart).length
  const eligibility = referralOutcome({ ...referral, inviter_rewards_in_window: Math.max(referral.inviter_rewards_in_window, paidAwards) }, inviteeId, receipt.purchased_at_ms)
  if (!eligibility.eligible) return refuse(eligibility.reason)
  if (invitee.profile.receipts.some((previous) => previous.purchased_at_ms < referral.invited_at_ms! && !previous.returned && previous.lines.some((line) => line.paid && line.amount_kopecks > 0))) return refuse('referral_existing_customer')
  const inviter = inviterId === null ? undefined : store.profiles[inviterId]
  if (inviter === undefined) return refuse('referral_inviter_missing')
  const available = inviter.budget.coupon_fund_kopecks - inviter.budget.coupon_settled_kopecks - inviter.budget.coupon_reserved_kopecks
  if (available < DEMO_INSTANCE_RESERVE_KOPECKS) return refuse('referral_budget_insufficient')

  const item = profileItems.find((candidate) => candidate.rarity === 'common')!
  const existing = inviter.profile.inventory.find((entry) => entry.item_id === item.id)
  const inventory = existing === undefined
    ? [...inviter.profile.inventory, { item_id: item.id, quantity: 1 }]
    : inviter.profile.inventory.map((entry) => entry.item_id === item.id ? { ...entry, quantity: entry.quantity + 1 } : entry)
  const award: ReferralAward = {
    award_id: `referral-${inviterId}-${inviteeId}`,
    inviter_profile_id: inviterId!,
    invitee_profile_id: inviteeId,
    receipt_id: receipt.receipt_id,
    item_id: item.id,
    issued_at_ms: nowMs,
  }
  return {
    reason: 'referral_reward_issued',
    store: {
      ...store,
      store_revision: store.store_revision + 1,
      profiles: {
        ...store.profiles,
        [inviteeId]: { ...invitee, revision: invitee.revision + 1, profile: { ...invitee.profile, referral: { ...referral, inviter_rewards_in_window: paidAwards + 1 } } },
        [inviterId!]: { ...inviter, revision: inviter.revision + 1, profile: { ...inviter.profile, inventory }, budget: { ...inviter.budget, coupon_reserved_kopecks: inviter.budget.coupon_reserved_kopecks + DEMO_INSTANCE_RESERVE_KOPECKS } },
      },
      referral_awards: [...store.referral_awards, award],
    },
  }
}
