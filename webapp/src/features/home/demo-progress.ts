import {
  DEMO_AVATAR_MAX_LEVEL,
  DEMO_RANKING_WINDOW_DAYS,
  type DemoProfileSnapshot,
  type DemoReferral,
} from '@pyaterochka-game-demo/contracts'

/**
 * Аватар, добровольный рейтинг и реферальный расчёт на явно синтетических событиях.
 *
 * Уровень аватара — число различных завершённых рецептов, а не сумма чека. Рейтинг показывает
 * подтверждённую погашенную экономию, место не увеличивает награду. Повтор не накручивает ни то,
 * ни другое.
 */

export const DEMO_REFERRAL_WINDOW_DAYS = 7
export const DEMO_REFERRAL_REWARDS_PER_WINDOW = 1

const DAY_MS = 86_400_000

export type RankingParticipant = {
  profile_id: string
  alias: string
  redeemed_savings_28d_kopecks: number
}

export type RankingEntry = RankingParticipant & { rank: number }

export type ReferralOutcome = {
  eligible: boolean
  reason:
    | 'referral_reward_due'
    | 'referral_not_invited'
    | 'referral_self_invite'
    | 'referral_existing_customer'
    | 'referral_no_qualifying_purchase'
    | 'referral_window_expired'
    | 'referral_cap_reached'
}

export function avatarLevel(completedRecipeIds: readonly string[]): number {
  return Math.min(new Set(completedRecipeIds).size, DEMO_AVATAR_MAX_LEVEL)
}

export function redeemedSavingsRubles(profile: DemoProfileSnapshot): number {
  return profile.progress.redeemed_savings_28d_kopecks / 100
}

export const rankingWindowDays = DEMO_RANKING_WINDOW_DAYS

/**
 * Псевдонимный рейтинг: одинаковая экономия — одинаковое место, технический ID задаёт только
 * порядок вывода и не даёт преимущества.
 */
export function rankParticipants(participants: readonly RankingParticipant[]): RankingEntry[] {
  const ordered = [...participants].sort((left, right) =>
    right.redeemed_savings_28d_kopecks - left.redeemed_savings_28d_kopecks
    || left.profile_id.localeCompare(right.profile_id))

  let lastSavings: number | null = null
  let lastRank = 0

  return ordered.map((participant, index) => {
    if (participant.redeemed_savings_28d_kopecks !== lastSavings) {
      lastRank = index + 1
      lastSavings = participant.redeemed_savings_28d_kopecks
    }
    return { ...participant, rank: lastRank }
  })
}

/**
 * Демонстрационные условия реферала: у приглашённого нет прежних подтверждённых покупок,
 * первая подходящая покупка совершена в течение семи дней после приглашения, и пригласивший
 * получает не больше одной награды за окно. Самоприглашение исключено.
 */
export function referralOutcome(
  referral: DemoReferral,
  profileId: string,
  firstQualifyingPurchaseMs: number | null,
): ReferralOutcome {
  if (referral.invited_by_profile_id === null || referral.invited_at_ms === null) {
    return { eligible: false, reason: 'referral_not_invited' }
  }
  if (referral.invited_by_profile_id === profileId) {
    return { eligible: false, reason: 'referral_self_invite' }
  }
  if (referral.had_confirmed_purchase_before_invite) {
    return { eligible: false, reason: 'referral_existing_customer' }
  }
  if (firstQualifyingPurchaseMs === null) {
    return { eligible: false, reason: 'referral_no_qualifying_purchase' }
  }
  if (firstQualifyingPurchaseMs < referral.invited_at_ms) {
    return { eligible: false, reason: 'referral_no_qualifying_purchase' }
  }
  if (firstQualifyingPurchaseMs > referral.invited_at_ms + DEMO_REFERRAL_WINDOW_DAYS * DAY_MS) {
    return { eligible: false, reason: 'referral_window_expired' }
  }
  if (referral.inviter_rewards_in_window >= DEMO_REFERRAL_REWARDS_PER_WINDOW) {
    return { eligible: false, reason: 'referral_cap_reached' }
  }
  return { eligible: true, reason: 'referral_reward_due' }
}

/** Первая покупка, закрывшая обещание: только выданные награды, а не любой чек. */
export function firstQualifyingPurchaseMs(profile: DemoProfileSnapshot): number | null {
  const issued = profile.issued_rewards.map((reward) => reward.issued_at_ms)
  return issued.length === 0 ? null : Math.min(...issued)
}
