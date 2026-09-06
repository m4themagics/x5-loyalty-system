import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { demoAdsStateSchema, demoBudgetSnapshotSchema, demoDecisionResponseSchema, demoEventResponseSchema, demoProfileSnapshotSchema } from '@pyaterochka-game-demo/contracts'
import { applyDecision, applyEvent, createDemoState, serializeDemoState } from '../src/features/home/demo-state'
import { applyDemoDecision, applyDemoEvent, applyReferralReward, createDemoStore, releaseExpiredDemoPromises, resetDemoStore, resolveDemoStore, saveDemoProfile, selectDemoProfile, serializeDemoStore } from '../src/features/home/demo-store'
import { addDemoSelection, removeDemoSelection } from '../src/features/home/demo-selection'
import { buildDemoReceipt } from '../src/features/home/demo-receipt'

const example = (file: string) => JSON.parse(readFileSync(new URL(`../../recsys/contract/examples/${file}`, import.meta.url), 'utf8'))
const profile = demoProfileSnapshotSchema.parse(example('profile-empty.json'))
const prepared = demoProfileSnapshotSchema.parse(example('profile-breakfast-seeded.json'))
const budget = demoBudgetSnapshotSchema.parse(example('budget.json'))
const ads = demoAdsStateSchema.parse(example('ads.json'))
const nowMs = 1_788_598_800_000

function referralScenario() {
  const invitee = { ...profile, receipts: [], referral: {
    invited_by_profile_id: prepared.profile_id,
    invited_at_ms: nowMs - 86_400_000,
    had_confirmed_purchase_before_invite: false,
    inviter_rewards_in_window: 0,
  } }
  let state = createDemoState(invitee, budget)
  const offer = demoDecisionResponseSchema.parse(example('decision-response-offer.json'))
  const event = demoEventResponseSchema.parse(example('event-response-granted.json'))
  state = applyDecision(state, offer, state.revision, nowMs)
  const receipt = buildDemoReceipt('qualifying', state.challenge!, nowMs, 'referral-receipt')
  state = applyEvent(state, event, receipt, state.revision, nowMs)
  let store = createDemoStore(createDemoState(prepared, budget))
  store = saveDemoProfile(store, state)
  return { store, event, receipt }
}

describe('сохранение персональных сценариев', () => {
  test('переключение и reload сохраняют инвентарь каждого профиля', () => {
    const first = createDemoState(profile, budget)
    let store = createDemoStore(first)
    store = saveDemoProfile(store, { ...first, revision: 3, profile: { ...profile, inventory: [{ item_id: 'milk-pitcher', quantity: 2 }] } })
    store = selectDemoProfile(store, prepared, budget)
    store = resolveDemoStore(serializeDemoStore(store))!
    store = selectDemoProfile(store, profile, budget)
    expect(store.profiles[profile.profile_id].profile.inventory).toEqual([{ item_id: 'milk-pitcher', quantity: 2 }])
    expect(store.profiles[profile.profile_id].revision).toBe(3)
    expect(store.profiles[prepared.profile_id].profile.inventory).toHaveLength(3)
  })

  test('снимок прежнего формата переносится без потери профиля', () => {
    const state = createDemoState(prepared, budget)
    const restored = resolveDemoStore(serializeDemoState(state))!
    expect(restored.active_profile_id).toBe(prepared.profile_id)
    expect(restored.profiles[prepared.profile_id]).toEqual(state)
  })
})

