import { expect, test } from '@playwright/test'

const chestStorageKey = 'pyaterochka_profile_chest_deadline'

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

test('keeps an expired chest openable after a reload instead of postponing it', async ({ page }) => {
  await page.addInitScript(
    ({ key, deadline }) => window.localStorage.setItem(key, String(deadline)),
    { key: chestStorageKey, deadline: Date.now() - 1_000 },
  )

  await page.goto('/')
  await page.getByRole('button', { name: 'Профиль' }).click()
  await expect(page.getByRole('button', { name: 'Открыть коробку Пятёрочки' })).toBeEnabled()
  await expect(page.getByText('Можно открыть', { exact: true })).toBeVisible()
  await expect(page.getByText('00:00:00', { exact: true })).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'Профиль' }).click()
  await expect(page.getByRole('button', { name: 'Открыть коробку Пятёрочки' })).toBeEnabled()
  await expect(page.getByText('Можно открыть', { exact: true })).toBeVisible()
})
