import { expect, test } from '@playwright/test'

import { DEMO_PROFILES, openTab, putItemIntoDiscountSlot, switchProfile } from './stand'

const storageKey = 'pyaterochka_demo_challenge_state'

async function start(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  await switchProfile(page, DEMO_PROFILES.anya)
  await openTab(page, 'Коллекция')
}

test('reserves both duplicates, restores the offer and atomically exchanges before crafting', async ({ page }) => {
  await start(page)
  const milkPitcher = page.getByRole('button', { name: /^Молочный кувшин, / })
  await expect(milkPitcher).toHaveAccessibleName('Молочный кувшин, Обычный, доступно 2 из 2')

  const social = page.getByRole('region', { name: 'Обмен дубликатами' })
  const receiver = social.getByRole('combobox', { name: 'Кому предложить обмен' })
  await receiver.selectOption('demo-trade-boris')
  await expect(receiver).toHaveValue('demo-trade-boris')
  await social.getByRole('button', { name: 'Предложить обмен' }).click()
  await expect(social.getByText('Предложение отправлено.', { exact: false })).toBeVisible()
  // Предложенная копия остаётся во владении, но перестаёт быть доступной для сборки.
  await expect(milkPitcher).toHaveAccessibleName('Молочный кувшин, Обычный, доступно 1 из 1')
  await expect(social.getByRole('button', { name: 'Предложить обмен' })).toBeDisabled()

  await page.reload()
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  await switchProfile(page, DEMO_PROFILES.boris)
  await openTab(page, 'Коллекция')
  await social.getByRole('button', { name: 'Принять обмен' }).click()
  await expect(social.getByText('Обмен завершён', { exact: true })).toBeVisible()
  await expect(social.getByRole('button', { name: 'Принять обмен' })).toHaveCount(0)

  const swapped = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey)
  expect(swapped.store_version).toBe(3)
  expect(swapped.trades).toHaveLength(1)
  expect(swapped.trades[0].status).toBe('accepted')
  expect(swapped.profiles['demo-trade-anya'].trade_reserved_items).toEqual([])
  expect(swapped.profiles['demo-trade-boris'].profile.inventory.find((item: {item_id: string}) => item.item_id === 'milk-pitcher').quantity).toBe(1)

  await switchProfile(page, DEMO_PROFILES.anya)
  const breakfastSet = ['Клубный тостер', 'Молочный кувшин', 'Термокружка', 'Сковорода завтрака'] as const
  for (const [index, itemName] of breakfastSet.entries()) {
    await putItemIntoDiscountSlot(page, itemName, index + 1)
  }
  await page.getByRole('button', { name: 'Создать скидку 8%' }).click()
  await expect(page.getByRole('dialog', { name: 'Созданная скидка' })).toBeVisible()
  await page.getByRole('button', { name: 'Закрыть скидку' }).click()
  await expect(page.getByText('Активная скидка 8%', { exact: false })).toBeVisible()
})

test('receiver can reject without transferring either reserved duplicate', async ({ page }) => {
  await start(page)
  const social = page.getByRole('region', { name: 'Обмен дубликатами' })
  await social.getByRole('combobox', { name: 'Кому предложить обмен' }).selectOption('demo-trade-boris')
  await social.getByRole('button', { name: 'Предложить обмен' }).click()
  await switchProfile(page, DEMO_PROFILES.boris)
  await social.getByRole('button', { name: 'Отклонить обмен' }).click()
  await expect(social.getByText('Обмен отклонён', { exact: true })).toBeVisible()
  const snapshot = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey)
  expect(snapshot.profiles['demo-trade-anya'].profile.inventory.find((item: {item_id: string}) => item.item_id === 'milk-pitcher').quantity).toBe(2)
  expect(snapshot.profiles['demo-trade-boris'].profile.inventory.find((item: {item_id: string}) => item.item_id === 'breakfast-pan').quantity).toBe(2)
  expect(snapshot.profiles['demo-trade-anya'].trade_reserved_items).toEqual([])
  expect(snapshot.profiles['demo-trade-boris'].trade_reserved_items).toEqual([])
})
