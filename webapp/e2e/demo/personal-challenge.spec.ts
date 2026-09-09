import { expect, test } from '@playwright/test'

import {
  DEMO_PROFILES,
  closeStand,
  openStand,
  openTab,
  putItemIntoDiscountSlot,
  standLog,
  dismissLoginDay,
  switchProfile,
} from './stand'

const demoStateKey = 'pyaterochka_demo_challenge_state'

async function readActiveState(page: import('@playwright/test').Page) {
  return page.evaluate((key) => {
    const store = JSON.parse(window.localStorage.getItem(key) ?? '{}')
    return store.profiles[store.active_profile_id]
  }, demoStateKey)
}

async function openProfile(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Profile' }).click()
  await dismissLoginDay(page)
  await expect(page.getByRole('heading', { level: 2, name: 'Personal challenge' })).toBeVisible()
  await expect(page.getByText('One challenge based on your purchases. Complete it on an ordinary shopping trip.')).toHaveCount(0)
  await expect(page.getByText('We picked a special challenge based on your past purchases.')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  // One cleanup per context: a reload inside a test must preserve the demo state.
  await page.addInitScript((key) => {
    if (window.sessionStorage.getItem('demo-state-cleared') === 'true') return
    window.localStorage.removeItem(key)
    window.sessionStorage.setItem('demo-state-cleared', 'true')
  }, demoStateKey)
})

test('keeps the challenge preview unchanged when the engine is unavailable', async ({ page }) => {
  await page.route('**/api/demo/decision', async (route) => {
    await route.abort('failed')
  })
  await openProfile(page)

  await page.getByRole('button', { name: 'Show the challenge' }).click()

  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByText('A challenge is ready to show')).toBeVisible()
  await expect(page.getByText('We picked a special challenge based on your past purchases.')).toBeVisible()
})

test('the showcase profile opens with one challenge that finishes its set', async ({ page }) => {
  await openProfile(page)

  await page.getByRole('button', { name: 'Show the challenge' }).click()
  const card = page.getByRole('article', { name: 'Challenge card' })
  await expect(card).toBeVisible()
  await expect(card.locator('.demo-card-headline')).toHaveText('Good Morning: Travel Mug')
  await expect(card.locator('.demo-recipe-count')).toHaveText('3 of 4')
  await expect(card.locator('.demo-terms dd').first()).toHaveText('Coffee & Tea')
})

test('computes a challenge from purchase history and issues both rewards once', async ({ page }) => {
  await openProfile(page)
  await switchProfile(page, DEMO_PROFILES.empty)

  await page.getByRole('button', { name: 'Show the challenge' }).click()
  const card = page.getByRole('article', { name: 'Challenge card' })
  await expect(card).toBeVisible()
  await expect(card.locator('.demo-card-headline')).toHaveText('Good Morning: Milk Pitcher')

  await openStand(page)
  await page.getByRole('button', { name: 'Paid purchase from the required category' }).click()
  const reveal = page.getByRole('dialog', { name: 'Challenge reward' })
  await expect(reveal).toBeVisible()
  await expect(reveal.getByText('Plus a demonstration entitlement to one free product')).toBeVisible()
  await reveal.getByRole('button', { name: 'Collect' }).click()

  await expect(page.getByRole('status')).toContainText('Purchase counted')
  await closeStand(page)
  await openTab(page, 'Collection')
  // The challenge reward lands in the same inventory as a box item.
  await expect(page.getByRole('button', { name: 'Milk Pitcher, Common, 1 of 1 available' })).toBeVisible()
  await openTab(page, 'Challenges')

  const afterGrant = await readActiveState(page)
  expect(afterGrant.profile.issued_rewards).toHaveLength(1)
  expect(afterGrant.profile.outstanding_promise.fulfilled).toBe(true)
  expect(afterGrant.budget.coupon_settled_kopecks).toBe(0)
  // RUB 2.50 for the started box + RUB 2.50 for the issued challenge item.
  expect(afterGrant.budget.coupon_reserved_kopecks).toBe(500)

  await openStand(page)
  const repeatedRequest = page.waitForRequest((request) => request.url().endsWith('/api/demo/event'))
  await page.getByRole('button', { name: 'Send the same receipt again' }).click()
  const replayPayload = (await repeatedRequest).postDataJSON()
  expect(replayPayload.receipt).toEqual(afterGrant.last_receipt.receipt)
  expect(replayPayload.idempotency_key).toBe(`idem-${afterGrant.challenge.challenge_id}-${afterGrant.last_receipt.receipt.receipt_id}`)
  await expect(standLog(page)).toContainText('duplicate')
  await expect(page.getByRole('status')).toContainText('This receipt has already been counted')

  const afterReplay = await readActiveState(page)
  expect(afterReplay.profile.issued_rewards).toHaveLength(1)
  expect(afterReplay.profile.inventory).toEqual([{ item_id: 'milk-pitcher', quantity: 1 }])
})

