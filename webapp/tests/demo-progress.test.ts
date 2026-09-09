import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  demoGameSnapshotSchema,
  demoProfileSnapshotSchema,
  type DemoProfileSnapshot,
} from '@pyaterochka-game-demo/contracts'

import {
  buildDemoGameFeatures,
  buildDemoGameSnapshot,
  fromDemoInventory,
} from '../src/features/home/demo-game-snapshot'
import {
  avatarLevel,
  firstQualifyingPurchaseMs,
  closestRecipe,
  inviterReferralOutcome,
  rankFriendsByProgress,
  referralOutcome,
} from '../src/features/home/demo-progress'
import { buildDemoReceipt } from '../src/features/home/demo-receipt'

const examples = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../recsys/contract/examples',
)

function readExample(name: string): unknown {
  return JSON.parse(readFileSync(path.join(examples, name), 'utf8')) as unknown
}

const seeded = demoProfileSnapshotSchema.parse(readExample('profile-breakfast-seeded.json'))
const challenge = demoGameSnapshotSchema.parse(readExample('game-snapshot.json'))
const DAY_MS = 86_400_000
const NOW_MS = 1_788_598_800_000

const referralBase: DemoProfileSnapshot['referral'] = {
  invited_by_profile_id: 'inviter-1',
  invited_at_ms: NOW_MS - 2 * DAY_MS,
  had_confirmed_purchase_before_invite: false,
  inviter_rewards_in_window: 0,
}

describe('game snapshot for the engine', () => {
  test('matches the frozen reference', () => {
    expect(buildDemoGameSnapshot()).toEqual(challenge)
  })

  test('the seeded profile features show three "Good Morning" matches', () => {
    const features = buildDemoGameFeatures(fromDemoInventory(seeded.inventory))
    const breakfast = features.recipe_progress.find((progress) => progress.recipe_id === 'breakfast')
    expect(breakfast?.matched_count).toBe(3)
    expect(breakfast?.missing_item_ids).toContain('breakfast-pan')
    expect(features.inventory_total).toBe(3)
    expect(features.duplicate_item_ids).toEqual([])
  })
})

describe('avatar and ranking', () => {
  test('the level counts distinct recipes only and never exceeds seven', () => {
    expect(avatarLevel([])).toBe(0)
    expect(avatarLevel(['breakfast', 'breakfast'])).toBe(1)
    expect(avatarLevel(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])).toBe(7)
  })

  test('equal progress shares one rank, the technical ID only fixes the order', () => {
    const ranked = rankFriendsByProgress([
      { profile_id: 'b', alias: 'B', recipes_completed: 1, items_collected: 4 },
      { profile_id: 'a', alias: 'A', recipes_completed: 1, items_collected: 4 },
      { profile_id: 'c', alias: 'C', recipes_completed: 2, items_collected: 1 },
    ])
    expect(ranked.map((entry) => [entry.profile_id, entry.rank])).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 2],
    ])
  })

  test('money never enters the ranking: more items at equal sets means a higher rank', () => {
    const ranked = rankFriendsByProgress([
      { profile_id: 'a', alias: 'A', recipes_completed: 1, items_collected: 2 },
      { profile_id: 'b', alias: 'B', recipes_completed: 1, items_collected: 6 },
    ])
    expect(ranked.map((entry) => entry.profile_id)).toEqual(['b', 'a'])
  })
})

describe('referral calculation', () => {
  test('the first qualifying purchase inside the window gives one reward', () => {
    expect(referralOutcome(referralBase, 'invited-1', NOW_MS).eligible).toBe(true)
  })

  test('self-invitation is excluded', () => {
    const referral = { ...referralBase, invited_by_profile_id: 'invited-1' }
    expect(referralOutcome(referral, 'invited-1', NOW_MS).reason).toBe('referral_self_invite')
  })

  test('a signup without a qualifying purchase grants nothing', () => {
    expect(referralOutcome(referralBase, 'invited-1', null).reason)
      .toBe('referral_no_qualifying_purchase')
  })

  test('an existing customer is not a new member', () => {
    const referral = { ...referralBase, had_confirmed_purchase_before_invite: true }
    expect(referralOutcome(referral, 'invited-1', NOW_MS).reason).toBe('referral_existing_customer')
  })

  test('a purchase after seven days does not close the window', () => {
    const late = referralBase.invited_at_ms! + 8 * DAY_MS
    expect(referralOutcome(referralBase, 'invited-1', late).reason).toBe('referral_window_expired')
  })

  test('a second grant to the inviter inside one window is forbidden', () => {
    const referral = { ...referralBase, inviter_rewards_in_window: 1 }
    expect(referralOutcome(referral, 'invited-1', NOW_MS).reason).toBe('referral_cap_reached')
  })

  test('only an issued reward counts as qualifying', () => {
    expect(firstQualifyingPurchaseMs({ ...seeded, issued_rewards: [] })).toBeNull()
    expect(firstQualifyingPurchaseMs(seeded)).toBe(1_786_000_000_000)
  })
})

