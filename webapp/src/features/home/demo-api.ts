import {
  DEMO_CONTRACT_VERSION,
  type DemoBudgetSnapshot,
  type DemoAdsState,
  type DemoChallenge,
  type DemoDecisionResponse,
  type DemoEventResponse,
  type DemoProfileSnapshot,
  type DemoReceipt,
  type DemoSeedProfilesResponse,
  demoDecisionResponseSchema,
  demoErrorResponseSchema,
  demoEventResponseSchema,
  demoSeedProfilesResponseSchema,
  demoEvaluationResponseSchema,
  type DemoEvaluationResponse,
  demoTitleResponseSchema,
  type DemoTitleResponse,
} from '@pyaterochka-game-demo/contracts'

import { buildDemoGameFeatures, buildDemoGameSnapshot, fromDemoInventory } from './demo-game-snapshot'

/** Client of the local demo API. The engine response is validated by the same contract. */

const TITLE_REQUEST_TIMEOUT_MS = 5_000

export type DemoApiFailure = { code: string; message: string }
export type DemoApiResult<T> = { ok: true; data: T } | { ok: false; error: DemoApiFailure }

export async function fetchSeedProfiles(): Promise<DemoApiResult<DemoSeedProfilesResponse>> {
  const result = await request(
    '/api/demo/profiles',
    { method: 'GET' },
    demoSeedProfilesResponseSchema,
  )
  return result.ok
    ? result
    : { ok: true, data: createOfflineSeedProfiles(Date.now()) }
}

/**
 * Static hosting does not run the local Python API. This synthetic profile keeps the browser
 * exchange usable; decisions and receipt checks still require the API.
 */
export function createOfflineSeedProfiles(nowMs: number): DemoSeedProfilesResponse {
  const dayMs = 86_400_000
  return demoSeedProfilesResponseSchema.parse({
    contract_version: DEMO_CONTRACT_VERSION,
    profiles: [{
      snapshot_version: DEMO_CONTRACT_VERSION,
      profile_id: 'demo-offline',
      label: 'Offline demonstration profile',
      synthetic: true,
      receipts: [
        {
          receipt_id: 'offline-receipt-milk',
          purchased_at_ms: nowMs - dayMs,
          store_id: 'offline-store',
          returned: false,
          lines: [{
            sku_id: 'offline-milk',
            category: 'Dairy',
            quantity: 1,
            paid: true,
            amount_kopecks: 9_900,
          }],
        },
        {
          receipt_id: 'offline-receipt-bread',
          purchased_at_ms: nowMs - dayMs * 3,
          store_id: 'offline-store',
          returned: false,
          lines: [{
            sku_id: 'offline-bread',
            category: 'Bread & Bakery',
            quantity: 1,
            paid: true,
            amount_kopecks: 6_900,
          }],
        },
      ],
      inventory: [],
      issued_rewards: [],
      processed_event_ids: [],
      active_coupon: null,
      outstanding_promise: null,
      progress: {
        completed_recipe_ids: [],
        avatar_level: 0,
        redeemed_savings_28d_kopecks: 0,
      },
      referral: {
        invited_by_profile_id: null,
        invited_at_ms: null,
        had_confirmed_purchase_before_invite: false,
        inviter_rewards_in_window: 0,
      },
      risk_signals: {
        device_id: 'offline-demo-device',
        household_id: null,
        account_age_days: 30,
        confirmed_purchase_days: 2,
      },
    }],
    budget: {
      coupon_fund_kopecks: 1_000_000,
      coupon_settled_kopecks: 0,
      coupon_reserved_kopecks: 0,
      physical_fund_kopecks: 0,
      physical_settled_kopecks: 0,
      physical_reserved_kopecks: 0,
    },
    ads: { campaigns: [], exposures: [], billings: [] },
  })
}

export async function fetchDemoEvaluation(): Promise<DemoApiResult<DemoEvaluationResponse>> {
  return request('/api/demo/evaluation', { method: 'GET' }, demoEvaluationResponseSchema)
}

/**
 * Collection title. The model describes only the collected items; on any error the engine
 * returns a deterministic template with `source: "fallback"`.
 */
export async function requestCollectionTitle(
  profile: DemoProfileSnapshot,
  nowMs: number,
): Promise<DemoApiResult<DemoTitleResponse>> {
  return request(
    '/api/demo/title',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(TITLE_REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        contract_version: DEMO_CONTRACT_VERSION,
        request_id: `req-title-${nowMs}`,
        now_ms: nowMs,
        profile,
        game: buildDemoGameSnapshot(),
      }),
    },
    demoTitleResponseSchema,
  )
}

export async function requestDecision(
  profile: DemoProfileSnapshot,
  budget: DemoBudgetSnapshot,
  ads: DemoAdsState,
  nowMs: number,
): Promise<DemoApiResult<DemoDecisionResponse>> {
  return request(
    '/api/demo/decision',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contract_version: DEMO_CONTRACT_VERSION,
        request_id: `req-decision-${nowMs}`,
        now_ms: nowMs,
        profile,
        game: buildDemoGameSnapshot(),
        game_features: buildDemoGameFeatures(fromDemoInventory(profile.inventory)),
        budget,
        ads,
      }),
    },
    demoDecisionResponseSchema,
  )
}

export async function submitDemoEvent(
  profile: DemoProfileSnapshot,
  challenge: DemoChallenge,
  receipt: DemoReceipt,
  nowMs: number,
): Promise<DemoApiResult<DemoEventResponse>> {
  return request(
    '/api/demo/event',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contract_version: DEMO_CONTRACT_VERSION,
        request_id: `req-event-${nowMs}`,
        now_ms: nowMs,
        idempotency_key: `idem-${challenge.challenge_id}-${receipt.receipt_id}`,
        profile,
        challenge,
        receipt,
      }),
    },
    demoEventResponseSchema,
  )
}

async function request<T>(
  url: string,
  init: RequestInit,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
): Promise<DemoApiResult<T>> {
  let payload: unknown
  try {
    const response = await fetch(url, init)
    payload = await response.json()
  } catch (error) {
    return { ok: false, error: { code: 'engine_failed', message: String(error) } }
  }

  const parsed = schema.safeParse(payload)
  if (parsed.success) return { ok: true, data: parsed.data }

  const failure = demoErrorResponseSchema.safeParse(payload)
  if (failure.success) return { ok: false, error: failure.data.error }

  return {
    ok: false,
    error: { code: 'engine_invalid_output', message: 'the response does not match the contract' },
  }
}
