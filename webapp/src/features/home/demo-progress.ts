import {
  DEMO_AVATAR_MAX_LEVEL,
  DEMO_RANKING_WINDOW_DAYS,
  type DemoProfileSnapshot,
  type DemoReferral,
} from '@pyaterochka-game-demo/contracts'

/**
 * Avatar, opt-in ranking and referral calculation over explicitly synthetic events.
 *
 * Avatar level is the number of distinct completed recipes, not the receipt total. The ranking
 * shows confirmed redeemed savings, and rank never increases a reward. Repetition inflates
 * neither of them.
 */

export const DEMO_REFERRAL_WINDOW_DAYS = 7
export const DEMO_REFERRAL_REWARDS_PER_WINDOW = 1

const DAY_MS = 86_400_000

export type FriendProgress = {
  profile_id: string
  alias: string
  recipes_completed: number
  items_collected: number
}

export type FriendRank = FriendProgress & { rank: number }

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
 * Friend ranking: it compares collected sets, not money spent or saved.
 * Equal progress shares one rank; the technical ID only fixes the output order.
 */
export function rankFriendsByProgress(friends: readonly FriendProgress[]): FriendRank[] {
  const ordered = [...friends].sort((left, right) =>
    right.recipes_completed - left.recipes_completed
    || right.items_collected - left.items_collected
    || left.profile_id.localeCompare(right.profile_id))

  let lastKey: string | null = null
  let lastRank = 0

  return ordered.map((friend, index) => {
    const key = `${friend.recipes_completed}:${friend.items_collected}`
    if (key !== lastKey) {
      lastRank = index + 1
      lastKey = key
    }
    return { ...friend, rank: lastRank }
  })
}

/**
 * Demo referral terms: the invitee has no prior confirmed purchases, the first qualifying
 * purchase happens within seven days of the invitation, and the inviter receives at most one
 * reward per window. Self-invitation is excluded.
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

/**
 * The reward goes to the inviter. The referral record lives on the invitee while the screen
 * speaks to the inviter, so we look up their invitee and evaluate that profile.
 */
export function inviterReferralOutcome(
  profiles: readonly DemoProfileSnapshot[],
  inviterProfileId: string,
): ReferralOutcome {
  const invitee = profiles.find(
    (profile) => profile.referral.invited_by_profile_id === inviterProfileId,
  )
  if (invitee === undefined) return { eligible: false, reason: 'referral_not_invited' }
  return referralOutcome(invitee.referral, invitee.profile_id, firstQualifyingPurchaseMs(invitee))
}

/** The first purchase that closed a promise: issued rewards only, not any receipt. */
export function firstQualifyingPurchaseMs(profile: DemoProfileSnapshot): number | null {
  const issued = profile.issued_rewards.map((reward) => reward.issued_at_ms)
  return issued.length === 0 ? null : Math.min(...issued)
}

/** The set closest to completion: how many distinct recipe items are already collected. */
export type ClosestRecipe = {
  recipe_id: string
  title: string
  owned: number
  required: number
}

export function closestRecipe(
  inventory: readonly { item_id: string; quantity: number }[],
  recipes: readonly { id: string; title: string; itemIds: readonly string[] }[],
  craftSize: number,
): ClosestRecipe | null {
  const owned = new Set(inventory.filter((entry) => entry.quantity > 0).map((entry) => entry.item_id))
  if (owned.size === 0) return null

  let best: ClosestRecipe | null = null
  for (const recipe of recipes) {
    const matched = Math.min(craftSize, recipe.itemIds.filter((itemId) => owned.has(itemId)).length)
    if (matched === 0) continue
    if (best === null || matched > best.owned || (matched === best.owned && recipe.title < best.title)) {
      best = { recipe_id: recipe.id, title: recipe.title, owned: matched, required: craftSize }
    }
  }
  return best
}
