import { expect, test } from '@playwright/test'

import { openStand, standLog, dismissLoginDay } from './stand'

const demoStateKey = 'pyaterochka_demo_challenge_state'

type StoredCampaign = {
  campaign_id: string
  remaining_budget_kopecks: number
  reserved_kopecks: number
  settled_kopecks: number
  frequency_cap_14d: number
}

type StoredExposure = {
  exposure_id: string
  decision_id: string
  profile_id: string
  campaign_id: string
  shown_at_ms: number
  reserved_kopecks: number
  status: 'reserved' | 'billed' | 'released'
}

type StoredBilling = {
  profile_id: string
  challenge_id: string
  campaign_id: string
  advertiser_id: string
  amount_kopecks: number
  subsidy_kopecks: number
}

type StoredDemo = {
  active_profile_id: string
  profiles: Record<string, {
    profile: { profile_id: string }
    challenge: {
      challenge_id: string
      reward: { physical_sku: unknown }
      economics: {
        funding_source: string
        campaign_id: string
        advertiser_id: string
        bid_per_qualified_event_kopecks: number
        subsidy_kopecks: number
      }
    } | null
    decision: { decision_id: string; status: string; reason_codes: string[] } | null
  }>
  ads: { campaigns: StoredCampaign[]; exposures: StoredExposure[]; billings: StoredBilling[] }
  trades: unknown[]
  referral_awards: unknown[]
}

async function openProfile(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  await dismissLoginDay(page)
  await expect(page.getByRole('heading', { level: 2, name: 'Персональный челлендж' })).toBeVisible()
  await page.waitForFunction((key) => {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return false
    try {
      const store = JSON.parse(raw) as { ads?: { campaigns?: unknown[] } }
      return Array.isArray(store.ads?.campaigns) && store.ads.campaigns.length > 0
    } catch {
      return false
    }
  }, demoStateKey)
}

async function readStore(page: import('@playwright/test').Page) {
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? '{}') as StoredDemo, demoStateKey)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    if (window.sessionStorage.getItem('runtime-ads-cleared') === 'true') return
    window.localStorage.removeItem(key)
    window.sessionStorage.setItem('runtime-ads-cleared', 'true')
  }, demoStateKey)
})

test('the live Ads ledger reserves an impression, bills one CPA, survives reload, and ignores replay', async ({ page }) => {
  await openProfile(page)
  const initialStore = await readStore(page)
  await page.getByRole('button', { name: 'Показать задание', exact: true }).click()
  await expect(page.getByRole('article', { name: 'Карточка задания' })).toBeVisible()

  const afterDecision = await readStore(page)
  const state = afterDecision.profiles[afterDecision.active_profile_id]
  expect(state).toBeDefined()
  expect(state?.challenge).not.toBeNull()
  if (state?.challenge === null || state?.challenge === undefined || state.decision === null) return
  expect(state.challenge.reward.physical_sku).not.toBeNull()
  expect(state.challenge.economics.funding_source).toBe('advertiser')
  const exposure = afterDecision.ads.exposures.find(
    (row) => row.decision_id === state.decision?.decision_id,
  )
  expect(exposure).toMatchObject({
    profile_id: state.profile.profile_id,
    campaign_id: state.challenge.economics.campaign_id,
    status: 'reserved',
  })

  const campaignBefore = afterDecision.ads.campaigns.find(
    (row) => row.campaign_id === state.challenge?.economics.campaign_id,
  )
  expect(campaignBefore).toBeDefined()
  if (campaignBefore === undefined) return
  await openStand(page)
  await page.getByRole('button', { name: 'Оплаченная покупка нужной категории' }).click()
  await page.getByRole('dialog', { name: 'Награда за задание' }).getByRole('button', { name: 'Забрать' }).click()

  const afterBilling = await readStore(page)
  expect(afterBilling.ads.billings).toHaveLength(1)
  const billing = afterBilling.ads.billings[0]
  expect(billing).toMatchObject({
    profile_id: state.profile.profile_id,
    challenge_id: state.challenge.challenge_id,
    campaign_id: state.challenge.economics.campaign_id,
    advertiser_id: state.challenge.economics.advertiser_id,
    amount_kopecks: state.challenge.economics.bid_per_qualified_event_kopecks,
    subsidy_kopecks: state.challenge.economics.subsidy_kopecks,
  })
  const campaignAfterBilling = afterBilling.ads.campaigns.find(
    (row) => row.campaign_id === billing.campaign_id,
  )
  expect(campaignAfterBilling).toBeDefined()
  if (campaignAfterBilling === undefined) return
  const settled = billing.amount_kopecks + billing.subsidy_kopecks
  expect(campaignAfterBilling.remaining_budget_kopecks).toBe(
    campaignBefore.remaining_budget_kopecks - settled,
  )
  expect(campaignAfterBilling.reserved_kopecks).toBe(
    campaignBefore.reserved_kopecks - settled,
  )
  expect(campaignAfterBilling.settled_kopecks).toBe(
    campaignBefore.settled_kopecks + settled,
  )
  expect(afterBilling.ads.exposures.find(
    (row) => row.exposure_id === exposure.exposure_id,
  )?.status).toBe('billed')

  await page.getByRole('button', { name: 'Тот же чек ещё раз' }).click()
  await expect(standLog(page)).toContainText('duplicate')
  const afterReplay = await readStore(page)
  expect(afterReplay.ads.billings).toEqual(afterBilling.ads.billings)
  expect(afterReplay.ads.campaigns).toEqual(afterBilling.ads.campaigns)

  await page.reload()
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  await dismissLoginDay(page)
  await openStand(page)
  await page.getByRole('button', { name: 'Для X5', exact: true }).click()
  const panel = page.getByRole('region', { name: 'Для X5', exact: true })
  await expect(panel.getByText('Кампания Ads', { exact: true })).toBeVisible()
  await expect(panel.getByText('CPA начислено', { exact: true })).toBeVisible()
  await expect(panel.getByText('Доступный бюджет кампании', { exact: true })).toBeVisible()
  await expect(panel.getByText('Резерв кампании / статус показа', { exact: true })).toBeVisible()
  await expect(panel.getByText('Частота показов за 14 дней', { exact: true })).toBeVisible()
  const cpaValue = panel.locator('dt').filter({ hasText: 'CPA начислено' }).locator('xpath=following-sibling::dd')
  const billedRubles = `${(billing.amount_kopecks / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`
  await expect(cpaValue).toHaveText(billedRubles)

  await page.getByRole('button', { name: 'Закрыть панель X5' }).click()
  await page.getByRole('button', { name: 'Полный сброс демо', exact: true }).click()
  await page.getByRole('button', { name: 'Для X5', exact: true }).click()
  await expect(cpaValue).toHaveText('0 ₽')
  const reset = await readStore(page)
  expect(reset.ads.billings).toEqual([])
  expect(reset.ads.exposures).toEqual([])
  expect(reset.trades).toEqual([])
  expect(reset.referral_awards).toEqual([])
  expect(Object.values(reset.profiles).every((profile) => profile.challenge === null)).toBe(true)
  expect(reset.ads.campaigns).toEqual(initialStore.ads.campaigns)
})

