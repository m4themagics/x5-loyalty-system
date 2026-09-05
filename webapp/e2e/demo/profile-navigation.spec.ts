import { expect, test } from '@playwright/test'

const chestStorageKey = 'pyaterochka_profile_chest_deadline'
const inventoryStorageKey = 'pyaterochka_profile_inventory'
const activeDiscountStorageKey = 'pyaterochka_profile_active_discount'

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
  await expect(page.getByText('Демо-режим', { exact: true })).toBeVisible()
  await expect(page.getByText('Без лимита', { exact: true })).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'Профиль' }).click()
  await expect(page.getByRole('button', { name: 'Открыть коробку Пятёрочки' })).toBeEnabled()
  await expect(page.getByText('Без лимита', { exact: true })).toBeVisible()
})

test('opens an available chest after the user shakes it across the screen', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Профиль' }).click()
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
  await page.getByRole('button', { name: 'Забрать' }).click()

  await expect(page.locator('.inventory-item')).toHaveCount(1)
  await expect(page.getByText('1/24', { exact: true })).toBeVisible()
  const savedInventory = await page.evaluate((key) => {
    const value = window.localStorage.getItem(key)
    return value === null ? null : JSON.parse(value)
  }, inventoryStorageKey)
  expect(savedInventory?.entries).toHaveLength(1)
  expect(savedInventory?.entries[0]?.quantity).toBe(1)

  const chestButton = page.getByRole('button', { name: 'Открыть коробку Пятёрочки' })
  await expect(chestButton).toBeEnabled()
  await chestButton.click()
  await expect(page.getByRole('heading', { name: 'Потрясите коробку' })).toBeVisible()
})

test('crafts a themed discount from four inventory items and restores its barcode', async ({ page }) => {
  await page.addInitScript(
    ({ discountKey, inventoryKey }) => {
      if (window.sessionStorage.getItem('crafting-fixture-seeded') === 'true') return
      window.localStorage.removeItem(discountKey)
      window.localStorage.setItem(inventoryKey, JSON.stringify({
        version: 1,
        entries: [
          { itemId: 'fruit-basket', quantity: 1 },
          { itemId: 'vegetable-crate', quantity: 1 },
          { itemId: 'power-blender', quantity: 1 },
          { itemId: 'freshness-dome', quantity: 1 },
        ],
      }))
      window.sessionStorage.setItem('crafting-fixture-seeded', 'true')
    },
    { discountKey: activeDiscountStorageKey, inventoryKey: inventoryStorageKey },
  )

  await page.goto('/')
  await page.getByRole('button', { name: 'Профиль' }).click()

  const firstItem = page.getByRole('button', { name: /Фруктовая корзинка/ })
  const firstSlot = page.getByRole('button', { name: 'Пустая ячейка скидки 1' })
  await firstItem.dragTo(firstSlot)
  await expect(page.getByRole('button', { name: /Фруктовая корзинка в ячейке 1/ }))
    .toBeVisible()

  for (const [itemName, slotNumber] of [
    ['Овощной ящик', 2],
    ['Блендер здоровья', 3],
    ['Купол свежести', 4],
  ] as const) {
    await page.getByRole('button', { name: new RegExp(itemName) }).click()
    await page.getByRole('button', { name: `Пустая ячейка скидки ${slotNumber}` }).click()
  }

  const createButton = page.getByRole('button', { name: 'Создать скидку 10%' })
  await expect(createButton).toBeEnabled()
  await createButton.click()

  const discountDialog = page.getByRole('dialog', { name: 'Созданная скидка' })
  await expect(discountDialog).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Свежий выбор' })).toBeVisible()
  await expect(discountDialog.getByText('−10%', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Показать штрихкод' }).click()
  await expect(page.getByRole('dialog', { name: 'Штрихкод скидки' })).toBeVisible()
  await expect(page.getByRole('img', { name: /^Штрихкод \d{13}$/ })).toBeVisible()
  await page.getByRole('button', { name: 'Закрыть скидку' }).click()

  const discountBadge = page.getByRole('button', { name: /Открыть скидку 10% «Свежий выбор»/ })
  await expect(discountBadge).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Профиль' }).click()
  await expect(discountBadge).toBeVisible()
  await discountBadge.click()
  await expect(page.getByRole('img', { name: /^Штрихкод \d{13}$/ })).toBeVisible()
})
