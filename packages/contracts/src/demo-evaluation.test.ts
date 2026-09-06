import { expect, test } from 'bun:test'
import { demoEvaluationResponseSchema } from './demo-evaluation'

test('evaluation API fixes synthetic status and rejects invalid coverage or seed counts', () => {
  const response = { contract_version: 1, synthetic: true, primary: {
    policy: 'sponsored_onboarding', seed_count: 5, positive_net_seeds: 5, mean_net_kopecks: 193190,
    mean_conservative_net_kopecks: 150000, conservative_net_range_kopecks: [140000, 160000], conservative_positive_net_seeds: 5,
    net_range_kopecks: [175390, 217550], mean_coverage: 0.1612, mean_incremental_purchase_days: 14.8,
    break_even_cpa_kopecks: 990, actual_cpa_kopecks: 2583.17,
    conservative_break_even_cpa_kopecks: 1296,
  }, stability: [], learned_recsys: {
    evidence_type: 'synthetic_randomized_offline_evaluation', seed_count: 5,
    training_users_per_seed: 6000, heldout_users: 1215,
    heldout_learned_net_kopecks: 1866520, heldout_rules_net_kopecks: 1353360,
    heldout_fixed_net_kopecks: -679060, mean_learned_net_kopecks: 1776376,
    learned_net_range_kopecks: [1582820, 1943160], learned_positive_seeds: 5,
    learned_beats_rules_seeds: 5, uplift_rmse: 0.063689, billable_auc: 0.801916,
  } }
  expect(demoEvaluationResponseSchema.safeParse(response).success).toBe(true)
  expect(demoEvaluationResponseSchema.safeParse({ ...response, synthetic: false }).success).toBe(false)
  expect(demoEvaluationResponseSchema.safeParse({ ...response, primary: { ...response.primary, mean_coverage: 16 } }).success).toBe(false)
  expect(demoEvaluationResponseSchema.safeParse({ ...response, primary: { ...response.primary, positive_net_seeds: 6 } }).success).toBe(false)
})