describe('test receipts', () => {
  const target = {
    challenge_id: 'chl_test',
    challenge_version: 1,
    title: 'Test',
    recipe_goal_id: 'breakfast',
    target: {
      category: 'Dairy',
      sku_ids: ['sku-milk-1l'],
      quantity: 1,
      paid_only: true as const,
      window_days: 7,
      deadline_ms: NOW_MS + 7 * DAY_MS,
    },
    reward: { digital_item_id: 'milk-pitcher', physical_sku: null },
    reservation: { coupon_reserve_kopecks: 250, physical_reserve_kopecks: 0 },
    economics: {
      synthetic: true as const,
      funding_source: 'own_margin' as const,
      advertiser_id: null,
      campaign_id: null,
      bid_per_qualified_event_kopecks: 0,
      subsidy_kopecks: 0,
      uncovered_reward_cost_kopecks: 250,
      expected_incremental_margin_kopecks: 4500,
    },
  }

  test('a qualifying receipt holds a paid line and a free line', () => {
    const receipt = buildDemoReceipt('qualifying', target, NOW_MS, 'rcp-1')
    expect(receipt.lines.filter((line) => line.paid)).toHaveLength(1)
    expect(receipt.lines.some((line) => !line.paid)).toBe(true)
  })

  test('a receipt with one free line holds no paid lines', () => {
    const receipt = buildDemoReceipt('free_line', target, NOW_MS, 'rcp-2')
    expect(receipt.lines.every((line) => !line.paid)).toBe(true)
  })

  test('a late receipt is issued after the challenge deadline', () => {
    const receipt = buildDemoReceipt('late', target, NOW_MS, 'rcp-3')
    expect(receipt.purchased_at_ms).toBeGreaterThan(target.target.deadline_ms)
  })

  test('a returned receipt is marked as returned', () => {
    expect(buildDemoReceipt('returned', target, NOW_MS, 'rcp-4').returned).toBe(true)
  })
})

describe('closest set', () => {
  const recipes = [
    { id: 'breakfast', title: 'Good Morning', itemIds: ['club-toaster', 'milk-pitcher', 'travel-mug', 'breakfast-pan'] },
    { id: 'fresh', title: 'Fresh Pick', itemIds: ['fruit-basket', 'vegetable-crate', 'power-blender', 'freshness-dome'] },
  ]

  test('picks the set with the most collected items', () => {
    const closest = closestRecipe(
      [{ item_id: 'club-toaster', quantity: 2 }, { item_id: 'milk-pitcher', quantity: 1 }, { item_id: 'fruit-basket', quantity: 1 }],
      recipes,
      4,
    )
    expect(closest).toEqual({ recipe_id: 'breakfast', title: 'Good Morning', owned: 2, required: 4 })
  })

  test('duplicates do not count as a second item of the set', () => {
    const closest = closestRecipe([{ item_id: 'club-toaster', quantity: 5 }], recipes, 4)
    expect(closest?.owned).toBe(1)
  })

  test('an empty collection has no closest set', () => {
    expect(closestRecipe([], recipes, 4)).toBeNull()
  })
})

describe('reward for the inviter', () => {
  // The screen shows the result to the inviter: we evaluate the invitee, not the profile itself.
  const invitee = (
    over: Partial<DemoProfileSnapshot['referral']>,
    issuedAtMs: number | null,
  ): DemoProfileSnapshot => ({
    ...seeded,
    profile_id: 'invitee',
    issued_rewards: issuedAtMs === null
      ? []
      : [{ reward_id: 'referral-demo', item_id: 'club-toaster', kind: 'digital_item', issued_at_ms: issuedAtMs }],
    referral: { ...referralBase, invited_by_profile_id: 'inviter', ...over },
  })

  const noInvites: DemoProfileSnapshot = {
    ...seeded,
    referral: { ...referralBase, invited_by_profile_id: null, invited_at_ms: null },
  }

  test('with no invited profiles no reward is due', () => {
    expect(inviterReferralOutcome([noInvites], 'inviter').reason).toBe('referral_not_invited')
  })

  test('an invitee without a purchase leaves the reward pending', () => {
    const outcome = inviterReferralOutcome([invitee({}, null)], 'inviter')
    expect(outcome.eligible).toBe(false)
    expect(outcome.reason).toBe('referral_no_qualifying_purchase')
  })

  test('a qualifying purchase by the invitee grants the reward to the inviter', () => {
    const outcome = inviterReferralOutcome([invitee({}, NOW_MS - DAY_MS)], 'inviter')
    expect(outcome.eligible).toBe(true)
    expect(outcome.reason).toBe('referral_reward_due')
  })

  test("someone else's invitee does not count", () => {
    expect(inviterReferralOutcome([invitee({ invited_by_profile_id: 'someone-else' }, NOW_MS - DAY_MS)], 'inviter').reason)
      .toBe('referral_not_invited')
  })
})
