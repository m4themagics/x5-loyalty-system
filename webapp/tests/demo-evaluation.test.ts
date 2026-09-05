import { expect, test } from 'bun:test'
import { demoEvaluationResponseSchema } from '@pyaterochka-game-demo/contracts'
import { summarizeDemoEvaluation } from '../demo-api/evaluation'

const primary = {
  policy: 'sponsored_onboarding', seeds: [1, 2, 3, 4, 5], positive_net_seeds: 5,
  mean: { net_kopecks: 190000, incremental_purchases: 14.8, conservative_net_after_outstanding_max_liability_kopecks: 150000 }, net_range_kopecks: [170000, 210000],
  conservative_net_range_kopecks: [140000, 160000], conservative_positive_net_seeds: 5,
  mean_coverage: 0.16, pooled_break_even_cpa_kopecks: 990, mean_actual_cpa_kopecks: 2583.17,
  pooled_conservative_break_even_cpa_kopecks: 1296,
  runs: [{ huge_private_detail: 'must not reach the browser' }],
}

test('returns a compact validated projection rather than the report or per-user traces', () => {
  const result = summarizeDemoEvaluation({ primary_result: primary, comparison: [{ ...primary, policy: 'personalized_broad', mean: { ...primary.mean, net_kopecks: -100, conservative_net_after_outstanding_max_liability_kopecks: -200, incremental_purchases: 99 } }], stress_appendix: [{ policy: 'personalized_broad', world: 'zero', users: 1000, served_users: 900, net_kopecks: -1000, incremental_purchases: 0 }] })
  expect(demoEvaluationResponseSchema.safeParse(result).success).toBe(true)
  expect(result.primary.mean_net_kopecks).toBe(190000)
  expect(result.primary.mean_conservative_net_kopecks).toBe(150000)
  expect(result.primary.conservative_break_even_cpa_kopecks).toBe(1296)
  expect(result.primary.actual_cpa_kopecks).toBe(2583.17)
  expect(JSON.stringify(result)).not.toContain('huge_private_detail')
  expect(result.stability).toHaveLength(2)
  expect(result.stability[0]?.net_kopecks).toBe(-200)
})

test('does not fabricate economic evidence from missing or inconsistent report fields', () => {
  expect(() => summarizeDemoEvaluation({ primary_result: { ...primary, mean_actual_cpa_kopecks: undefined }, comparison: [], stress_appendix: [] })).toThrow()
  expect(() => summarizeDemoEvaluation({ primary_result: { ...primary, positive_net_seeds: 6 }, comparison: [], stress_appendix: [] })).toThrow()
})
