import { expect, test } from 'bun:test'
import { DEMO_COUPON_MAX_KOPECKS, DEMO_INSTANCE_RESERVE_KOPECKS } from '@pyaterochka-game-demo/contracts'
import { readFileSync } from 'node:fs'
import { addChestItem, applyCraft, applyRedemption, createDemoState, loginGreetingFor, recordLoginVisit, resolveDemoState, serializeDemoState } from '../src/features/home/demo-state'
import { craftDiscount } from '../src/features/home/profile-discount-crafting'

const profile = JSON.parse(readFileSync(new URL('../../recsys/contract/examples/profile-empty.json', import.meta.url), 'utf8'))
const budget = JSON.parse(readFileSync(new URL('../../recsys/contract/examples/budget.json', import.meta.url), 'utf8'))
const day = 86_400_000
const now = Date.parse('2026-09-07T12:00:00+03:00')
const fresh = () => createDemoState(structuredClone(profile), structuredClone(budget))

test('10 RUB coupon is fully covered by four 2.50 RUB item reserves', () => {
  expect(DEMO_COUPON_MAX_KOPECKS).toBe(1_000)
  expect(DEMO_INSTANCE_RESERVE_KOPECKS * 4).toBe(1_000)
})

test('the demo chest opens without collecting login days and reserves each instance', () => {
  const first = recordLoginVisit(fresh(), now)
  expect(first.login_box.days).toBe(1)
  expect(first.budget.coupon_reserved_kopecks).toBe(250)

  // The first item takes the reserve already held by the shown counter.
  const claimed = addChestItem(first, 'club-toaster', now)
  expect(claimed.profile.inventory).toEqual([{ item_id: 'club-toaster', quantity: 1 }])
  expect(claimed.budget.coupon_reserved_kopecks).toBe(250)

  // After that the box waits for no new days: every next item holds its own RUB 2.50.
  const second = addChestItem(claimed, 'milk-pitcher', now)
  expect(second.budget.coupon_reserved_kopecks).toBe(500)
  const third = addChestItem(second, 'travel-mug', now)
  expect(third.profile.inventory).toHaveLength(3)
  expect(third.budget.coupon_reserved_kopecks).toBe(750)

  expect(addChestItem(third, 'unknown-item', now)).toBe(third)
})

test('the chest stops when the coupon fund can no longer cover a reserve', () => {
  const poor = fresh()
  poor.budget.coupon_fund_kopecks = 500
  const first = addChestItem(poor, 'club-toaster', now)
  expect(first.budget.coupon_reserved_kopecks).toBe(250)
  const second = addChestItem(first, 'milk-pitcher', now)
  expect(second.budget.coupon_reserved_kopecks).toBe(500)
  // There is no free money left — issuing stops instead of going negative.
  expect(addChestItem(second, 'travel-mug', now)).toBe(second)
})

test('no unfunded promise; already reserved box remains claimable without free budget', () => {
  const poor = fresh()
  poor.budget.coupon_fund_kopecks = 249
  expect(recordLoginVisit(poor, now)).toBe(poor)
  poor.budget.coupon_fund_kopecks = 250
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

test('a snapshot saved before the login box still resolves and keeps its reserves', () => {
  const old = fresh()
  old.profile.inventory = [{ item_id: 'club-toaster', quantity: 2 }]
  old.budget.coupon_reserved_kopecks = 500
  old.profile.active_coupon = { coupon_id: 'old', recipe_id: null, percent: 8, max_kopecks: 1000, redeemed_kopecks: null, created_at_ms: now }
  const raw = JSON.parse(serializeDemoState(old))
  delete raw.login_box
  delete raw.item_reserve_kopecks
  const loaded = resolveDemoState(JSON.stringify(raw))!
  expect(loaded.login_box).toEqual({ days: 0, last_day: null, claimed_days: [], reserved: false })
  expect(loaded.profile.active_coupon?.max_kopecks).toBe(1000)
  expect(loaded.budget.coupon_reserved_kopecks).toBe(500)
  expect(loaded.budget.coupon_fund_kopecks).toBe(budget.coupon_fund_kopecks)
  expect(resolveDemoState(serializeDemoState(loaded))).toEqual(loaded)
  expect(applyRedemption(loaded, 100_000, now).budget.coupon_settled_kopecks).toBe(1000)
})

test('a crafted coupon never pays more than its own maximum', () => {
  const ids = ['club-toaster', 'milk-pitcher', 'travel-mug', 'breakfast-pan']
  const state = createDemoState({ ...profile, inventory: ids.map(item_id => ({ item_id, quantity: 1 })) }, budget)
  const crafted = applyCraft(state, craftDiscount(ids, now), now)
  expect(applyRedemption(crafted, 200_000, now).budget.coupon_settled_kopecks).toBe(1_000)
})

test('the login window opens only on a newly counted day', () => {
  const start = fresh()
  const first = recordLoginVisit(start, now)
  expect(loginGreetingFor(start, first)).toEqual({ days: 1, ready: false })
  expect(loginGreetingFor(first, recordLoginVisit(first, now + 60_000))).toBeNull()
  expect(loginGreetingFor(first, addChestItem(first, 'club-toaster', now))).toBeNull()
  const second = recordLoginVisit(first, now + day)
  const third = recordLoginVisit(second, now + 2 * day)
  expect(loginGreetingFor(second, third)).toEqual({ days: 3, ready: true })
  const claimed = addChestItem(third, 'club-toaster', now + 2 * day)
  expect(loginGreetingFor(third, claimed)).toBeNull()
  expect(loginGreetingFor(claimed, recordLoginVisit(claimed, now + 3 * day))).toEqual({ days: 1, ready: false })
})
