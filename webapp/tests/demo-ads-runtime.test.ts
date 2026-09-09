import { expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type Receipt = {
  receipt_id: string
  purchased_at_ms: number
  store_id: string
  returned: boolean
  lines: Array<{ sku_id: string; category: string; quantity: number; paid: boolean; amount_kopecks: number }>
}

type RuntimeCampaign = {
  campaign_id: string
  remaining_budget_kopecks: number
  reserved_kopecks: number
  settled_kopecks: number
  frequency_cap_14d: number
}

type RuntimeExposure = {
  exposure_id: string
  decision_id: string
  profile_id: string
  campaign_id: string
  shown_at_ms: number
  reserved_kopecks: number
  status: 'reserved' | 'billed' | 'released'
}

type RuntimeAds = { campaigns: RuntimeCampaign[]; exposures: RuntimeExposure[]; billings: unknown[] }

type DecisionRequest = {
  contract_version: number
  now_ms: number
  profile: { profile_id: string; receipts: Receipt[] }
  ads?: RuntimeAds
  [key: string]: unknown
}

type EventRequest = {
  contract_version: number
  now_ms: number
  idempotency_key: string
  profile: { profile_id: string; processed_event_ids: string[] }
  challenge: {
    challenge_id: string
    economics: {
      campaign_id: string
      advertiser_id: string
      bid_per_qualified_event_kopecks: number
      subsidy_kopecks: number
    }
  }
  receipt: { receipt_id: string }
  [key: string]: unknown
}

type DecisionResponse = {
  status: 'offer' | 'no_action'
  challenge: null | {
    reward: { physical_sku: unknown }
    economics: { funding_source: string; advertiser_id: string | null; campaign_id: string | null }
  }
  reason_codes: string[]
}

type EventResponse = {
  qualification: 'qualified' | 'not_qualified' | 'duplicate'
  idempotent_replay: boolean
  event_id: string
  risk: { decision: string }
  billing?: unknown
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const examplesRoot = path.join(repositoryRoot, 'recsys/contract/examples')

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(repositoryRoot, relativePath), 'utf8')) as T
}

function readExample<T>(name: string): T {
  return JSON.parse(readFileSync(path.join(examplesRoot, name), 'utf8')) as T
}

function runEngine<T>(command: 'decision' | 'event', payload: object): T {
  const result = spawnSync('python3', ['recsys/engine/cli.py', command], {
    cwd: repositoryRoot,
    env: { ...process.env, LLM_PROVIDER: 'template' },
    input: JSON.stringify(payload),
    encoding: 'utf8',
  })
  expect(result.status, result.stderr).toBe(0)
  return JSON.parse(result.stdout) as T
}

/**
 * Ads state from the catalog. `exhausted` zeroes every campaign budget: that is the only honest
 * way to reach "no advertiser funding" now that the catalog covers every game category. This used
 * to be done with a category that had no campaigns, but such a condition tested catalog
 * completeness rather than the funding rule.
 */
function adsState(options: { exhausted?: boolean } = {}): RuntimeAds {
  const catalog = readJson<{ campaigns: Array<{
    campaign_id: string
    remaining_budget: number
    frequency_cap_14d: number
  }> }>('recsys/catalog/campaigns.json')
  return {
    campaigns: catalog.campaigns.map((campaign) => ({
      campaign_id: campaign.campaign_id,
      remaining_budget_kopecks: options.exhausted === true
        ? 0
        : Math.round(campaign.remaining_budget * 100),
      reserved_kopecks: 0,
      settled_kopecks: 0,
      frequency_cap_14d: campaign.frequency_cap_14d,
    })),
    exposures: [],
    billings: [],
  }
}

