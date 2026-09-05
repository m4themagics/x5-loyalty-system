import { z } from 'zod'

/**
 * Контракт локального PoC «X5 Чекпоинт»: история покупок -> вычисленное задание -> карточка ->
 * тестовый чек -> обещанные награды -> существующий крафт.
 *
 * Границы: контракт описывает демонстрационный обмен между webapp (Vite middleware) и движком
 * `recsys/engine` на Python. Он не является серверным реестром прав. Поля в snake_case, потому
 * что вторая сторона — Python и существующий `recsys/schema/action.schema.json`.
 *
 * Деньги — целые копейки. Обмен предметами, повторные товарные цели и полный аукцион в этот
 * контракт не входят: у них нет идентификатора экземпляра и они вынесены на следующий этап.
 */

export const DEMO_CONTRACT_VERSION = 1

export const DEMO_CRAFT_SIZE = 4
export const DEMO_COUPON_MAX_KOPECKS = 1_000
export const DEMO_INSTANCE_RESERVE_KOPECKS = 250
export const DEMO_QUALIFICATION_WINDOW_DAYS = 7
export const DEMO_AVATAR_MAX_LEVEL = 7
export const DEMO_RANKING_WINDOW_DAYS = 28

/**
 * Общий словарь причин. Значение хранится строкой: движок может добавить свою причину,
 * не ломая клиент. Список фиксирует общие формулировки, а не закрытое множество.
 */
export const DEMO_REASON_CODES = [
  'offer_published',
  'no_eligible_candidate',
  'no_purchase_history',
  'category_not_in_history',
  'promise_already_outstanding',
  'coupon_budget_insufficient',
  'physical_budget_insufficient',
  'sku_out_of_stock',
  'sku_economics_negative',
  'sku_category_excluded',
  'risk_hold',
  'exploration_disabled',
  'receipt_duplicate',
  'receipt_line_not_paid',
  'receipt_category_mismatch',
  'receipt_quantity_insufficient',
  'receipt_window_expired',
  'receipt_returned',
  'reward_already_issued',
  'idempotent_replay',
] as const

const identifierSchema = z.string().min(1).max(120)
const reasonCodeSchema = z.string().regex(/^[a-z][a-z0-9_]{2,63}$/)
const kopecksSchema = z.number().int().nonnegative().max(1_000_000_000)
const timestampSchema = z.number().int().nonnegative()

export const demoItemRaritySchema = z.enum(['common', 'epic', 'legendary'])

/** Снимок каталога из `webapp/src/features/home`. Python не хранит второй каталог. */
export const demoGameItemSchema = z
  .object({
    id: identifierSchema,
    name: z.string().min(1),
    rarity: demoItemRaritySchema,
    category: z.string().min(1),
  })
  .strict()

export const demoGameRecipeSchema = z
  .object({
    id: identifierSchema,
    title: z.string().min(1),
    category: z.string().min(1),
    item_ids: z.array(identifierSchema).min(1),
  })
  .strict()

export const demoGameSnapshotSchema = z
  .object({
    craft_size: z.literal(DEMO_CRAFT_SIZE),
    items: z.array(demoGameItemSchema).min(1),
    recipes: z.array(demoGameRecipeSchema).min(1),
  })
  .strict()

/**
 * Игровые признаки считает middleware по тем же TypeScript-модулям. Копия формулы скидки
 * в Python запрещена: движок выбирает задание и предмет, процент считает игра.
 */
export const demoRecipeProgressSchema = z
  .object({
    recipe_id: identifierSchema,
    matched_count: z.number().int().nonnegative(),
    owned_item_ids: z.array(identifierSchema),
    missing_item_ids: z.array(identifierSchema),
  })
  .strict()

export const demoGameFeaturesSchema = z
  .object({
    inventory_total: z.number().int().nonnegative(),
    inventory_distinct: z.number().int().nonnegative(),
    duplicate_item_ids: z.array(identifierSchema),
    recipe_progress: z.array(demoRecipeProgressSchema),
  })
  .strict()

export const demoReceiptLineSchema = z
  .object({
    sku_id: identifierSchema,
    category: z.string().min(1),
    quantity: z.number().int().positive(),
    paid: z.boolean(),
    amount_kopecks: kopecksSchema,
  })
  .strict()

export const demoReceiptSchema = z
  .object({
    receipt_id: identifierSchema,
    purchased_at_ms: timestampSchema,
    store_id: identifierSchema,
    returned: z.boolean(),
    lines: z.array(demoReceiptLineSchema).min(1),
  })
  .strict()

