import { expect, test } from '@playwright/test'

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

  const afterGrant = await readActiveState(page)
  expect(afterGrant.profile.issued_rewards).toHaveLength(1)
  expect(afterGrant.profile.outstanding_promise.fulfilled).toBe(true)
  expect(afterGrant.budget.coupon_settled_kopecks).toBe(0)
  expect(afterGrant.budget.coupon_reserved_kopecks).toBe(250)

  const repeatedRequest = page.waitForRequest((request) => request.url().endsWith('/api/demo/event'))
  await page.getByRole('button', { name: 'Тот же чек ещё раз' }).click()
  const replayPayload = (await repeatedRequest).postDataJSON()
  expect(replayPayload.receipt).toEqual(afterGrant.last_receipt.receipt)
  expect(replayPayload.idempotency_key).toBe(`idem-${afterGrant.challenge.challenge_id}-${afterGrant.last_receipt.receipt.receipt_id}`)
  await expect(page.getByRole('status')).toContainText('duplicate')

  const afterReplay = await readActiveState(page)
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

test('switching synthetic profiles preserves their separate promises and inventory', async ({ page }) => {
  await openProfile(page)
  await page.getByRole('button', { name: 'Показать задание' }).click()
  await expect(page.getByRole('article', { name: 'Карточка задания' })).toBeVisible()
  const original = await readActiveState(page)
  await page.getByRole('button', { name: /три предмета «Доброго утра»/ }).click()
  await expect(page.getByRole('button', { name: 'Клубный тостер', exact: true })).toBeVisible()
  await page.getByRole('button', { name: original.profile.label, exact: true }).click()
  await expect(page.getByRole('article', { name: 'Карточка задания' })).toBeVisible()
  const restored = await readActiveState(page)
  expect(restored.challenge).toEqual(original.challenge)
  expect(restored.profile.inventory).toEqual(original.profile.inventory)
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
    await page.getByRole('button', { name: itemName, exact: true }).click()
  }

  await page.getByRole('button', { name: 'Убрать одну копию: Молочный кувшин', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Создать скидку', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Молочный кувшин', exact: true }).click()

  await page.getByRole('button', { name: 'Создать скидку' }).click()
  await expect(page.getByText('Активная скидка 8%', { exact: false })).toBeVisible()
  await expect(page.getByText('Уровень 1/7', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Погасить (демо)' }).click()
  await expect(page.getByRole('button', { name: 'Создать скидку' })).toBeVisible()
})
