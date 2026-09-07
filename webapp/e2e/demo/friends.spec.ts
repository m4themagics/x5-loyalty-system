import { expect, test, type Route } from '@playwright/test'

import { openTab, dismissLoginDay } from './stand'

async function sendTitle(route: Route, title: string) {
  const request = route.request().postDataJSON()
  await route.fulfill({ json: {
    contract_version: 2,
    request_id: request.request_id,
    server_time_ms: request.now_ms,
    title,
    subtitle: 'Ваша коллекция кухонных предметов',
    source: 'fallback',
    violations: [],
  } })
}

test('shows your title before slow friends and keeps the ranking scores visible', async ({ page }) => {
  let releaseFriends!: () => void
  const friendsReady = new Promise<void>((resolve) => { releaseFriends = resolve })
  await page.route('**/api/demo/title', async (route) => {
    if (route.request().postDataJSON().profile.profile_id.startsWith('demo-trade-')) {
      await friendsReady
    }
    await sendTitle(route, 'Кухонный энтузиаст')
  })

  try {
    await page.goto('/')
    await page.getByRole('button', { name: 'Профиль', exact: true }).click()
    await dismissLoginDay(page)
    await openTab(page, 'Друзья')

    await expect(page.locator('.demo-title-value')).toHaveText('Кухонный энтузиаст')
    await expect(page.locator('.demo-friend-score').first()).toContainText('набор')
    await expect(page.locator('.demo-friend-score').first()).toContainText('предмет')
    await expect(page.locator('.demo-friend-list')).not.toContainText('₽')
    await expect(page.getByText('Подбираем титул по вашей коллекции')).toHaveCount(0)

    releaseFriends()
    await expect(page.locator('.demo-friend-title')).toHaveText([
      'Кухонный энтузиаст', 'Кухонный энтузиаст', 'Кухонный энтузиаст',
    ])
    await expect(page.locator('.demo-friend-score').first()).toContainText('предмет')
  } finally {
    releaseFriends()
  }
})

test('failed titles leave the collection usable and can be retried', async ({ page }) => {
  await page.route('**/api/demo/title', (route) => route.fulfill({ status: 503, json: {} }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  await dismissLoginDay(page)
  await openTab(page, 'Друзья')

  await expect(page.locator('.demo-title-value')).toHaveText('Ваша коллекция')
  await expect(page.getByText('Титул пока недоступен')).toBeVisible()
  await expect(page.locator('.demo-friend-score').first()).toContainText('предмет')

  await page.route('**/api/demo/title', (route) => sendTitle(route, 'Кухонный энтузиаст'))
  await page.getByRole('button', { name: 'Обновить титул' }).click()
  await expect(page.locator('.demo-title-value')).toHaveText('Кухонный энтузиаст')
  await expect(page.getByText('Титул пока недоступен')).toHaveCount(0)

  await page.getByRole('button', { name: 'Открыть коллекцию', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Разделы профиля' })
    .getByRole('button', { name: 'Коллекция', exact: true })).toHaveAttribute('aria-current', 'page')
})
