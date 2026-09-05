import { z } from 'zod'
import { demoEvaluationResponseSchema } from '@pyaterochka-game-demo/contracts'

// Минимальный вход: только поля, необходимые экрану. Остальные 6 000+ строк отчёта не передаются.
const policySchema = z.object({
  policy: z.string().min(1), seeds: z.array(z.number().int()).min(1), positive_net_seeds: z.number().int().nonnegative(),
  mean: z.object({ net_kopecks: z.number(), incremental_purchases: z.number(), conservative_net_after_outstanding_max_liability_kopecks: z.number() }),
  conservative_net_range_kopecks: z.tuple([z.number(), z.number()]), conservative_positive_net_seeds: z.number().int().nonnegative(),
  net_range_kopecks: z.tuple([z.number(), z.number()]), mean_coverage: z.number().min(0).max(1),
  pooled_break_even_cpa_kopecks: z.number().nonnegative().nullable(), mean_actual_cpa_kopecks: z.number().nonnegative().nullable(),
  pooled_conservative_break_even_cpa_kopecks: z.number().nonnegative().nullable(),
})
const reportSchema = z.object({
  primary_result: policySchema,
  comparison: z.array(policySchema),
  stress_appendix: z.array(z.object({
    policy: z.string(), world: z.enum(['positive', 'zero', 'negative']), users: z.number().positive(),
    served_users: z.number().nonnegative(), net_kopecks: z.number(), incremental_purchases: z.number(),
  })),
})

export function summarizeDemoEvaluation(raw: unknown) {
  const report = reportSchema.parse(raw)
  const p = report.primary_result
  return demoEvaluationResponseSchema.parse({
    contract_version: 1, synthetic: true,
    primary: {
      policy: p.policy, seed_count: p.seeds.length, positive_net_seeds: p.positive_net_seeds,
      mean_net_kopecks: p.mean.net_kopecks, net_range_kopecks: p.net_range_kopecks,
      mean_conservative_net_kopecks: p.mean.conservative_net_after_outstanding_max_liability_kopecks,
      conservative_net_range_kopecks: p.conservative_net_range_kopecks,
      conservative_positive_net_seeds: p.conservative_positive_net_seeds,
      mean_coverage: p.mean_coverage, mean_incremental_purchase_days: p.mean.incremental_purchases,
      break_even_cpa_kopecks: p.pooled_break_even_cpa_kopecks, actual_cpa_kopecks: p.mean_actual_cpa_kopecks,
      conservative_break_even_cpa_kopecks: p.pooled_conservative_break_even_cpa_kopecks,
    },
    stability: [
      ...report.comparison.filter((policy) => policy.policy === 'personalized_broad').map((policy) => ({
        label: 'Широкая выдача после обеспечения: среднее по seed', policy: policy.policy,
        net_kopecks: policy.mean.conservative_net_after_outstanding_max_liability_kopecks,
        coverage: policy.mean_coverage, incremental_purchase_days: policy.mean.incremental_purchases,
      })),
      ...report.stress_appendix.filter((world) => world.world !== 'positive').map((world) => ({
        label: world.world === 'zero' ? 'Нулевой эффект' : 'Отрицательный эффект', policy: world.policy,
        net_kopecks: world.net_kopecks, coverage: world.served_users / world.users, incremental_purchase_days: world.incremental_purchases,
      })),
    ],
  })
}
