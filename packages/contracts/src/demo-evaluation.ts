import { z } from 'zod'

const primarySchema = z.object({
  policy: z.string().min(1),
  seed_count: z.number().int().positive(),
  positive_net_seeds: z.number().int().nonnegative(),
  mean_net_kopecks: z.number(),
  mean_conservative_net_kopecks: z.number(),
  conservative_net_range_kopecks: z.tuple([z.number(), z.number()]),
  conservative_positive_net_seeds: z.number().int().nonnegative(),
  net_range_kopecks: z.tuple([z.number(), z.number()]),
  mean_coverage: z.number().min(0).max(1),
  mean_incremental_purchase_days: z.number(),
  break_even_cpa_kopecks: z.number().nonnegative().nullable(),
  conservative_break_even_cpa_kopecks: z.number().nonnegative().nullable(),
  actual_cpa_kopecks: z.number().nonnegative().nullable(),
}).strict().refine((value) => value.positive_net_seeds <= value.seed_count, 'positive seeds cannot exceed all seeds')
  .refine((value) => value.conservative_positive_net_seeds <= value.seed_count, 'conservative positive seeds cannot exceed all seeds')
  .refine((value) => value.conservative_net_range_kopecks[0] <= value.conservative_net_range_kopecks[1], 'conservative net range is ordered')
  .refine((value) => value.net_range_kopecks[0] <= value.net_range_kopecks[1], 'net range is ordered')

export const demoEvaluationResponseSchema = z.object({
  contract_version: z.literal(1),
  synthetic: z.literal(true),
  primary: primarySchema,
  stability: z.array(z.object({
    label: z.string().min(1),
    policy: z.string().min(1),
    net_kopecks: z.number(),
    coverage: z.number().min(0).max(1),
    incremental_purchase_days: z.number(),
  }).strict()),
  learned_recsys: z.object({
    evidence_type: z.literal('synthetic_randomized_offline_evaluation'),
    seed_count: z.number().int().positive(),
    training_users_per_seed: z.number().int().positive(),
    heldout_users: z.number().int().positive(),
    heldout_learned_net_kopecks: z.number(),
    heldout_rules_net_kopecks: z.number(),
    heldout_fixed_net_kopecks: z.number(),
    mean_learned_net_kopecks: z.number(),
    learned_net_range_kopecks: z.tuple([z.number(), z.number()]),
    learned_positive_seeds: z.number().int().nonnegative(),
    learned_beats_rules_seeds: z.number().int().nonnegative(),
    uplift_rmse: z.number().nonnegative(),
    billable_auc: z.number().min(0).max(1),
  }).strict()
    .refine((value) => value.learned_positive_seeds <= value.seed_count, 'positive seeds cannot exceed all seeds')
    .refine((value) => value.learned_beats_rules_seeds <= value.seed_count, 'winning seeds cannot exceed all seeds')
    .refine((value) => value.learned_net_range_kopecks[0] <= value.learned_net_range_kopecks[1], 'learned net range is ordered'),
}).strict()

export type DemoEvaluationResponse = z.infer<typeof demoEvaluationResponseSchema>