test('the first physical promise is published only with advertiser funding', () => {
  const funded = readExample<DecisionRequest>('decision-request-empty.json')
  funded.contract_version = 2
  funded.ads = adsState()
  const fundedResponse = runEngine<DecisionResponse>('decision', funded)

  expect(fundedResponse.status).toBe('offer')
  expect(fundedResponse.challenge.reward.physical_sku).not.toBeNull()
  expect(fundedResponse.challenge.economics).toMatchObject({
    funding_source: 'advertiser',
    advertiser_id: expect.any(String),
    campaign_id: expect.any(String),
  })

  const ownMargin = readExample<DecisionRequest>('decision-request-empty.json')
  ownMargin.contract_version = 2
  ownMargin.profile.receipts = [{
    receipt_id: 'rcp-fruit-history',
    purchased_at_ms: ownMargin.now_ms - 86_400_000,
    store_id: 'store-demo-1',
    returned: false,
    lines: [{
      sku_id: 'sku-apple-1kg',
      category: 'Fruit',
      quantity: 1,
      paid: true,
      amount_kopecks: 8_900,
    }],
  }]
  ownMargin.ads = adsState({ exhausted: true })
  const refused = runEngine<DecisionResponse>('decision', ownMargin)

  expect(refused.status).toBe('no_action')
  expect(refused.challenge).toBeNull()
  expect(refused.reason_codes).toContain('funding_gate')
})

test('one allowed qualified event emits one first-price CPA billing and replay emits none', () => {
  const request = readExample<EventRequest>('event-request-qualified.json')
  request.contract_version = 2
  const first = runEngine<EventResponse>('event', request)

  expect(first.qualification).toBe('qualified')
  expect(first.risk.decision).toBe('allow')
  expect(first.billing).toEqual({
    billing_id: expect.any(String),
    event_id: first.event_id,
    profile_id: request.profile.profile_id,
    challenge_id: request.challenge.challenge_id,
    campaign_id: request.challenge.economics.campaign_id,
    advertiser_id: request.challenge.economics.advertiser_id,
    amount_kopecks: request.challenge.economics.bid_per_qualified_event_kopecks,
    subsidy_kopecks: request.challenge.economics.subsidy_kopecks,
    billed_at_ms: request.now_ms,
  })

  request.profile.processed_event_ids = [request.idempotency_key, request.receipt.receipt_id]
  const replay = runEngine<EventResponse>('event', request)

  expect(replay.qualification).toBe('duplicate')
  expect(replay.idempotent_replay).toBe(true)
  expect(replay.billing).toBeNull()
})

test('campaign budget exhaustion removes every first-gift campaign from the next decision', () => {
  const request = readExample<DecisionRequest>('decision-request-empty.json')
  request.contract_version = 2
  const ads = adsState()
  for (const campaign of ads.campaigns) campaign.remaining_budget_kopecks = 0
  request.ads = ads

  const response = runEngine<DecisionResponse>('decision', request)

  expect(response.status).toBe('no_action')
  expect(response.challenge).toBeNull()
  expect(response.reason_codes).toContain('ads_budget_insufficient')
})

test('the 14-day frequency cap removes capped campaigns from the next decision', () => {
  const request = readExample<DecisionRequest>('decision-request-empty.json')
  request.contract_version = 2
  const ads = adsState()
  for (const campaign of ads.campaigns) {
    for (let impression = 0; impression < campaign.frequency_cap_14d; impression += 1) {
      ads.exposures.push({
        exposure_id: `exp-${campaign.campaign_id}-${impression}`,
        decision_id: `dec-${campaign.campaign_id}-${impression}`,
        profile_id: request.profile.profile_id,
        campaign_id: campaign.campaign_id,
        shown_at_ms: request.now_ms - impression * 1_000,
        reserved_kopecks: 0,
        status: 'billed',
      })
    }
  }
  request.ads = ads

  const response = runEngine<DecisionResponse>('decision', request)

  expect(response.status).toBe('no_action')
  expect(response.challenge).toBeNull()
  expect(response.reason_codes).toContain('ads_frequency_cap')
})
