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
} from '@pyaterochka-game-demo/contracts'

import { buildDemoGameFeatures, buildDemoGameSnapshot, fromDemoInventory } from './demo-game-snapshot'

/** Клиент локального демонстрационного API. Ответ движка валидируется тем же контрактом. */

export type DemoApiFailure = { code: string; message: string }
export type DemoApiResult<T> = { ok: true; data: T } | { ok: false; error: DemoApiFailure }

export async function fetchSeedProfiles(): Promise<DemoApiResult<DemoSeedProfilesResponse>> {
  return request('/api/demo/profiles', { method: 'GET' }, demoSeedProfilesResponseSchema)
}

export async function fetchDemoEvaluation(): Promise<DemoApiResult<DemoEvaluationResponse>> {
  return request('/api/demo/evaluation', { method: 'GET' }, demoEvaluationResponseSchema)
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
    error: { code: 'engine_invalid_output', message: 'ответ не соответствует контракту' },
  }
}
