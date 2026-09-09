import { expect, test, type Route } from '@playwright/test'

import { openTab, dismissLoginDay } from './stand'

async function sendTitle(route: Route, title: string) {
  const request = route.request().postDataJSON()
  await route.fulfill({ json: {
    contract_version: 2,
    request_id: request.request_id,
    server_time_ms: request.now_ms,
    title,
    subtitle: 'Your collection of kitchen items',
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
    await sendTitle(route, 'Kitchen Enthusiast')
  })

  try {
    await page.goto('/')
    await page.getByRole('button', { name: 'Profile', exact: true }).click()
    await dismissLoginDay(page)
    await openTab(page, 'Friends')

    await expect(page.locator('.demo-title-value')).toHaveText('Kitchen Enthusiast')
    await expect(page.locator('.demo-friend-score').first()).toContainText('set')
    await expect(page.locator('.demo-friend-score').first()).toContainText('item')
    await expect(page.locator('.demo-friend-list')).not.toContainText('₽')
    await expect(page.getByText('Choosing a title for your collection')).toHaveCount(0)

    releaseFriends()
    await expect(page.locator('.demo-friend-title')).toHaveText([
      'Kitchen Enthusiast', 'Kitchen Enthusiast', 'Kitchen Enthusiast',
    ])
    await expect(page.locator('.demo-friend-score').first()).toContainText('item')
  } finally {
    releaseFriends()
  }
})

test('failed titles leave the collection usable and can be retried', async ({ page }) => {
  await page.route('**/api/demo/title', (route) => route.fulfill({ status: 503, json: {} }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await dismissLoginDay(page)
  await openTab(page, 'Friends')

  await expect(page.locator('.demo-title-value')).toHaveText('Your collection')
  await expect(page.getByText('The title is unavailable right now')).toBeVisible()
  await expect(page.locator('.demo-friend-score').first()).toContainText('item')

  await page.route('**/api/demo/title', (route) => sendTitle(route, 'Kitchen Enthusiast'))
  await page.getByRole('button', { name: 'Refresh the title' }).click()
  await expect(page.locator('.demo-title-value')).toHaveText('Kitchen Enthusiast')
  await expect(page.getByText('The title is unavailable right now')).toHaveCount(0)

  await page.getByRole('button', { name: 'Open the collection', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Profile sections' })
    .getByRole('button', { name: 'Collection', exact: true })).toHaveAttribute('aria-current', 'page')
})
