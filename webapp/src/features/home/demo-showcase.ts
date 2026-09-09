import type { DemoProfileSnapshot } from '@pyaterochka-game-demo/contracts'

/**
 * The single showcase profile that opens by default. It is built so the whole product path is
 * visible without switching: three items of the "Good Morning" set are already collected, the
 * missing "Travel Mug" sits in a category with an active campaign and in the purchase history,
 * so a challenge is found immediately, and a spare "Clubhouse Toaster" opens duplicate trading.
 *
 * The profile stays demonstrational: it is built from a synthetic engine seed profile, not from
 * real purchase history.
 */
export const DEMO_SHOWCASE_PROFILE_ID = 'demo-showcase'

export const DEMO_SHOWCASE_INVENTORY = [
  { item_id: 'club-toaster', quantity: 2 },
  { item_id: 'milk-pitcher', quantity: 1 },
  { item_id: 'breakfast-pan', quantity: 1 },
] as const

export function createShowcaseProfile(template: DemoProfileSnapshot): DemoProfileSnapshot {
  return {
    ...template,
    profile_id: DEMO_SHOWCASE_PROFILE_ID,
    label: 'Showcase profile: three items of a set and a duplicate to trade',
    inventory: DEMO_SHOWCASE_INVENTORY.map((entry) => ({ ...entry })),
    issued_rewards: [],
    processed_event_ids: [],
    active_coupon: null,
    outstanding_promise: null,
  }
}
