import { expect, test } from 'bun:test'
import { demoEvaluationResponseSchema } from './demo-evaluation'

test('evaluation API fixes synthetic status and rejects invalid coverage or seed counts', () => {
  const response = { contract_version: 1, synthetic: true, primary: {
    policy: 'sponsored_onboarding', seed_count: 5, positive_net_seeds: 5, mean_net_kopecks: 193190,
    mean_conservative_net_kopecks: 150000, conservative_net_range_kopecks: [140000, 160000], conservative_positive_net_seeds: 5,
    net_range_kopecks: [175390, 217550], mean_coverage: 0.1612, mean_incremental_purchase_days: 14.8,
    break_even_cpa_kopecks: 990, actual_cpa_kopecks: 2583.17,
    conservative_break_even_cpa_kopecks: 1296,
  }, stability: [] }
  expect(demoEvaluationResponseSchema.safeParse(response).success).toBe(true)
  expect(demoEvaluationResponseSchema.safeParse({ ...response, synthetic: false }).success).toBe(false)
  expect(demoEvaluationResponseSchema.safeParse({ ...response, primary: { ...response.primary, mean_coverage: 16 } }).success).toBe(false)
  expect(demoEvaluationResponseSchema.safeParse({ ...response, primary: { ...response.primary, positive_net_seeds: 6 } }).success).toBe(false)
})
