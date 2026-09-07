import { expect, test } from '@playwright/test'

import { DEMO_PROFILES, openTab, switchProfile, dismissLoginDay } from './stand'

const storageKey = 'pyaterochka_demo_challenge_state'

async function start(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  await dismissLoginDay(page)
  await switchProfile(page, DEMO_PROFILES.anya)
  await openTab(page, 'Коллекция')
}

async function openTrade(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Открыть обмен предметами' }).click()
  const trade = page.getByRole('dialog', { name: 'Обмен предметами' })
  await expect(trade).toBeVisible()
  return trade
}

async function prepareOffer(page: import('@playwright/test').Page) {
  const trade = await openTrade(page)
  await expect(trade.getByLabel('Правила обмена')).toHaveCount(0)
  await trade.getByRole('button', { name: 'Информация об обмене' }).click()
  await expect(trade.getByLabel('Правила обмена')).toBeVisible()
  await expect(trade.getByText('Предложение действует 24 часа.', { exact: false })).toBeVisible()
  await trade.getByRole('button', { name: 'Информация об обмене' }).click()
  await trade.getByRole('button', { name: 'Добавить свой предмет для обмена' }).click()
  await expect(trade.getByRole('button', { name: 'Выбрать Клубный тостер для обмена' })).toBeVisible()
  await expect(trade.getByRole('button', { name: 'Выбрать Термокружка для обмена' })).toBeVisible()
  await trade.getByRole('button', { name: 'Выбрать Молочный кувшин для обмена' }).click()
  await trade.getByRole('button', { name: 'Показать QR-код для подключения' }).click()
  await expect(trade.getByRole('img', { name: 'QR-код подключения к обмену' })).toBeVisible()
  return trade
}

test('reserves both items, restores the offer and exchanges atomically', async ({ page }) => {
  await start(page)
  const social = await prepareOffer(page)
  const receiver = social.getByRole('combobox', { name: 'Кому предложить обмен' })
  await receiver.selectOption('demo-trade-boris')
  await expect(receiver).toHaveValue('demo-trade-boris')
  await social.getByRole('button', { name: 'Подтвердить обмен' }).click()
  await expect(social.getByText('Предложение отправлено.', { exact: false })).toBeVisible()
  await social.getByRole('button', { name: 'Закрыть обмен' }).click()
  const reserved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey)
  expect(reserved.profiles['demo-trade-anya'].trade_reserved_items).toEqual([
    { item_id: 'milk-pitcher', quantity: 1 },
  ])

  await page.reload()
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  await dismissLoginDay(page)
  await switchProfile(page, DEMO_PROFILES.boris)
  await openTab(page, 'Коллекция')
  const receiverTrade = await openTrade(page)
  await receiverTrade.getByRole('button', { name: 'Принять обмен' }).click()
  await expect(receiverTrade.getByText('Обмен завершён', { exact: true })).toBeVisible()
  await expect(receiverTrade.getByRole('button', { name: 'Принять обмен' })).toHaveCount(0)

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
  await social.getByRole('combobox', { name: 'Кому предложить обмен' }).selectOption('demo-trade-boris')
  await social.getByRole('button', { name: 'Подтвердить обмен' }).click()
  await social.getByRole('button', { name: 'Закрыть обмен' }).click()
  await switchProfile(page, DEMO_PROFILES.boris)
  const receiverTrade = await openTrade(page)
  await receiverTrade.getByRole('button', { name: 'Отклонить обмен' }).click()
  await expect(receiverTrade.getByText('Обмен отклонён', { exact: true })).toBeVisible()
  const snapshot = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey)
  expect(snapshot.profiles['demo-trade-anya'].profile.inventory.find((item: {item_id: string}) => item.item_id === 'milk-pitcher').quantity).toBe(2)
  expect(snapshot.profiles['demo-trade-boris'].profile.inventory.find((item: {item_id: string}) => item.item_id === 'breakfast-pan').quantity).toBe(2)
  expect(snapshot.profiles['demo-trade-anya'].trade_reserved_items).toEqual([])
  expect(snapshot.profiles['demo-trade-boris'].trade_reserved_items).toEqual([])
})
