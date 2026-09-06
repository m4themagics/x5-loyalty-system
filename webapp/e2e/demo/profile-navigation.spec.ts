import { expect, test } from '@playwright/test'

import { DEMO_PROFILES, openTab, switchProfile } from './stand'

const chestStorageKey = 'pyaterochka_profile_chest_deadline'
const demoStateKey = 'pyaterochka_demo_challenge_state'

test('returns to the top when switching from the scrolled profile to Home', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Профиль' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Профиль' })).toBeVisible()

  await page.evaluate(() => window.scrollTo(0, 600))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Главная' }).click()

  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await expect(page.getByRole('region', { name: 'Карта лояльности' })).toBeVisible()
})

test('unlimited demo mode ignores a saved cooldown and keeps the chest openable', async ({ page }) => {
  await page.addInitScript(
    ({ key, deadline }) => window.localStorage.setItem(key, String(deadline)),
    { key: chestStorageKey, deadline: Date.now() + 24 * 60 * 60 * 1_000 },
  )

  await page.goto('/')
  await page.getByRole('button', { name: 'Профиль' }).click()
  await expect(page.getByRole('button', { name: 'Открыть коробку Пятёрочки' })).toBeEnabled()
  await expect(page.locator('.chest-timer-label')).toHaveText('Коробка')
  await expect(page.locator('.chest-timer-value')).toHaveText('Готова')

  await page.reload()
  await page.getByRole('button', { name: 'Профиль' }).click()
  await expect(page.getByRole('button', { name: 'Открыть коробку Пятёрочки' })).toBeEnabled()
  await expect(page.locator('.chest-timer-value')).toHaveText('Готова')
})

test('opens an available chest after the user shakes it across the screen', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Профиль' }).click()
  // Пустой профиль делает результат одной коробки однозначным: инвентарь один на всё.
  await switchProfile(page, DEMO_PROFILES.empty)
  await page.getByRole('button', { name: 'Открыть коробку Пятёрочки' }).click()

  const shakeTarget = page.getByRole('button', { name: 'Трясти коробку' })
  const box = await shakeTarget.boundingBox()
  expect(box).not.toBeNull()
  if (box === null) return

  const centerY = box.y + box.height / 2
  await page.mouse.move(box.x + box.width / 2, centerY)
  await page.mouse.down()
  for (let move = 0; move < 9; move += 1) {
    const x = move % 2 === 0 ? box.x + 24 : box.x + box.width - 24
    await page.mouse.move(x, centerY)
  }
  await page.mouse.up()

  await expect(page.getByRole('heading', { name: 'Вам выпал предмет!' })).toBeVisible()
  await expect(page.locator('.revealed-reward-item')).toBeVisible()
  const rewardName = (await page.locator('.reward-item-name').innerText()).trim()
  await page.getByRole('button', { name: 'Забрать' }).click()

  await expect(page.locator('.inventory-item')).toHaveCount(1)
  await expect(page.getByRole('button', { name: new RegExp(`^${rewardName}, `) })).toBeVisible()
  await expect(page.getByText('1/24', { exact: true })).toBeVisible()
  const savedInventory = await page.evaluate((key) => {
    const store = JSON.parse(window.localStorage.getItem(key) ?? '{}')
    return store.profiles?.[store.active_profile_id]?.profile.inventory ?? null
  }, demoStateKey)
  expect(savedInventory).toHaveLength(1)
  expect(savedInventory?.[0]?.quantity).toBe(1)

  await openTab(page, 'Задания')
  const chestButton = page.getByRole('button', { name: 'Открыть коробку Пятёрочки' })
  await expect(chestButton).toBeEnabled()
  await chestButton.click()
  await expect(page.getByRole('heading', { name: 'Потрясите коробку' })).toBeVisible()
})

test('crafts a themed discount from four inventory items and restores its barcode', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Профиль' }).click()
  await openTab(page, 'Коллекция')
  // Показательный профиль приезжает асинхронно: дождёмся инвентаря,
  // чтобы дальнейшие перетаскивания не боролись с догружающейся вёрсткой.
  await expect(page.getByRole('heading', { name: 'Инвентарь' })).toBeVisible()

  const firstItem = page.getByRole('button', { name: /^Клубный тостер, / })
  const firstSlot = page.getByRole('button', { name: 'Пустая ячейка скидки 1' })
  await firstItem.dragTo(firstSlot)
  await expect(page.getByRole('button', { name: /^Клубный тостер в ячейке 1/ }))
    .toBeVisible()

  for (const [itemName, slotNumber] of [
    ['Клубный тостер', 2],
    ['Молочный кувшин', 3],
    ['Сковорода завтрака', 4],
  ] as const) {
    await page.getByRole('button', { name: new RegExp(`^${itemName}, `) }).click()
    const itemDialog = page.getByRole('dialog', { name: `Предмет «${itemName}»` })
    await expect(itemDialog).toBeVisible()
    await expect(itemDialog.getByText(/скидк/i)).toHaveCount(0)
    await itemDialog.getByRole('button', { name: 'Выбрать предмет' }).click()
    await expect(itemDialog).toHaveCount(0)
    await page.getByRole('button', { name: `Пустая ячейка скидки ${slotNumber}` }).click()
    await expect(page.getByRole('button', { name: new RegExp(`^${itemName} в ячейке ${slotNumber}`) }))
      .toBeVisible()
  }

  const createButton = page.getByRole('button', { name: 'Создать скидку 7%' })
  await expect(createButton).toBeEnabled()
  await createButton.click()

  const discountDialog = page.getByRole('dialog', { name: 'Созданная скидка' })
  await expect(discountDialog).toBeVisible()
  await expect(discountDialog.getByRole('heading', { name: 'Доброе утро', exact: true })).toBeVisible()
  await expect(discountDialog.getByText('−7%', { exact: true })).toBeVisible()
  await discountDialog.getByRole('button', { name: 'Показать штрихкод' }).click()
  await expect(page.getByRole('dialog', { name: 'Штрихкод скидки' })).toBeVisible()
  await expect(page.getByRole('img', { name: /^Штрихкод \d{13}$/ })).toBeVisible()
  await page.getByRole('button', { name: 'Закрыть скидку' }).click()

  const discountBadge = page.getByRole('button', { name: /Открыть скидку 7% «Доброе утро»/ })
  await expect(discountBadge).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Профиль' }).click()
  await expect(discountBadge).toBeVisible()
  await discountBadge.click()
  await expect(page.getByRole('img', { name: /^Штрихкод \d{13}$/ })).toBeVisible()
})
