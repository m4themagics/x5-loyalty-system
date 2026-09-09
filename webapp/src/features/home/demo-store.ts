import {
  DEMO_INSTANCE_RESERVE_KOPECKS,
  demoAdsStateSchema,
  type DemoAdsState,
  type DemoBudgetSnapshot,
  type DemoDecisionResponse,
  type DemoEventResponse,
  type DemoProfileSnapshot,
  type DemoReceipt,
  demoTradeSchema,
  type DemoTrade,
} from '@pyaterochka-game-demo/contracts'

import { applyDecision, applyEvent, createDemoState, releaseExpiredPromise, resolveDemoState, type DemoState } from './demo-state'
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

/** One localStorage write saves both profiles when a referral reward is granted. */
export type DemoStore = {
  store_version: 3
  store_revision: number
  active_profile_id: string
  profiles: Record<string, DemoState>
  referral_awards: ReferralAward[]
  trades: DemoTrade[]
  ads: DemoAdsState
}

const EMPTY_ADS: DemoAdsState = { campaigns: [], exposures: [], billings: [] }

export function createDemoStore(state: DemoState, ads: DemoAdsState = EMPTY_ADS): DemoStore {
  return { store_version: 3, store_revision: 1, active_profile_id: state.profile.profile_id, profiles: { [state.profile.profile_id]: state }, referral_awards: [], trades: [], ads }
}

export function saveDemoProfile(store: DemoStore, state: DemoState): DemoStore {
  return { ...store, store_revision: store.store_revision + 1, active_profile_id: state.profile.profile_id, profiles: { ...store.profiles, [state.profile.profile_id]: state } }
}

export function selectDemoProfile(store: DemoStore, seed: DemoProfileSnapshot, budget: DemoBudgetSnapshot): DemoStore {
  return saveDemoProfile(store, store.profiles[seed.profile_id] ?? createDemoState(seed, budget))
}

/** Adds newly configured campaigns without resetting already demonstrated spend or impressions. */
export function hydrateDemoAds(store: DemoStore, seed: DemoAdsState): DemoStore {
  const known = new Set(store.ads.campaigns.map((campaign) => campaign.campaign_id))
  const additions = seed.campaigns.filter((campaign) => !known.has(campaign.campaign_id))
  if (store.ads.campaigns.length > 0 && additions.length === 0) return store
  return {
    ...store,
    store_revision: store.store_revision + 1,
    ads: store.ads.campaigns.length === 0
      ? structuredClone(seed)
      : { ...store.ads, campaigns: [...store.ads.campaigns, ...additions] },
  }
}

export function serializeDemoStore(store: DemoStore): string {
  return JSON.stringify(store)
}

