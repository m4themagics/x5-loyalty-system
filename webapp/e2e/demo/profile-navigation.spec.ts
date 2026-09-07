import { expect, test } from '@playwright/test'

import { openTab, prepareLoginBox, dismissLoginDay } from './stand'

const chestStorageKey = 'pyaterochka_profile_chest_deadline'
const demoStateKey = 'pyaterochka_demo_challenge_state'

/** Сумма копий в общем инвентаре активного профиля. */
async function readOwnedCopies(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return 0
    const store = JSON.parse(raw) as {
      active_profile_id: string
      profiles: Record<string, { profile: { inventory: { quantity: number }[] } }>
    }
    const active = store.profiles[store.active_profile_id]
    return active.profile.inventory.reduce((total, entry) => total + entry.quantity, 0)
  }, demoStateKey)
}
const activeDiscountStorageKey = 'pyaterochka_profile_active_discount'

test('returns to the top when switching from the scrolled profile to Home', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Профиль' }).click()
  await dismissLoginDay(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Профиль' })).toBeVisible()
  await expect(page.getByText('Выгода за 28 дней')).toBeVisible()
  await expect(page.getByText('Сэкономлено за 28 дней')).toHaveCount(0)
  await expect(page.locator('.profile-stat-value')).toHaveCSS('color', 'rgb(20, 145, 62)')
  await expect(page.locator('.profile-trade-entry [data-slot="typography"]')).toHaveCSS('color', 'rgb(32, 33, 36)')

  await page.evaluate(() => window.scrollTo(0, 600))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Главная' }).click()

  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await expect(page.getByRole('region', { name: 'Карта лояльности' })).toBeVisible()
})

test('login box records one day across reloads and keeps the rules visible', async ({ page }) => {
  await page.addInitScript(
    ({ key, deadline }) => window.localStorage.setItem(key, String(deadline)),
    { key: chestStorageKey, deadline: Date.now() + 24 * 60 * 60 * 1_000 },
  )

  await page.goto('/')
  await page.getByRole('button', { name: 'Профиль' }).click()
  await dismissLoginDay(page)
  await expect(page.getByRole('button', { name: 'Открыть коробку Пятёрочки' })).toBeDisabled()
  await expect(page.getByText('Общие задания магазина — их видят все покупатели')).toHaveCount(0)
  await expect(page.locator('.chest-timer-label')).toHaveText('За возвращение')
  await expect(page.locator('.chest-timer-value')).toHaveText('1 из 3 дней')

  await page.getByRole('button', { name: 'Информация о коробке' }).click()
  const chestInfo = page.getByRole('dialog', { name: 'Как открыть коробку' })
  await expect(chestInfo.getByText('Заходите в три разных дня по московскому времени', { exact: false })).toBeVisible()
  await expect(chestInfo.getByRole('list', { name: 'Шансы выпадения предметов' })).toContainText('Обычный70%')
  await expect(chestInfo.getByRole('list', { name: 'Шансы выпадения предметов' })).toContainText('Эпический25%')
  await expect(chestInfo.getByRole('list', { name: 'Шансы выпадения предметов' })).toContainText('Легендарный5%')
  await chestInfo.getByRole('button', { name: 'Закрыть информацию' }).click()

  await page.reload()
  await page.getByRole('button', { name: 'Профиль' }).click()
  await dismissLoginDay(page)
  await expect(page.getByRole('button', { name: 'Открыть коробку Пятёрочки' })).toBeDisabled()
  await expect(page.locator('.chest-timer-value')).toHaveText('1 из 3 дней')

  for (const tab of ['Коллекция', 'Друзья', 'Задания']) {
    await openTab(page, tab)
    await expect(page.getByRole('button', { name: 'Открыть коробку Пятёрочки' })).toBeVisible()
    if (tab === 'Друзья') {
      await expect(page.getByText('Когда приглашенный друг сделает первую покупку, вы получите предмет для своей коллекции.')).toBeVisible()
      await expect(page.getByText('Награда одна за неделю и только за подтверждённую покупку.')).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'Прогресс друзей' })).toBeVisible()
      // Деньги из сравнения убраны: рейтинг говорит только о собранном.
      await expect(page.getByText('Считается только реально погашенная выгода за 28 дней.', { exact: false })).toHaveCount(0)
      // В карточке друга остаются титул и предметы, но не суммы.
      await expect(page.locator('.demo-friend-score').first()).not.toContainText('₽')
      await expect(page.locator('.demo-friend').first()).not.toContainText('₽')
      await expect(page.locator('.demo-friend')).toHaveCount(3)
      await expect(page.getByRole('heading', { name: 'Титул коллекции' })).toHaveCount(0)
      await expect(page.locator('.demo-title-value')).toBeVisible()
    }
  }
})

