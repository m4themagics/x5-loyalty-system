import { expect, test } from 'bun:test'
import { DEMO_COUPON_MAX_KOPECKS, DEMO_INSTANCE_RESERVE_KOPECKS } from '@pyaterochka-game-demo/contracts'
import { readFileSync } from 'node:fs'
import { addChestItem, applyCraft, applyRedemption, createDemoState, recordLoginVisit, releaseExpiredPromise, resolveDemoState, serializeDemoState } from '../src/features/home/demo-state'
import { craftDiscount } from '../src/features/home/profile-discount-crafting'

const profile = JSON.parse(readFileSync(new URL('../../recsys/contract/examples/profile-empty.json', import.meta.url), 'utf8'))
const budget = JSON.parse(readFileSync(new URL('../../recsys/contract/examples/budget.json', import.meta.url), 'utf8'))
const day = 86_400_000
const now = Date.parse('2026-09-07T12:00:00+03:00')
const fresh = () => createDemoState(structuredClone(profile), structuredClone(budget))

test('100 ₽ coupon is fully covered by four 25 ₽ item reserves', () => {
  expect(DEMO_COUPON_MAX_KOPECKS).toBe(10_000)
  expect(DEMO_INSTANCE_RESERVE_KOPECKS * 4).toBe(10_000)
})

test('three distinct Moscow days unlock one box, gaps and reload preserve progress', () => {
  const first = recordLoginVisit(fresh(), now)
  expect(first.login_box.days).toBe(1)
  expect(first.budget.coupon_reserved_kopecks).toBe(2500)
  expect(recordLoginVisit(first, now + 60_000)).toBe(first)
  expect(addChestItem(first, 'club-toaster', now)).toBe(first)
  const second = recordLoginVisit(resolveDemoState(serializeDemoState(first))!, now + 4 * day)
  const ready = recordLoginVisit(second, now + 7 * day)
  expect(ready.login_box.days).toBe(3)
  const claimed = addChestItem(ready, 'club-toaster', now + 7 * day)
  expect(claimed.profile.inventory).toEqual([{ item_id: 'club-toaster', quantity: 1 }])
  expect(claimed.budget.coupon_reserved_kopecks).toBe(2500)
  expect(addChestItem(claimed, 'club-toaster', now + 7 * day)).toBe(claimed)
  expect(recordLoginVisit(claimed, now + 7 * day)).toBe(claimed)
})

test('four boxes in a rolling 28-day window; earlier progress is not lost', () => {
  let state = fresh()
  for (let index = 0; index < 12; index++) {
    state = recordLoginVisit(state, now + index * day)
    if (index % 3 === 2) state = addChestItem(state, 'club-toaster', now + index * day)
  }
  expect(state.profile.inventory[0].quantity).toBe(4)
  expect(recordLoginVisit(state, now + 28 * day)).toBe(state)
  const resumed = recordLoginVisit(state, now + 30 * day)
  expect(resumed.login_box.days).toBe(1)
  expect(resumed.budget.coupon_reserved_kopecks).toBe(12_500)
})

test('no unfunded promise; already reserved box remains claimable without free budget', () => {
  const poor = fresh()
  poor.budget.coupon_fund_kopecks = 2499
  expect(recordLoginVisit(poor, now)).toBe(poor)
  poor.budget.coupon_fund_kopecks = 2500
  let state = recordLoginVisit(poor, now)
  state = recordLoginVisit(state, now + day)
  state = recordLoginVisit(state, now + 2 * day)
  expect(addChestItem(state, 'unknown', now + 2 * day)).toBe(state)
  expect(addChestItem(state, 'club-toaster', now + 2 * day).profile.inventory[0].quantity).toBe(1)
})

test('midnight in Moscow counts a new day, moving clock backwards never does', () => {
  const first = recordLoginVisit(fresh(), Date.parse('2026-09-07T23:59:00+03:00'))
  const second = recordLoginVisit(first, Date.parse('2026-09-08T00:01:00+03:00'))
  expect(second.login_box.days).toBe(2)
  expect(recordLoginVisit(second, now)).toBe(second)
})

test('migration preserves old coupon and tops up existing items once without inventing funds', () => {
  const old = fresh()
  old.profile.inventory = [{ item_id: 'club-toaster', quantity: 2 }]
  old.budget.coupon_reserved_kopecks = 1500
  old.profile.active_coupon = { coupon_id: 'old', recipe_id: null, percent: 8, max_kopecks: 1000, redeemed_kopecks: null, created_at_ms: now }
  const raw = JSON.parse(serializeDemoState(old))
  delete raw.login_box
  delete raw.item_reserve_kopecks
  const loaded = resolveDemoState(JSON.stringify(raw))!
  expect(loaded.profile.active_coupon?.max_kopecks).toBe(1000)
  expect(loaded.budget.coupon_reserved_kopecks).toBe(6000)
  expect(loaded.budget.coupon_fund_kopecks).toBe(budget.coupon_fund_kopecks)
  expect(resolveDemoState(serializeDemoState(loaded))).toEqual(loaded)
  expect(applyRedemption(loaded, 100_000, now).budget.coupon_settled_kopecks).toBe(1000)
  const event = JSON.parse(readFileSync(new URL('../../recsys/contract/examples/event-request-qualified.json', import.meta.url), 'utf8'))
  raw.profile.outstanding_promise = event.profile.outstanding_promise
  raw.challenge = event.challenge
  raw.challenge.reservation.coupon_reserve_kopecks = 250
  raw.budget.coupon_reserved_kopecks = 1750
  raw.budget.coupon_fund_kopecks = 4000
  const promised = resolveDemoState(JSON.stringify(raw))!
  expect(promised.budget.coupon_reserved_kopecks).toBe(8500)
  expect(recordLoginVisit(promised, now)).toBe(promised)
  expect(releaseExpiredPromise(promised, event.challenge.target.deadline_ms + 1).budget.coupon_reserved_kopecks).toBe(6000)

})

test('new coupon pays actual percent and never more than its own 100 ₽ maximum', () => {
  const ids = ['club-toaster', 'milk-pitcher', 'travel-mug', 'breakfast-pan']
  const state = createDemoState({ ...profile, inventory: ids.map(item_id => ({ item_id, quantity: 1 })) }, budget)
  const crafted = applyCraft(state, craftDiscount(ids, now), now)
  expect(applyRedemption(crafted, 50_000, now).budget.coupon_settled_kopecks).toBe(4000)
  expect(applyRedemption(crafted, 200_000, now).budget.coupon_settled_kopecks).toBe(10_000)
})