export function resolveDemoStore(raw: string | null): DemoStore | null {
  if (raw === null) return null
  try {
    const value = JSON.parse(raw) as Omit<Partial<DemoStore>, 'store_version'> & { store_version?: number }
    if (value.store_version !== 1 && value.store_version !== 2 && value.store_version !== 3) {
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
    const ads = value.store_version === 3 ? demoAdsStateSchema.parse(value.ads) : EMPTY_ADS
    return { store_version: 3, store_revision: storeRevision!, active_profile_id: value.active_profile_id, profiles, referral_awards: value.referral_awards, trades, ads }
  } catch {
    return null
  }
}

/** Publishes the promise and reserves the winning campaign in the same browser-store revision. */
export function applyDemoDecision(
  store: DemoStore,
  profileId: string,
  response: DemoDecisionResponse,
  requestRevision: number,
  nowMs: number,
): DemoStore {
  const current = store.profiles[profileId]
  if (current === undefined || current.revision !== requestRevision) return store
  const next = applyDecision(current, response, requestRevision, nowMs)
  if (next === current) return store

  const economics = response.challenge?.economics
  if (response.status !== 'offer' || economics?.funding_source !== 'advertiser') {
    return saveDemoProfile(store, next)
  }
  const campaignId = economics.campaign_id
  if (campaignId === null || economics.advertiser_id === null) return store
  if (store.ads.exposures.some((exposure) => exposure.decision_id === response.decision_id)) return store
  const campaign = store.ads.campaigns.find((entry) => entry.campaign_id === campaignId)
  const reserve = economics.campaign_reserve_kopecks
  if (campaign === undefined || reserve <= 0 || campaign.remaining_budget_kopecks - campaign.reserved_kopecks < reserve) return store

  const exposure = {
    exposure_id: `exp-${response.decision_id}`,
    decision_id: response.decision_id,
    profile_id: profileId,
    campaign_id: campaignId,
    shown_at_ms: nowMs,
    reserved_kopecks: reserve,
    status: 'reserved' as const,
  }
  const saved = saveDemoProfile(store, next)
  return {
    ...saved,
    store_revision: saved.store_revision + 1,
    ads: {
      ...saved.ads,
      campaigns: saved.ads.campaigns.map((entry) => entry.campaign_id === campaignId
        ? { ...entry, reserved_kopecks: entry.reserved_kopecks + reserve }
        : entry),
      exposures: [...saved.ads.exposures, exposure],
    },
  }
}

/** Applies reward and settles exactly one reserved first-price CPA billing atomically. */
export function applyDemoEvent(
  store: DemoStore,
  profileId: string,
  response: DemoEventResponse,
  receipt: DemoReceipt,
  requestRevision: number,
  nowMs: number,
): DemoStore {
  const current = store.profiles[profileId]
  if (current === undefined || current.revision !== requestRevision) return store
  const billing = response.billing
  const requiresBilling = response.grant !== null
    && current.challenge?.economics.funding_source === 'advertiser'
  if (requiresBilling && billing === null) return store
  if (
    billing !== null
    && (
      !billingMatchesPromise(current, profileId, response)
      || store.ads.billings.some((entry) => entry.billing_id === billing.billing_id)
    )
  ) return store

  const next = applyEvent(current, response, receipt, requestRevision, nowMs)
  if (next === current) return store
  const saved = saveDemoProfile(store, next)
  if (billing === null) return saved

  const decisionId = current.profile.outstanding_promise?.decision_id
  const exposure = saved.ads.exposures.find((entry) =>
    entry.decision_id === decisionId
    && entry.profile_id === profileId
    && entry.campaign_id === billing.campaign_id,
  )
  const campaign = saved.ads.campaigns.find((entry) => entry.campaign_id === billing.campaign_id)
  const settled = billing.amount_kopecks + billing.subsidy_kopecks
  if (
    exposure?.status !== 'reserved'
    || campaign === undefined
    || settled !== exposure.reserved_kopecks
    || campaign.remaining_budget_kopecks < settled
    || campaign.reserved_kopecks < settled
  ) return store

  return {
    ...saved,
    store_revision: saved.store_revision + 1,
    ads: {
      campaigns: saved.ads.campaigns.map((entry) => entry.campaign_id === billing.campaign_id
        ? {
            ...entry,
            remaining_budget_kopecks: entry.remaining_budget_kopecks - settled,
            reserved_kopecks: Math.max(0, entry.reserved_kopecks - settled),
            settled_kopecks: entry.settled_kopecks + settled,
          }
        : entry),
      exposures: saved.ads.exposures.map((entry) => entry.exposure_id === exposure.exposure_id
        ? { ...entry, status: 'billed' as const }
        : entry),
      billings: [...saved.ads.billings, billing],
    },
  }
}

/** Releases expired campaign reservations together with the expired customer promise. */
export function releaseExpiredDemoPromise(store: DemoStore, profileId: string, nowMs: number): DemoStore {
  const current = store.profiles[profileId]
  if (current === undefined) return store
  const decisionId = current.profile.outstanding_promise?.decision_id
  const next = releaseExpiredPromise(current, nowMs)
  if (next === current) return store
  let saved = { ...saveDemoProfile(store, next), active_profile_id: store.active_profile_id }
  if (decisionId === undefined) return saved
  const exposure = saved.ads.exposures.find((entry) => entry.decision_id === decisionId && entry.status === 'reserved')
  if (exposure === undefined) return saved
  saved = {
    ...saved,
    store_revision: saved.store_revision + 1,
    ads: {
      ...saved.ads,
      campaigns: saved.ads.campaigns.map((entry) => entry.campaign_id === exposure.campaign_id
        ? { ...entry, reserved_kopecks: Math.max(0, entry.reserved_kopecks - exposure.reserved_kopecks) }
        : entry),
      exposures: saved.ads.exposures.map((entry) => entry.exposure_id === exposure.exposure_id
        ? { ...entry, status: 'released' as const }
        : entry),
    },
  }
  return saved
}

/** Releases every expired promise so an inactive profile does not block the shared Ads budget. */
export function releaseExpiredDemoPromises(store: DemoStore, nowMs: number): DemoStore {
  return Object.keys(store.profiles).reduce(
    (current, profileId) => releaseExpiredDemoPromise(current, profileId, nowMs),
    store,
  )
}

/** Returns the whole scenario to its initial profiles, budgets, Ads exposures and trades. */
export function resetDemoStore(
  profiles: DemoProfileSnapshot[],
  budget: DemoBudgetSnapshot,
  ads: DemoAdsState,
): DemoStore {
  const first = profiles[0]
  if (first === undefined) throw new Error('Resetting the demo needs at least one profile')
  return {
    store_version: 3,
    store_revision: 1,
    active_profile_id: first.profile_id,
    profiles: Object.fromEntries(
      profiles.map((profile) => [profile.profile_id, createDemoState(profile, budget)]),
    ),
    referral_awards: [],
    trades: [],
    ads: structuredClone(ads),
  }
}

function billingMatchesPromise(
  state: DemoState,
  profileId: string,
  response: DemoEventResponse,
): boolean {
  const billing = response.billing
  const economics = state.challenge?.economics
  return billing !== null
    && response.grant !== null
    && state.challenge !== null
    && economics?.funding_source === 'advertiser'
    && billing.event_id === response.event_id
    && billing.profile_id === profileId
    && billing.challenge_id === state.challenge.challenge_id
    && billing.campaign_id === economics.campaign_id
    && billing.advertiser_id === economics.advertiser_id
    && billing.amount_kopecks === economics.bid_per_qualified_event_kopecks
    && billing.subsidy_kopecks === economics.subsidy_kopecks
}

/** Only the result of an allowed qualifying event can grant an item to the inviter. */
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
