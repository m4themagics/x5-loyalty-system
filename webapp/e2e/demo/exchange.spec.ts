import { expect, test } from '@playwright/test'

import { DEMO_PROFILES, openTab, switchProfile, dismissLoginDay } from './stand'

const storageKey = 'pyaterochka_demo_challenge_state'

async function start(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await dismissLoginDay(page)
  await switchProfile(page, DEMO_PROFILES.anya)
  await openTab(page, 'Collection')
}

async function openTrade(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Open item exchange' }).click()
  const trade = page.getByRole('dialog', { name: 'Item exchange' })
  await expect(trade).toBeVisible()
  return trade
}

async function prepareOffer(page: import('@playwright/test').Page) {
  const trade = await openTrade(page)
  await expect(trade.getByLabel('Exchange rules')).toHaveCount(0)
  await trade.getByRole('button', { name: 'Exchange information' }).click()
  await expect(trade.getByLabel('Exchange rules')).toBeVisible()
  await expect(trade.getByText('An offer lasts 24 hours.', { exact: false })).toBeVisible()
  await trade.getByRole('button', { name: 'Exchange information' }).click()
  await trade.getByRole('button', { name: 'Add your item to the trade' }).click()
  await expect(trade.getByRole('button', { name: 'Offer Clubhouse Toaster for trade' })).toBeVisible()
  await expect(trade.getByRole('button', { name: 'Offer Travel Mug for trade' })).toBeVisible()
  await trade.getByRole('button', { name: 'Offer Milk Pitcher for trade' }).click()
  await trade.getByRole('button', { name: 'Show the pairing QR code' }).click()
  await expect(trade.getByRole('img', { name: 'Exchange pairing QR code' })).toBeVisible()
  return trade
}

test('reserves both items, restores the offer and exchanges atomically', async ({ page }) => {
  await start(page)
  const social = await prepareOffer(page)
  const receiver = social.getByRole('combobox', { name: 'Who to offer the trade to' })
  await receiver.selectOption('demo-trade-boris')
  await expect(receiver).toHaveValue('demo-trade-boris')
  await social.getByRole('button', { name: 'Confirm the trade' }).click()
  await expect(social.getByText('Offer sent.', { exact: false })).toBeVisible()
  await social.getByRole('button', { name: 'Close the exchange' }).click()
  const reserved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey)
  expect(reserved.profiles['demo-trade-anya'].trade_reserved_items).toEqual([
    { item_id: 'milk-pitcher', quantity: 1 },
  ])

  await page.reload()
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await dismissLoginDay(page)
  await switchProfile(page, DEMO_PROFILES.boris)
  await openTab(page, 'Collection')
  const receiverTrade = await openTrade(page)
  await receiverTrade.getByRole('button', { name: 'Accept the trade' }).click()
  await expect(receiverTrade.getByText('Trade completed', { exact: true })).toBeVisible()
  await expect(receiverTrade.getByRole('button', { name: 'Accept the trade' })).toHaveCount(0)

  const swapped = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey)
  expect(swapped.store_version).toBe(3)
  expect(swapped.trades).toHaveLength(1)
  expect(swapped.trades[0].status).toBe('accepted')
  expect(swapped.profiles['demo-trade-anya'].trade_reserved_items).toEqual([])
  expect(swapped.profiles['demo-trade-boris'].profile.inventory.find((item: {item_id: string}) => item.item_id === 'milk-pitcher').quantity).toBe(1)
})

test('receiver can reject without transferring either reserved item', async ({ page }) => {
  await start(page)
  const social = await prepareOffer(page)
  await social.getByRole('combobox', { name: 'Who to offer the trade to' }).selectOption('demo-trade-boris')
  await social.getByRole('button', { name: 'Confirm the trade' }).click()
  await social.getByRole('button', { name: 'Close the exchange' }).click()
  await switchProfile(page, DEMO_PROFILES.boris)
  const receiverTrade = await openTrade(page)
  await receiverTrade.getByRole('button', { name: 'Decline the trade' }).click()
  await expect(receiverTrade.getByText('Trade declined', { exact: true })).toBeVisible()
  const snapshot = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey)
  expect(snapshot.profiles['demo-trade-anya'].profile.inventory.find((item: {item_id: string}) => item.item_id === 'milk-pitcher').quantity).toBe(2)
  expect(snapshot.profiles['demo-trade-boris'].profile.inventory.find((item: {item_id: string}) => item.item_id === 'breakfast-pan').quantity).toBe(2)
  expect(snapshot.profiles['demo-trade-anya'].trade_reserved_items).toEqual([])
  expect(snapshot.profiles['demo-trade-boris'].trade_reserved_items).toEqual([])
})
