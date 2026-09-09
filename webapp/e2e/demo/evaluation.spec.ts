import { expect, test } from '@playwright/test'

import { openStand, dismissLoginDay } from './stand'

test('X5 role reads compact economic evidence and can inspect the current decision', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await dismissLoginDay(page)
  await page.getByRole('button', { name: 'Show the challenge', exact: true }).click()
  await expect(page.getByRole('article', { name: 'Challenge card' })).toBeVisible()
  await openStand(page)
  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/demo/evaluation'))
  await page.getByRole('button', { name: 'For X5', exact: true }).click()
  const response = await responsePromise
  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body.synthetic).toBe(true)
  expect(body.primary.policy).toBe('sponsored_onboarding')
  expect(JSON.stringify(body).length).toBeLessThan(4000)
  expect(body.primary.runs).toBeUndefined()
  const panel = page.getByRole('region', { name: 'For X5', exact: true })
  await expect(panel.getByText('Funded first gift', { exact: true })).toBeVisible()
  await expect(panel.getByText('X5 net over 1,000 users after reserves', { exact: true })).toBeVisible()
  await expect(panel.getByText('Break-even CPA with reserves', { exact: true })).toBeVisible()
  await expect(panel.getByText(`${body.primary.conservative_positive_net_seeds} of ${body.primary.seed_count} seeds`, { exact: true })).toBeVisible()
  await expect(panel.getByText('Funding source', { exact: true })).toBeVisible()
  await expect(panel.getByText('Coupon / product reserves', { exact: true })).toBeVisible()
  await panel.getByText('Robustness check', { exact: true }).click()
  await expect(panel.getByText('Zero effect', { exact: false })).toBeVisible()
  await expect(panel.getByText('Negative effect', { exact: false })).toBeVisible()
})
