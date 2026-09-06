import { expect, test } from '@playwright/test'

import {
  DEMO_PROFILES,
  closeStand,
  openStand,
  openTab,
  putItemIntoDiscountSlot,
  standLog,
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
  await page.getByRole('button', { name: 'Профиль' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Персональный челлендж' })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  // Однократная очистка на контекст: перезагрузка в тесте обязана сохранять состояние демо.
  await page.addInitScript((key) => {
    if (window.sessionStorage.getItem('demo-state-cleared') === 'true') return
    window.localStorage.removeItem(key)
    window.sessionStorage.setItem('demo-state-cleared', 'true')
  }, demoStateKey)
})

test('the showcase profile opens with one challenge that finishes its set', async ({ page }) => {
  await openProfile(page)

  await page.getByRole('button', { name: 'Показать задание' }).click()
  const card = page.getByRole('article', { name: 'Карточка задания' })
  await expect(card).toBeVisible()
  await expect(card.locator('.demo-card-headline')).toHaveText('Доброе утро: Термокружка')
  await expect(card.locator('.demo-recipe-count')).toHaveText('3 из 4')
  await expect(card.locator('.demo-terms dd').first()).toHaveText('Кофе и чай')
})

test('computes a challenge from purchase history and issues both rewards once', async ({ page }) => {
  await openProfile(page)
  await switchProfile(page, DEMO_PROFILES.empty)

  await page.getByRole('button', { name: 'Показать задание' }).click()
  const card = page.getByRole('article', { name: 'Карточка задания' })
  await expect(card).toBeVisible()
  await expect(card.locator('.demo-card-headline')).toHaveText('Доброе утро: Молочный кувшин')

  await openStand(page)
  await page.getByRole('button', { name: 'Оплаченная покупка нужной категории' }).click()
  const reveal = page.getByRole('dialog', { name: 'Награда за задание' })
  await expect(reveal).toBeVisible()
  await expect(reveal.getByText('Плюс демонстрационное право на бесплатный товар')).toBeVisible()
  await reveal.getByRole('button', { name: 'Забрать' }).click()

  await expect(page.getByRole('status')).toContainText('Покупка засчитана')
  await closeStand(page)
  await openTab(page, 'Коллекция')
  // Награда за задание попадает в тот же инвентарь, что и предмет из коробки.
  await expect(page.getByRole('button', { name: 'Молочный кувшин, Обычный, доступно 1 из 1' })).toBeVisible()
  await openTab(page, 'Задания')

  const afterGrant = await readActiveState(page)
  expect(afterGrant.profile.issued_rewards).toHaveLength(1)
  expect(afterGrant.profile.outstanding_promise.fulfilled).toBe(true)
  expect(afterGrant.budget.coupon_settled_kopecks).toBe(0)
  expect(afterGrant.budget.coupon_reserved_kopecks).toBe(250)

  await openStand(page)
  const repeatedRequest = page.waitForRequest((request) => request.url().endsWith('/api/demo/event'))
  await page.getByRole('button', { name: 'Тот же чек ещё раз' }).click()
  const replayPayload = (await repeatedRequest).postDataJSON()
  expect(replayPayload.receipt).toEqual(afterGrant.last_receipt.receipt)
  expect(replayPayload.idempotency_key).toBe(`idem-${afterGrant.challenge.challenge_id}-${afterGrant.last_receipt.receipt.receipt_id}`)
  await expect(standLog(page)).toContainText('duplicate')
  await expect(page.getByRole('status')).toContainText('Этот чек уже учтён')

  const afterReplay = await readActiveState(page)
  expect(afterReplay.profile.issued_rewards).toHaveLength(1)
  expect(afterReplay.profile.inventory).toEqual([{ item_id: 'milk-pitcher', quantity: 1 }])
})

test('keeps the issued item and the fulfilled promise after a reload', async ({ page }) => {
  await openProfile(page)
  await switchProfile(page, DEMO_PROFILES.empty)
  await page.getByRole('button', { name: 'Показать задание' }).click()
  await openStand(page)
  await page.getByRole('button', { name: 'Оплаченная покупка нужной категории' }).click()
  await page.getByRole('dialog', { name: 'Награда за задание' }).getByRole('button', { name: 'Забрать' }).click()

  await page.reload()
  await page.getByRole('button', { name: 'Профиль' }).click()

  await expect(page.getByRole('article', { name: 'Карточка задания' })).toBeVisible()
  await openTab(page, 'Коллекция')
  await expect(page.getByRole('button', { name: 'Молочный кувшин, Обычный, доступно 1 из 1' })).toBeVisible()
})

test('switching synthetic profiles preserves their separate promises and inventory', async ({ page }) => {
  await openProfile(page)
  await switchProfile(page, DEMO_PROFILES.empty)
  await page.getByRole('button', { name: 'Показать задание' }).click()
  await expect(page.getByRole('article', { name: 'Карточка задания' })).toBeVisible()
  const original = await readActiveState(page)

  await switchProfile(page, DEMO_PROFILES.seeded)
  await openTab(page, 'Коллекция')
  await expect(page.getByRole('button', { name: 'Клубный тостер, Обычный, доступно 1 из 1' })).toBeVisible()

  await switchProfile(page, DEMO_PROFILES.empty)
  await openTab(page, 'Задания')
  await expect(page.getByRole('article', { name: 'Карточка задания' })).toBeVisible()
  const restored = await readActiveState(page)
  expect(restored.challenge).toEqual(original.challenge)
  expect(restored.profile.inventory).toEqual(original.profile.inventory)
})

test('a free line alone does not close the challenge', async ({ page }) => {
  await openProfile(page)
  await switchProfile(page, DEMO_PROFILES.empty)
  await page.getByRole('button', { name: 'Показать задание' }).click()
  await openStand(page)
  await page.getByRole('button', { name: 'Только бесплатная строка' }).click()

  await expect(standLog(page)).toContainText('not_qualified')
  await expect(page.getByRole('dialog', { name: 'Награда за задание' })).toHaveCount(0)
  await closeStand(page)
  await expect(page.getByRole('status')).toContainText('нет оплаченной покупки из нужной категории')
  await openTab(page, 'Коллекция')
  // Единственный инвентарь остался пустым: незачтённый чек ничего не выдал.
  await expect(page.locator('.inventory-item')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Коллекция пока пуста' })).toBeVisible()
})

test('a prepared profile receives a different challenge that completes its recipe', async ({ page }) => {
  await openProfile(page)
  await switchProfile(page, DEMO_PROFILES.seeded)
  await page.getByRole('button', { name: 'Показать задание' }).click()

  const card = page.getByRole('article', { name: 'Карточка задания' })
  await expect(card.locator('.demo-card-headline')).toHaveText('Доброе утро: Сковорода завтрака')
  await expect(card.locator('.demo-terms dd').first()).toHaveText('Яйца и завтраки')
})

test('four personal items craft one coupon and raise the avatar once', async ({ page }) => {
  // Показательный профиль: три предмета набора и дубликат, четвёртый приходит за задание.
  await openProfile(page)
  await page.getByRole('button', { name: 'Показать задание' }).click()
  await openStand(page)
  await page.getByRole('button', { name: 'Оплаченная покупка нужной категории' }).click()
  await page.getByRole('dialog', { name: 'Награда за задание' }).getByRole('button', { name: 'Забрать' }).click()
  await closeStand(page)
  await openTab(page, 'Коллекция')

  const breakfastSet = ['Клубный тостер', 'Молочный кувшин', 'Термокружка', 'Сковорода завтрака'] as const
  for (const [index, itemName] of breakfastSet.entries()) {
    await putItemIntoDiscountSlot(page, itemName, index + 1)
  }

  // Освобождённая ячейка снова закрывает сборку: купон стоит ровно четырёх предметов.
  await page.getByRole('button', { name: /^Молочный кувшин в ячейке 2/ }).click()
  await expect(page.getByRole('button', { name: 'Пустая ячейка скидки 2' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Добавьте ещё 1' })).toBeDisabled()
  await putItemIntoDiscountSlot(page, 'Молочный кувшин', 2)

  await page.getByRole('button', { name: 'Создать скидку 8%' }).click()
  const discountDialog = page.getByRole('dialog', { name: 'Созданная скидка' })
  await expect(discountDialog).toBeVisible()
  await page.getByRole('button', { name: 'Закрыть скидку' }).click()

  await expect(page.getByText('Активная скидка 8%', { exact: false })).toBeVisible()
  await expect(page.locator('.profile-stat-level-value')).toHaveText('1 из 7')
  // Пока купон активен, второй набор собрать нельзя: ячейки скрыты.
  await expect(page.getByRole('button', { name: 'Пустая ячейка скидки 1' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Погасить (демо)' }).click()
  await expect(page.getByText('Активная скидка', { exact: false })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Пустая ячейка скидки 1' })).toBeVisible()
  // Рецепт засчитан один раз: погашение не поднимает уровень повторно.
  await expect(page.locator('.profile-stat-level-value')).toHaveText('1 из 7')
})
