import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DEMO_COUPON_MAX_KOPECKS,
  DEMO_INSTANCE_RESERVE_KOPECKS,
  demoDecisionRequestSchema,
  demoDecisionResponseSchema,
  demoEventRequestSchema,
  demoEventResponseSchema,
  demoTitleRequestSchema,
  demoTitleResponseSchema,
  demoGameSnapshotSchema,
  demoProfileSnapshotSchema,
} from './index'

const examplesDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../recsys/contract/examples',
)

function readExample(name: string): unknown {
  return JSON.parse(readFileSync(path.join(examplesDirectory, name), 'utf8')) as unknown
}

const offerResponse = readExample('decision-response-offer.json')
const eventRequest = readExample('event-request-qualified.json')
const grantedResponse = readExample('event-response-granted.json')

describe('local PoC demo contract', () => {
  test('accepts every committed example payload', () => {
    expect(demoGameSnapshotSchema.parse(readExample('game-snapshot.json')).items).toHaveLength(24)
    expect(demoProfileSnapshotSchema.parse(readExample('profile-empty.json')).inventory).toEqual([])
    expect(demoProfileSnapshotSchema.parse(readExample('profile-breakfast-seeded.json')).inventory)
      .toHaveLength(3)
    expect(demoDecisionRequestSchema.parse(readExample('decision-request-empty.json')).profile.profile_id)
      .toBe('demo-empty')
    expect(demoDecisionRequestSchema.parse(readExample('decision-request-seeded.json')).game_features
      .recipe_progress.find((progress) => progress.recipe_id === 'breakfast')?.matched_count)
      .toBe(3)
    expect(demoDecisionResponseSchema.parse(offerResponse).status).toBe('offer')
    expect(demoDecisionResponseSchema.parse(readExample('decision-response-no-action.json')).challenge)
      .toBeNull()
    expect(demoEventRequestSchema.parse(eventRequest).receipt.lines).toHaveLength(2)
    expect(demoEventResponseSchema.parse(grantedResponse).grant?.item_id).toBe('milk-pitcher')
    expect(demoEventResponseSchema.parse(readExample('event-response-duplicate.json')).idempotent_replay)
      .toBe(true)
  })

  test('rejects unknown fields so both sides fail loudly instead of ignoring data', () => {
    expect(() => demoDecisionRequestSchema.parse({
      ...(readExample('decision-request-empty.json') as object),
      extra_field: 1,
    })).toThrow()
  })

  test('binds decision status to the presence of a challenge and a card', () => {
    expect(() => demoDecisionResponseSchema.parse({
      ...(offerResponse as object),
      status: 'no_action',
    })).toThrow()
    expect(() => demoDecisionResponseSchema.parse({
      ...(offerResponse as object),
      card: null,
    })).toThrow()
  })

  test('never lets a held, rejected or unqualified event carry a grant', () => {
    expect(() => demoEventResponseSchema.parse({
      ...(grantedResponse as object),
      qualification: 'not_qualified',
    })).toThrow()
    expect(() => demoEventResponseSchema.parse({
      ...(grantedResponse as object),
      risk: { decision: 'hold', score: 0.9, signals: ['velocity'] },
    })).toThrow()
  })

  test('pins the PoC coupon fund constants used by both sides', () => {
    const challenge = demoDecisionResponseSchema.parse(offerResponse).challenge
    expect(DEMO_COUPON_MAX_KOPECKS).toBe(1_000)
    expect(DEMO_INSTANCE_RESERVE_KOPECKS).toBe(250)
    expect(challenge?.reservation.coupon_reserve_kopecks).toBe(DEMO_INSTANCE_RESERVE_KOPECKS)
    expect(challenge?.reservation.physical_reserve_kopecks)
      .toBe(challenge?.reward.physical_sku?.unit_cost_kopecks)
  })
})

describe('collection title', () => {
  const titleRequest = readExample('title-request-seeded.json')
  const titleResponse = readExample('title-response-seeded.json')

  test('the reference request and response satisfy the contract', () => {
    expect(() => demoTitleRequestSchema.parse(titleRequest)).not.toThrow()
    const parsed = demoTitleResponseSchema.parse(titleResponse)
    expect(parsed.source).toBe('fallback')
    expect(parsed.violations).toEqual([])
  })

  test('the title is length-limited: it is a caption, not card copy', () => {
    expect(() => demoTitleResponseSchema.parse({
      ...(titleResponse as object),
      title: 'A very long collection title that does not fit into the caption line',
    })).toThrow()
  })

  test('the source is limited to the model and the template', () => {
    expect(() => demoTitleResponseSchema.parse({
      ...(titleResponse as object),
      source: 'manual',
    })).toThrow()
  })
})