export const demoInventoryEntrySchema = z
  .object({
    item_id: identifierSchema,
    quantity: z.number().int().positive(),
  })
  .strict()

export const demoIssuedRewardSchema = z
  .object({
    reward_id: identifierSchema,
    challenge_id: identifierSchema,
    source_event_id: identifierSchema,
    item_instance_id: identifierSchema.nullable(),
    item_id: identifierSchema.nullable(),
    sku_entitlement_id: identifierSchema.nullable(),
    sku_id: identifierSchema.nullable(),
    issued_at_ms: timestampSchema,
  })
  .strict()

export const demoActiveCouponSchema = z
  .object({
    coupon_id: identifierSchema,
    recipe_id: identifierSchema.nullable(),
    percent: z.number().int().positive().max(18),
    max_kopecks: z.literal(DEMO_COUPON_MAX_KOPECKS),
    redeemed_kopecks: kopecksSchema.nullable(),
    created_at_ms: timestampSchema,
  })
  .strict()

/** Задание, уже показанное пользователю. `no_action` его не отменяет. */
export const demoOutstandingPromiseSchema = z
  .object({
    challenge_id: identifierSchema,
    challenge_version: z.number().int().positive(),
    decision_id: identifierSchema,
    published_at_ms: timestampSchema,
    deadline_ms: timestampSchema,
    fulfilled: z.boolean(),
  })
  .strict()

export const demoProgressSchema = z
  .object({
    completed_recipe_ids: z.array(identifierSchema),
    avatar_level: z.number().int().min(0).max(DEMO_AVATAR_MAX_LEVEL),
    redeemed_savings_28d_kopecks: kopecksSchema,
  })
  .strict()

export const demoReferralSchema = z
  .object({
    invited_by_profile_id: identifierSchema.nullable(),
    invited_at_ms: timestampSchema.nullable(),
    had_confirmed_purchase_before_invite: z.boolean(),
    inviter_rewards_in_window: z.number().int().nonnegative(),
  })
  .strict()

/** Признаки, по которым считается риск. Общий телефон или устройство сами по себе не блокируют. */
export const demoRiskSignalsSchema = z
  .object({
    device_id: identifierSchema,
    household_id: identifierSchema.nullable(),
    account_age_days: z.number().int().nonnegative(),
    confirmed_purchase_days: z.number().int().nonnegative(),
  })
  .strict()

export const demoBudgetSnapshotSchema = z
  .object({
    coupon_fund_kopecks: kopecksSchema,
    coupon_settled_kopecks: kopecksSchema,
    coupon_reserved_kopecks: kopecksSchema,
    physical_fund_kopecks: kopecksSchema,
    physical_settled_kopecks: kopecksSchema,
    physical_reserved_kopecks: kopecksSchema,
  })
  .strict()

/**
 * Единый версионированный снимок: он же хранится в браузере, он же уходит в движок.
 * `synthetic` обязателен и всегда true — данные демонстрационные.
 */
export const demoProfileSnapshotSchema = z
  .object({
    snapshot_version: z.literal(DEMO_CONTRACT_VERSION),
    profile_id: identifierSchema,
    label: z.string().min(1),
    synthetic: z.literal(true),
    receipts: z.array(demoReceiptSchema),
    inventory: z.array(demoInventoryEntrySchema),
    issued_rewards: z.array(demoIssuedRewardSchema),
    processed_event_ids: z.array(identifierSchema),
    active_coupon: demoActiveCouponSchema.nullable(),
    outstanding_promise: demoOutstandingPromiseSchema.nullable(),
    progress: demoProgressSchema,
    referral: demoReferralSchema,
    risk_signals: demoRiskSignalsSchema,
  })
  .strict()

/** Стартовые синтетические профили и фонд, которые демонстрационный сервер отдаёт клиенту. */
export const demoSeedProfilesResponseSchema = z
  .object({
    contract_version: z.literal(DEMO_CONTRACT_VERSION),
    profiles: z.array(demoProfileSnapshotSchema).min(1),
    budget: demoBudgetSnapshotSchema,
  })
  .strict()

export const demoRequestEnvelopeSchema = z
  .object({
    contract_version: z.literal(DEMO_CONTRACT_VERSION),
    request_id: identifierSchema,
    now_ms: timestampSchema,
  })
  .strict()

export const demoDecisionRequestSchema = demoRequestEnvelopeSchema
  .extend({
    profile: demoProfileSnapshotSchema,
    game: demoGameSnapshotSchema,
    game_features: demoGameFeaturesSchema,
    budget: demoBudgetSnapshotSchema,
  })
  .strict()

