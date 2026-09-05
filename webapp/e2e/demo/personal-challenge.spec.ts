import { expect, test } from '@playwright/test'

const demoStateKey = 'pyaterochka_demo_challenge_state'

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

test('computes a challenge from purchase history and issues both rewards once', async ({ page }) => {
  await openProfile(page)

  await page.getByRole('button', { name: 'Показать задание' }).click()
  const card = page.getByRole('article', { name: 'Карточка задания' })
  await expect(card).toBeVisible()
  await expect(card.locator('.demo-card-headline')).toHaveText('Доброе утро: Термокружка')

  await page.getByRole('button', { name: 'Оплаченная покупка нужной категории' }).click()
  const reveal = page.getByRole('dialog', { name: 'Награда за задание' })
  await expect(reveal).toBeVisible()
  await expect(reveal.getByText('Плюс демонстрационное право на бесплатный товар')).toBeVisible()
  await reveal.getByRole('button', { name: 'Забрать' }).click()

  await expect(page.getByRole('button', { name: /Термокружка/ })).toBeVisible()

  const afterGrant = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? '{}'), demoStateKey)
  expect(afterGrant.profile.issued_rewards).toHaveLength(1)
  expect(afterGrant.profile.outstanding_promise.fulfilled).toBe(true)
  expect(afterGrant.budget.coupon_settled_kopecks).toBe(250)

  await page.getByRole('button', { name: 'Тот же чек ещё раз' }).click()
  await expect(page.getByRole('status')).toContainText('duplicate')

  const afterReplay = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? '{}'), demoStateKey)
  expect(afterReplay.profile.issued_rewards).toHaveLength(1)
  expect(afterReplay.profile.inventory).toEqual([{ item_id: 'travel-mug', quantity: 1 }])
})

test('keeps the issued item and the fulfilled promise after a reload', async ({ page }) => {
  await openProfile(page)
  await page.getByRole('button', { name: 'Показать задание' }).click()
  await page.getByRole('button', { name: 'Оплаченная покупка нужной категории' }).click()
  await page.getByRole('dialog', { name: 'Награда за задание' }).getByRole('button', { name: 'Забрать' }).click()

  await page.reload()
  await page.getByRole('button', { name: 'Профиль' }).click()

  await expect(page.getByRole('button', { name: /Термокружка/ })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Карточка задания' })).toBeVisible()
})

test('a free line alone does not close the challenge', async ({ page }) => {
  await openProfile(page)
  await page.getByRole('button', { name: 'Показать задание' }).click()
  await page.getByRole('button', { name: 'Только бесплатная строка' }).click()

  await expect(page.getByRole('status')).toContainText('not_qualified')
  await expect(page.getByRole('dialog', { name: 'Награда за задание' })).toHaveCount(0)
  await expect(page.getByText('Пока пусто.', { exact: false })).toBeVisible()
})

test('a prepared profile receives a different challenge that completes its recipe', async ({ page }) => {
  await openProfile(page)
  await page.getByRole('button', { name: /три предмета «Доброго утра»/ }).click()
  await page.getByRole('button', { name: 'Показать задание' }).click()

  const card = page.getByRole('article', { name: 'Карточка задания' })
  await expect(card.locator('.demo-card-headline')).toHaveText('Доброе утро: Сковорода завтрака')
  await expect(card.locator('.demo-terms dd').first()).toHaveText('Яйца и завтраки')
})

test('four personal items craft one coupon and raise the avatar once', async ({ page }) => {
  await openProfile(page)
  await page.getByRole('button', { name: /три предмета «Доброго утра»/ }).click()
  await page.getByRole('button', { name: 'Показать задание' }).click()
  await page.getByRole('button', { name: 'Оплаченная покупка нужной категории' }).click()
  await page.getByRole('dialog', { name: 'Награда за задание' }).getByRole('button', { name: 'Забрать' }).click()

  for (const itemName of ['Клубный тостер', 'Молочный кувшин', 'Термокружка', 'Сковорода завтрака']) {
    await page.getByRole('button', { name: new RegExp(itemName) }).click()
  }

  await page.getByRole('button', { name: 'Создать скидку' }).click()
  await expect(page.getByText('Активная скидка 8%', { exact: false })).toBeVisible()
  await expect(page.getByText('Уровень 1/7', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Погасить (демо)' }).click()
  await expect(page.getByRole('button', { name: 'Создать скидку' })).toBeVisible()
})