test('opens an available chest after the user shakes it across the screen', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Профиль' }).click()
  await dismissLoginDay(page)
  await expect(page.getByRole('heading', { level: 2, name: 'Персональный челлендж' })).toBeVisible()
  await prepareLoginBox(page)
  const copiesBefore = await readOwnedCopies(page)
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

  // Предмет из коробки попадает в тот же инвентарь, что и награды за задания.
  const copiesAfter = await readOwnedCopies(page)
  expect(copiesAfter).toBe(copiesBefore + 1)

  await openTab(page, 'Задания')
  const chestButton = page.getByRole('button', { name: 'Открыть коробку Пятёрочки' })
  await expect(chestButton).toBeDisabled()
  await page.reload()
  await page.getByRole('button', { name: 'Профиль' }).click()
  await dismissLoginDay(page)
  await expect(chestButton).toBeDisabled()
  expect(await readOwnedCopies(page)).toBe(copiesAfter)
})

test('crafts a themed discount from four inventory items and restores its barcode', async ({ page }) => {
  await page.addInitScript((discountKey) => {
    if (window.sessionStorage.getItem('crafting-fixture-seeded') === 'true') return
    window.localStorage.removeItem(discountKey)
    window.sessionStorage.setItem('crafting-fixture-seeded', 'true')
  }, activeDiscountStorageKey)

  await page.goto('/')
  await page.getByRole('button', { name: 'Профиль' }).click()
  await dismissLoginDay(page)
  await openTab(page, 'Коллекция')
  await expect(page.getByText('Собери 4 предмета')).toBeVisible()
  await expect(page.getByText('Полученные вами предметы, которые можно использовать для создания скидки.')).toBeVisible()
  await expect(page.getByText('Перетащите четыре предмета. При создании потратится по одной копии.')).toHaveCount(0)
  await expect(page.getByText('Тяните предмет вверх или выберите его нажатием, затем нажмите на ячейку.')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Предметы за задания' })).toHaveCount(0)

  const firstItem = page.locator('.inventory-item[aria-label^="Клубный тостер"]')
  await expect(firstItem).toBeVisible()
  const firstSlot = page.getByRole('button', { name: 'Пустая ячейка скидки 1' })
  await firstItem.dragTo(firstSlot)
  await expect(page.getByRole('button', { name: /Клубный тостер в ячейке 1/ }))
    .toBeVisible()

  for (const [itemName, slotNumber] of [
    ['Клубный тостер', 2],
    ['Молочный кувшин', 3],
    ['Сковорода завтрака', 4],
  ] as const) {
    await page.locator(`.inventory-item[aria-label^="${itemName}"]`).click()
    const itemDialog = page.getByRole('dialog', { name: `Предмет «${itemName}»` })
    await expect(itemDialog).toBeVisible()
    await expect(itemDialog.getByText(/скидк/i)).toHaveCount(0)
    await itemDialog.getByRole('button', { name: 'Добавить в набор' }).click()
    await expect(itemDialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: new RegExp(`${itemName} в ячейке ${slotNumber}`) }))
      .toBeVisible()
  }

  const createButton = page.getByRole('button', { name: 'Создать скидку 7%' })
  await expect(createButton).toBeEnabled()
  await createButton.click()

  const discountDialog = page.getByRole('dialog', { name: 'Созданная скидка' })
  await expect(discountDialog).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Доброе утро' })).toBeVisible()
  await expect(discountDialog.getByText('−7%', { exact: true })).toBeVisible()
  // Такая же кнопка есть в карточке активной скидки на вкладке, поэтому берём её в диалоге.
  await discountDialog.getByRole('button', { name: 'Показать штрихкод' }).click()
  const barcodeDialog = page.getByRole('dialog', { name: 'Штрихкод скидки' })
  await expect(barcodeDialog).toBeVisible()
  await expect(barcodeDialog.getByText('Покажите на кассе')).toHaveCount(0)
  await expect(barcodeDialog.getByRole('heading', { name: 'Доброе утро' })).toBeVisible()
  await expect(barcodeDialog.locator('.discount-barcode-percent')).toHaveText('−7%')
  await expect(page.getByRole('img', { name: /^Штрихкод \d{13}$/ })).toBeVisible()
  await page.getByRole('button', { name: 'Закрыть скидку' }).click()

  const discountBadge = page.getByRole('button', { name: /Открыть скидку 7% «Доброе утро»/ })
  await expect(discountBadge).toBeVisible()
  await expect(discountBadge).toHaveCSS('border-top-color', 'rgb(22, 163, 74)')
  await page.reload()
  await page.getByRole('button', { name: 'Профиль' }).click()
  await dismissLoginDay(page)
  await expect(discountBadge).toBeVisible()
  await discountBadge.click()
  await expect(page.getByRole('img', { name: /^Штрихкод \d{13}$/ })).toBeVisible()
})