export const demoChallengeTargetSchema = z
  .object({
    category: z.string().min(1),
    sku_ids: z.array(identifierSchema),
    quantity: z.number().int().positive(),
    paid_only: z.literal(true),
    window_days: z.number().int().positive().max(14),
    deadline_ms: timestampSchema,
  })
  .strict()

export const demoRewardPackageSchema = z
  .object({
    digital_item_id: identifierSchema,
    physical_sku: z
      .object({
        sku_id: identifierSchema,
        name: z.string().min(1),
        unit_cost_kopecks: kopecksSchema,
        stock_reserved: z.literal(true),
      })
      .strict()
      .nullable(),
  })
  .strict()

/** Полный максимум обязательства резервируется до показа обещания. */
export const demoReservationSchema = z
  .object({
    coupon_reserve_kopecks: kopecksSchema,
    physical_reserve_kopecks: kopecksSchema,
  })
  .strict()

export const demoEconomicsSchema = z
  .object({
    synthetic: z.literal(true),
    funding_source: z.enum(['advertiser', 'promo_fund', 'own_margin']),
    advertiser_id: identifierSchema.nullable(),
    campaign_id: identifierSchema.nullable(),
    bid_per_qualified_event_kopecks: kopecksSchema,
    subsidy_kopecks: kopecksSchema,
    uncovered_reward_cost_kopecks: kopecksSchema,
    expected_incremental_margin_kopecks: z.number().int().max(1_000_000_000),
  })
  .strict()

export const demoChallengeSchema = z
  .object({
    challenge_id: identifierSchema,
    challenge_version: z.number().int().positive(),
    title: z.string().min(1),
    recipe_goal_id: identifierSchema,
    target: demoChallengeTargetSchema,
    reward: demoRewardPackageSchema,
    reservation: demoReservationSchema,
    economics: demoEconomicsSchema,
  })
  .strict()

export const demoCardSchema = z
  .object({
    headline: z.string().min(1).max(60),
    body: z.string().min(1).max(220),
    reward_line: z.string().min(1).max(120),
    deadline_line: z.string().min(1).max(120),
    sponsor_line: z.string().min(1).max(120).nullable(),
    source: z.enum(['llm', 'fallback']),
    violations: z.array(reasonCodeSchema),
  })
  .strict()

export const demoCandidateTraceSchema = z
  .object({
    candidate_id: identifierSchema,
    item_id: identifierSchema,
    recipe_id: identifierSchema,
    category: z.string().min(1),
    rank: z.number().int().nonnegative(),
    score: z.number(),
    accepted: z.boolean(),
    reason_codes: z.array(reasonCodeSchema),
  })
  .strict()

export const demoDiagnosticsSchema = z
  .object({
    engine_version: z.string().min(1),
    policy_version: z.string().min(1),
    candidates: z.array(demoCandidateTraceSchema),
    coupon_available_kopecks: z.number().int(),
    physical_available_kopecks: z.number().int(),
    llm: z
      .object({
        source: z.enum(['llm', 'fallback']),
        model: z.string().min(1).nullable(),
        latency_ms: z.number().int().nonnegative().nullable(),
        error: z.string().min(1).nullable(),
      })
      .strict(),
  })
  .strict()

export const demoResponseEnvelopeSchema = z
  .object({
    contract_version: z.literal(DEMO_CONTRACT_VERSION),
    request_id: identifierSchema,
    server_time_ms: timestampSchema,
  })
  .strict()

export const demoDecisionResponseSchema = demoResponseEnvelopeSchema
  .extend({
    decision_id: z.string().regex(/^dec_[0-9a-z_]+$/),
    status: z.enum(['offer', 'no_action']),
    reason_codes: z.array(reasonCodeSchema).min(1),
    challenge: demoChallengeSchema.nullable(),
    card: demoCardSchema.nullable(),
    diagnostics: demoDiagnosticsSchema,
  })
  .strict()
  .refine(
    (value) => (value.status === 'offer') === (value.challenge !== null),
    { message: 'offer requires a challenge and no_action forbids one', path: ['challenge'] },
  )
  .refine(
    (value) => value.status !== 'offer' || value.card !== null,
    { message: 'offer requires a card', path: ['card'] },
  )

export const demoEventRequestSchema = demoRequestEnvelopeSchema
  .extend({
    idempotency_key: identifierSchema,
    profile: demoProfileSnapshotSchema,
    challenge: demoChallengeSchema,
    receipt: demoReceiptSchema,
  })
  .strict()

