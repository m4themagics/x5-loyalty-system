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
  rankParticipants,
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

describe('снимок игры для движка', () => {
  test('совпадает с зафиксированным эталоном', () => {
    expect(buildDemoGameSnapshot()).toEqual(challenge)
  })

  test('признаки подготовленного профиля показывают три совпадения «Доброго утра»', () => {
    const features = buildDemoGameFeatures(fromDemoInventory(seeded.inventory))
    const breakfast = features.recipe_progress.find((progress) => progress.recipe_id === 'breakfast')
    expect(breakfast?.matched_count).toBe(3)
    expect(breakfast?.missing_item_ids).toContain('breakfast-pan')
    expect(features.inventory_total).toBe(3)
    expect(features.duplicate_item_ids).toEqual([])
  })
})

describe('аватар и рейтинг', () => {
  test('уровень считает только различные рецепты и не превышает семь', () => {
    expect(avatarLevel([])).toBe(0)
    expect(avatarLevel(['breakfast', 'breakfast'])).toBe(1)
    expect(avatarLevel(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])).toBe(7)
  })

  test('равная экономия делит одно место, технический ID задаёт только порядок', () => {
    const ranked = rankParticipants([
      { profile_id: 'b', alias: 'Б', redeemed_savings_28d_kopecks: 1500 },
      { profile_id: 'a', alias: 'А', redeemed_savings_28d_kopecks: 1500 },
      { profile_id: 'c', alias: 'В', redeemed_savings_28d_kopecks: 3200 },
    ])
    expect(ranked.map((entry) => [entry.profile_id, entry.rank])).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 2],
    ])
  })
})

describe('реферальный расчёт', () => {
  test('первая подходящая покупка в окне даёт одну награду', () => {
    expect(referralOutcome(referralBase, 'invited-1', NOW_MS).eligible).toBe(true)
  })

  test('самоприглашение исключено', () => {
    const referral = { ...referralBase, invited_by_profile_id: 'invited-1' }
    expect(referralOutcome(referral, 'invited-1', NOW_MS).reason).toBe('referral_self_invite')
  })

  test('регистрация без квалифицирующей покупки не начисляет', () => {
    expect(referralOutcome(referralBase, 'invited-1', null).reason)
      .toBe('referral_no_qualifying_purchase')
  })

  test('прежний покупатель не является новым участником', () => {
    const referral = { ...referralBase, had_confirmed_purchase_before_invite: true }
    expect(referralOutcome(referral, 'invited-1', NOW_MS).reason).toBe('referral_existing_customer')
  })

  test('покупка после семи дней не закрывает окно', () => {
    const late = referralBase.invited_at_ms! + 8 * DAY_MS
    expect(referralOutcome(referralBase, 'invited-1', late).reason).toBe('referral_window_expired')
  })

  test('повторное начисление пригласившему за окно запрещено', () => {
    const referral = { ...referralBase, inviter_rewards_in_window: 1 }
    expect(referralOutcome(referral, 'invited-1', NOW_MS).reason).toBe('referral_cap_reached')
  })

  test('квалифицирующей считается только выданная награда', () => {
    expect(firstQualifyingPurchaseMs(seeded)).toBeNull()
  })
})

describe('тестовые чеки', () => {
  const target = {
    challenge_id: 'chl_test',
    challenge_version: 1,
    title: 'Тест',
    recipe_goal_id: 'breakfast',
    target: {
      category: 'Молочные продукты',
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

  test('подходящий чек содержит оплаченную и бесплатную строку', () => {
    const receipt = buildDemoReceipt('qualifying', target, NOW_MS, 'rcp-1')
    expect(receipt.lines.filter((line) => line.paid)).toHaveLength(1)
    expect(receipt.lines.some((line) => !line.paid)).toBe(true)
  })

  test('чек с одной бесплатной строкой не содержит оплаченных', () => {
    const receipt = buildDemoReceipt('free_line', target, NOW_MS, 'rcp-2')
    expect(receipt.lines.every((line) => !line.paid)).toBe(true)
  })

  test('поздний чек оформлен после срока задания', () => {
    const receipt = buildDemoReceipt('late', target, NOW_MS, 'rcp-3')
    expect(receipt.purchased_at_ms).toBeGreaterThan(target.target.deadline_ms)
  })

  test('чек с возвратом помечен возвратом', () => {
    expect(buildDemoReceipt('returned', target, NOW_MS, 'rcp-4').returned).toBe(true)
  })
})