describe('живой Ads-журнал', () => {
  test('атомарно резервирует показ и один раз списывает first-price CPA', () => {
    const offer = demoDecisionResponseSchema.parse(example('decision-response-offer.json'))
    const event = demoEventResponseSchema.parse(example('event-response-granted.json'))
    let store = createDemoStore(createDemoState(profile, budget), ads)
    const initialCampaign = store.ads.campaigns.find((entry) => entry.campaign_id === 'camp_058')!

    store = applyDemoDecision(store, profile.profile_id, offer, 1, nowMs)
    expect(store.ads.exposures).toHaveLength(1)
    expect(store.ads.exposures[0]).toMatchObject({ decision_id: offer.decision_id, status: 'reserved', reserved_kopecks: 4300 })
    expect(store.ads.campaigns.find((entry) => entry.campaign_id === 'camp_058')?.reserved_kopecks).toBe(4300)

    const state = store.profiles[profile.profile_id]
    const receipt = buildDemoReceipt('qualifying', state.challenge!, nowMs, 'rcp-ledger-test')
    store = applyDemoEvent(store, profile.profile_id, event, receipt, state.revision, nowMs)
    const settled = store.ads.campaigns.find((entry) => entry.campaign_id === 'camp_058')!
    expect(store.ads.billings).toHaveLength(1)
    expect(settled.remaining_budget_kopecks).toBe(initialCampaign.remaining_budget_kopecks - 4300)
    expect(settled.reserved_kopecks).toBe(0)
    expect(settled.settled_kopecks).toBe(4300)
    expect(store.ads.exposures[0]?.status).toBe('billed')

    const reset = resetDemoStore([profile, prepared], budget, ads)
    expect(reset.active_profile_id).toBe(profile.profile_id)
    expect(reset.profiles[profile.profile_id].profile.issued_rewards).toEqual([])
    expect(reset.profiles[prepared.profile_id].profile.inventory).toHaveLength(3)
    expect(reset.ads).toEqual(ads)
    expect(reset.trades).toEqual([])
    expect(reset.referral_awards).toEqual([])
  })

  test('отклоняет подмену billing, его пропуск и необеспеченное списание', () => {
    const offer = demoDecisionResponseSchema.parse(example('decision-response-offer.json'))
    const event = demoEventResponseSchema.parse(example('event-response-granted.json'))
    let store = createDemoStore(createDemoState(profile, budget), ads)
    store = applyDemoDecision(store, profile.profile_id, offer, 1, nowMs)
    const before = store
    const state = store.profiles[profile.profile_id]
    const receipt = buildDemoReceipt('qualifying', state.challenge!, nowMs, 'rcp-forged-billing')
    const forged = { ...event, billing: { ...event.billing!, amount_kopecks: event.billing!.amount_kopecks + 1 } }
    expect(applyDemoEvent(store, profile.profile_id, forged, receipt, state.revision, nowMs)).toBe(before)
    expect(applyDemoEvent(store, profile.profile_id, { ...event, billing: null }, receipt, state.revision, nowMs)).toBe(before)

    const duplicateBilling = {
      ...store,
      ads: { ...store.ads, billings: [event.billing!] },
    }
    expect(applyDemoEvent(duplicateBilling, profile.profile_id, event, receipt, state.revision, nowMs)).toBe(duplicateBilling)

    const depleted = {
      ...store,
      ads: {
        ...store.ads,
        campaigns: store.ads.campaigns.map((campaign) => campaign.campaign_id === 'camp_058'
          ? { ...campaign, remaining_budget_kopecks: 4_299 }
          : campaign),
      },
    }
    expect(applyDemoEvent(depleted, profile.profile_id, event, receipt, state.revision, nowMs)).toBe(depleted)
  })

  test('освобождает истёкшие Ads-резервы всех профилей', () => {
    const offer = demoDecisionResponseSchema.parse(example('decision-response-offer.json'))
    let store = createDemoStore(createDemoState(profile, budget), ads)
    store = applyDemoDecision(store, profile.profile_id, offer, 1, nowMs)
    store = selectDemoProfile(store, prepared, budget)

    store = releaseExpiredDemoPromises(store, offer.challenge!.target.deadline_ms + 1)
    expect(store.ads.exposures[0]?.status).toBe('released')
    expect(store.ads.campaigns.find((entry) => entry.campaign_id === 'camp_058')?.reserved_kopecks).toBe(0)
    expect(store.active_profile_id).toBe(prepared.profile_id)
  })
})

describe('реферальное начисление', () => {
  test('передаёт обычный предмет пригласившему один раз и резервирует 250 копеек', () => {
    const { store, event, receipt } = referralScenario()
    const before = store.profiles[prepared.profile_id]
    const first = applyReferralReward(store, profile.profile_id, event, receipt, nowMs)
    expect(first.reason).toBe('referral_reward_issued')
    expect(first.store.referral_awards).toHaveLength(1)
    expect(first.store.profiles[prepared.profile_id].profile.inventory.find((entry) => entry.item_id === 'club-toaster')?.quantity).toBe(2)
    expect(first.store.profiles[prepared.profile_id].budget.coupon_reserved_kopecks - before.budget.coupon_reserved_kopecks).toBe(250)
    expect(first.store.profiles[profile.profile_id].profile.referral.inviter_rewards_in_window).toBe(1)
    const replay = applyReferralReward(first.store, profile.profile_id, event, receipt, nowMs + 1)
    expect(replay.reason).toBe('referral_already_issued')
    expect(replay.store).toBe(first.store)
  })

  test('не создаёт право при недостатке денег или удержанном событии', () => {
    const { store, event, receipt } = referralScenario()
    const inviter = store.profiles[prepared.profile_id]
    inviter.budget = { ...inviter.budget, coupon_fund_kopecks: inviter.budget.coupon_reserved_kopecks + inviter.budget.coupon_settled_kopecks }
    expect(applyReferralReward(store, profile.profile_id, event, receipt, nowMs).reason).toBe('referral_budget_insufficient')
    const held = { ...event, grant: null, risk: { ...event.risk, decision: 'hold' as const } }
    expect(applyReferralReward(store, profile.profile_id, held, receipt, nowMs).store.referral_awards).toHaveLength(0)
  })
})

describe('выбор копий для крафта', () => {
  const inventory = [{ item_id: 'milk-pitcher', quantity: 2 }, { item_id: 'travel-mug', quantity: 3 }]

  test('можно снять единственную выбранную копию и добавить две одинаковых', () => {
    let selected = addDemoSelection([], inventory, 'milk-pitcher')
    expect(removeDemoSelection(selected, 'milk-pitcher')).toEqual([])
    selected = addDemoSelection(selected, inventory, 'milk-pitcher')
    expect(selected).toEqual(['milk-pitcher', 'milk-pitcher'])
    expect(addDemoSelection(selected, inventory, 'milk-pitcher')).toEqual(selected)
    expect(removeDemoSelection(selected, 'milk-pitcher')).toEqual(['milk-pitcher'])
  })

  test('нельзя выбрать неизвестный предмет или пятую копию', () => {
    const selected = ['milk-pitcher', 'milk-pitcher', 'travel-mug', 'travel-mug']
    expect(addDemoSelection(selected, inventory, 'travel-mug')).toEqual(selected)
    expect(addDemoSelection([], inventory, 'unknown')).toEqual([])
  })
})