export const demoRiskDecisionSchema = z.enum(['allow', 'review', 'hold', 'reject'])

export const demoRiskAssessmentSchema = z
  .object({
    decision: demoRiskDecisionSchema,
    score: z.number().min(0).max(1),
    signals: z.array(reasonCodeSchema),
  })
  .strict()

export const demoGrantSchema = z
  .object({
    reward_id: identifierSchema,
    item_instance_id: identifierSchema,
    item_id: identifierSchema,
    sku_entitlement_id: identifierSchema.nullable(),
    sku_id: identifierSchema.nullable(),
  })
  .strict()

export const demoEventResponseSchema = demoResponseEnvelopeSchema
  .extend({
    event_id: identifierSchema,
    qualification: z.enum(['qualified', 'not_qualified', 'duplicate']),
    idempotent_replay: z.boolean(),
    risk: demoRiskAssessmentSchema,
    grant: demoGrantSchema.nullable(),
    reason_codes: z.array(reasonCodeSchema).min(1),
  })
  .strict()
  .refine(
    (value) => value.grant === null || value.qualification === 'qualified',
    { message: 'only a qualified event may carry a grant', path: ['grant'] },
  )
  .refine(
    (value) => value.grant === null || value.risk.decision === 'allow',
    { message: 'a held or rejected event may not carry a grant', path: ['grant'] },
  )

export const demoErrorResponseSchema = z
  .object({
    contract_version: z.literal(DEMO_CONTRACT_VERSION),
    request_id: identifierSchema,
    error: z
      .object({
        code: z.enum(['bad_request', 'engine_failed', 'engine_timeout', 'engine_invalid_output']),
        message: z.string().min(1).max(500),
      })
      .strict(),
  })
  .strict()

export type DemoItemRarity = z.infer<typeof demoItemRaritySchema>
export type DemoGameItem = z.infer<typeof demoGameItemSchema>
export type DemoGameRecipe = z.infer<typeof demoGameRecipeSchema>
export type DemoGameSnapshot = z.infer<typeof demoGameSnapshotSchema>
export type DemoGameFeatures = z.infer<typeof demoGameFeaturesSchema>
export type DemoRecipeProgress = z.infer<typeof demoRecipeProgressSchema>
export type DemoReceipt = z.infer<typeof demoReceiptSchema>
export type DemoReceiptLine = z.infer<typeof demoReceiptLineSchema>
export type DemoInventoryEntry = z.infer<typeof demoInventoryEntrySchema>
export type DemoIssuedReward = z.infer<typeof demoIssuedRewardSchema>
export type DemoActiveCoupon = z.infer<typeof demoActiveCouponSchema>
export type DemoOutstandingPromise = z.infer<typeof demoOutstandingPromiseSchema>
export type DemoProgress = z.infer<typeof demoProgressSchema>
export type DemoReferral = z.infer<typeof demoReferralSchema>
export type DemoRiskSignals = z.infer<typeof demoRiskSignalsSchema>
export type DemoBudgetSnapshot = z.infer<typeof demoBudgetSnapshotSchema>
export type DemoProfileSnapshot = z.infer<typeof demoProfileSnapshotSchema>
export type DemoSeedProfilesResponse = z.infer<typeof demoSeedProfilesResponseSchema>
export type DemoDecisionRequest = z.infer<typeof demoDecisionRequestSchema>
export type DemoChallenge = z.infer<typeof demoChallengeSchema>
export type DemoChallengeTarget = z.infer<typeof demoChallengeTargetSchema>
export type DemoRewardPackage = z.infer<typeof demoRewardPackageSchema>
export type DemoReservation = z.infer<typeof demoReservationSchema>
export type DemoEconomics = z.infer<typeof demoEconomicsSchema>
export type DemoCard = z.infer<typeof demoCardSchema>
export type DemoCandidateTrace = z.infer<typeof demoCandidateTraceSchema>
export type DemoDiagnostics = z.infer<typeof demoDiagnosticsSchema>
export type DemoDecisionResponse = z.infer<typeof demoDecisionResponseSchema>
export type DemoEventRequest = z.infer<typeof demoEventRequestSchema>
export type DemoRiskDecision = z.infer<typeof demoRiskDecisionSchema>
export type DemoRiskAssessment = z.infer<typeof demoRiskAssessmentSchema>
export type DemoGrant = z.infer<typeof demoGrantSchema>
export type DemoEventResponse = z.infer<typeof demoEventResponseSchema>
export type DemoErrorResponse = z.infer<typeof demoErrorResponseSchema>
