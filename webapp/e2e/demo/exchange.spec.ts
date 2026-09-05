import { expect, test } from '@playwright/test'

const storageKey = 'pyaterochka_demo_challenge_state'

async function start(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  await page.getByRole('button', { name: 'Аня · обмен', exact: true }).click()
}

test('reserves both duplicates, restores the offer and atomically exchanges before crafting', async ({ page }) => {
  await start(page)
  const social = page.getByRole('region', { name: 'Обмен дубликатами' })
  await expect(social.getByRole('combobox', { name: 'Кому предложить обмен' })).toHaveValue('demo-trade-boris')
  await social.getByRole('button', { name: 'Предложить обмен' }).click()
  await expect(social.getByText('Предложение отправлено.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Молочный кувшин', exact: true })).toContainText('в обмене 1')
  await expect(social.getByRole('button', { name: 'Предложить обмен' })).toBeDisabled()

  await page.reload()
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  await page.getByRole('button', { name: 'Борис · обмен', exact: true }).click()
  await social.getByRole('button', { name: 'Принять обмен' }).click()
  await expect(social.getByText('Обмен завершён', { exact: true })).toBeVisible()
  await expect(social.getByRole('button', { name: 'Принять обмен' })).toHaveCount(0)

  const swapped = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey)
  expect(swapped.store_version).toBe(2)
  expect(swapped.trades).toHaveLength(1)
  expect(swapped.trades[0].status).toBe('accepted')
  expect(swapped.profiles['demo-trade-anya'].trade_reserved_items).toEqual([])
  expect(swapped.profiles['demo-trade-boris'].profile.inventory.find((item: {item_id: string}) => item.item_id === 'milk-pitcher').quantity).toBe(1)

  await page.getByRole('button', { name: 'Аня · обмен', exact: true }).click()
  for (const item of ['Клубный тостер', 'Молочный кувшин', 'Термокружка', 'Сковорода завтрака']) {
    await page.getByRole('button', { name: item, exact: true }).click()
  }
  await page.getByRole('button', { name: 'Создать скидку', exact: true }).click()
  await expect(page.getByText('Активная скидка 8%', { exact: false })).toBeVisible()
})

test('receiver can reject without transferring either reserved duplicate', async ({ page }) => {
  await start(page)
  const social = page.getByRole('region', { name: 'Обмен дубликатами' })
  await social.getByRole('button', { name: 'Предложить обмен' }).click()
  await page.getByRole('button', { name: 'Борис · обмен', exact: true }).click()
  await social.getByRole('button', { name: 'Отклонить обмен' }).click()
  await expect(social.getByText('Обмен отклонён', { exact: true })).toBeVisible()
  const snapshot = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey)
  expect(snapshot.profiles['demo-trade-anya'].profile.inventory.find((item: {item_id: string}) => item.item_id === 'milk-pitcher').quantity).toBe(2)
  expect(snapshot.profiles['demo-trade-boris'].profile.inventory.find((item: {item_id: string}) => item.item_id === 'breakfast-pan').quantity).toBe(2)
  expect(snapshot.profiles['demo-trade-anya'].trade_reserved_items).toEqual([])
  expect(snapshot.profiles['demo-trade-boris'].trade_reserved_items).toEqual([])
})