test('exhausted live campaign budgets produce no_action before a first physical promise is shown', async ({ page }) => {
  await openProfile(page)
  await page.evaluate((key) => {
    const store = JSON.parse(window.localStorage.getItem(key) ?? '{}') as StoredDemo
    for (const campaign of store.ads.campaigns) {
      campaign.remaining_budget_kopecks = 0
      campaign.reserved_kopecks = 0
    }
    window.localStorage.setItem(key, JSON.stringify(store))
  }, demoStateKey)
  await page.reload()
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  await dismissLoginDay(page)
  await page.getByRole('button', { name: 'Показать задание', exact: true }).click()

  await expect(page.getByRole('article', { name: 'Карточка задания' })).toHaveCount(0)
  await expect(page.getByText('Пока нет подходящего задания', { exact: false })).toBeVisible()
  await openStand(page)
  await expect(page.locator('.demo-diagnostics')).toContainText('ads_budget_insufficient')
  await page.getByRole('button', { name: 'Для X5', exact: true }).click()
  const panel = page.getByRole('region', { name: 'Для X5', exact: true })
  const campaignValue = panel.locator('dt').filter({ hasText: 'Кампания Ads' }).locator('xpath=following-sibling::dd')
  await expect(campaignValue).toHaveText('Нет активного задания')
  const store = await readStore(page)
  const state = store.profiles[store.active_profile_id]
  expect(state?.challenge).toBeNull()
  expect(state?.decision?.status).toBe('no_action')
  expect(state?.decision?.reason_codes).toContain('ads_budget_insufficient')
})

test('frequency-capped campaigns produce no_action for that profile', async ({ page }) => {
  await openProfile(page)
  await page.evaluate((key) => {
    const store = JSON.parse(window.localStorage.getItem(key) ?? '{}') as StoredDemo
    const profileId = store.active_profile_id
    for (const campaign of store.ads.campaigns) {
      for (let impression = 0; impression < campaign.frequency_cap_14d; impression += 1) {
        store.ads.exposures.push({
          exposure_id: `exp-e2e-${campaign.campaign_id}-${impression}`,
          decision_id: `dec-e2e-${campaign.campaign_id}-${impression}`,
          profile_id: profileId,
          campaign_id: campaign.campaign_id,
          shown_at_ms: Date.now() - impression * 1_000,
          reserved_kopecks: 0,
          status: 'billed',
        })
      }
    }
    window.localStorage.setItem(key, JSON.stringify(store))
  }, demoStateKey)
  await page.reload()
  await page.getByRole('button', { name: 'Профиль', exact: true }).click()
  await dismissLoginDay(page)
  await page.getByRole('button', { name: 'Показать задание', exact: true }).click()

  await expect(page.getByRole('article', { name: 'Карточка задания' })).toHaveCount(0)
  await expect(page.getByText('Пока нет подходящего задания', { exact: false })).toBeVisible()
  await openStand(page)
  await expect(page.locator('.demo-diagnostics')).toContainText('ads_frequency_cap')
  const store = await readStore(page)
  const state = store.profiles[store.active_profile_id]
  expect(state?.challenge).toBeNull()
  expect(state?.decision?.status).toBe('no_action')
  expect(state?.decision?.reason_codes).toContain('ads_frequency_cap')
})