test('keeps the issued item and the fulfilled promise after a reload', async ({ page }) => {
  await openProfile(page)
  await switchProfile(page, DEMO_PROFILES.empty)
  await page.getByRole('button', { name: 'Show the challenge' }).click()
  await openStand(page)
  await page.getByRole('button', { name: 'Paid purchase from the required category' }).click()
  await page.getByRole('dialog', { name: 'Challenge reward' }).getByRole('button', { name: 'Collect' }).click()

  await page.reload()
  await page.getByRole('button', { name: 'Profile' }).click()
  await dismissLoginDay(page)

  await expect(page.getByRole('article', { name: 'Challenge card' })).toBeVisible()
  await openTab(page, 'Collection')
  await expect(page.getByRole('button', { name: 'Milk Pitcher, Common, 1 of 1 available' })).toBeVisible()
})

test('switching synthetic profiles preserves their separate promises and inventory', async ({ page }) => {
  await openProfile(page)
  await switchProfile(page, DEMO_PROFILES.empty)
  await page.getByRole('button', { name: 'Show the challenge' }).click()
  await expect(page.getByRole('article', { name: 'Challenge card' })).toBeVisible()
  const original = await readActiveState(page)

  await switchProfile(page, DEMO_PROFILES.seeded)
  await openTab(page, 'Collection')
  await expect(page.getByRole('button', { name: 'Clubhouse Toaster, Common, 1 of 1 available' })).toBeVisible()

  await switchProfile(page, DEMO_PROFILES.empty)
  await openTab(page, 'Challenges')
  await expect(page.getByRole('article', { name: 'Challenge card' })).toBeVisible()
  const restored = await readActiveState(page)
  expect(restored.challenge).toEqual(original.challenge)
  expect(restored.profile.inventory).toEqual(original.profile.inventory)
})

test('a free line alone does not close the challenge', async ({ page }) => {
  await openProfile(page)
  await switchProfile(page, DEMO_PROFILES.empty)
  await page.getByRole('button', { name: 'Show the challenge' }).click()
  await openStand(page)
  await page.getByRole('button', { name: 'Free line only' }).click()

  await expect(standLog(page)).toContainText('not_qualified')
  await expect(page.getByRole('dialog', { name: 'Challenge reward' })).toHaveCount(0)
  await closeStand(page)
  await expect(page.getByRole('status')).toContainText('no paid purchase from the required category')
  await openTab(page, 'Collection')
  // The single inventory stayed empty: a receipt that did not count issued nothing.
  await expect(page.locator('.inventory-item')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Your collection is empty' })).toBeVisible()
})

test('a prepared profile receives a different challenge that completes its recipe', async ({ page }) => {
  await openProfile(page)
  await switchProfile(page, DEMO_PROFILES.seeded)
  await page.getByRole('button', { name: 'Show the challenge' }).click()

  const card = page.getByRole('article', { name: 'Challenge card' })
  await expect(card.locator('.demo-card-headline')).toHaveText('Good Morning: Breakfast Pan')
  await expect(card.locator('.demo-terms dd').first()).toHaveText('Eggs & Breakfast')
})

test('four personal items craft one coupon and raise the avatar once', async ({ page }) => {
  // Showcase profile: three items of the set plus a duplicate; the fourth comes from a challenge.
  await openProfile(page)
  await page.getByRole('button', { name: 'Show the challenge' }).click()
  await openStand(page)
  await page.getByRole('button', { name: 'Paid purchase from the required category' }).click()
  await page.getByRole('dialog', { name: 'Challenge reward' }).getByRole('button', { name: 'Collect' }).click()
  await closeStand(page)
  await openTab(page, 'Collection')

  const breakfastSet = ['Clubhouse Toaster', 'Milk Pitcher', 'Travel Mug', 'Breakfast Pan'] as const
  for (const [index, itemName] of breakfastSet.entries()) {
    await putItemIntoDiscountSlot(page, itemName, index + 1)
  }

  // A freed slot closes crafting again: a coupon costs exactly four items.
  await page.getByRole('button', { name: /^Milk Pitcher in slot 2/ }).click()
  await expect(page.getByRole('button', { name: 'Empty discount slot 2' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add 1 more' })).toBeDisabled()
  await putItemIntoDiscountSlot(page, 'Milk Pitcher', 2)

  await page.getByRole('button', { name: 'Create a 8% discount' }).click()
  const discountDialog = page.getByRole('dialog', { name: 'Crafted discount' })
  await expect(discountDialog).toBeVisible()
  await page.getByRole('button', { name: 'Close discount' }).click()

  // The active coupon is asserted by card structure, not copy: wording is edited separately.
  const activeCoupon = page.getByRole('region', { name: 'Active discount' })
  await expect(activeCoupon).toBeVisible()
  await expect(activeCoupon.locator('.demo-coupon-percent')).toHaveText('8%')
  await expect(page.locator('.profile-stat-level-value')).toHaveText('1 of 7')
  // While a coupon is active a second set cannot be crafted: the slots are hidden.
  await expect(page.getByRole('button', { name: 'Empty discount slot 1' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Redeem (demo)' }).click()
  await expect(activeCoupon).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Empty discount slot 1' })).toBeVisible()
  // The recipe counts once: redemption does not raise the level again.
  await expect(page.locator('.profile-stat-level-value')).toHaveText('1 of 7')
})
