import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { expect, test, type Page } from '@playwright/test'

import { dismissLoginDay, openTab, prepareLoginBox, putItemIntoDiscountSlot } from '../../e2e/demo/stand'

/**
 * Frames are written raw into artifacts, and `build.mjs` turns them into WebP and GIF in
 * docs/assets. Selectors come from the shared e2e helpers: one source of truth keeps the capture
 * from lagging behind the code.
 */
const raw = fileURLToPath(new URL('../../e2e/.artifacts/docs-shots/raw/', import.meta.url))
const demoStateKey = 'pyaterochka_demo_challenge_state'
const activeDiscountStorageKey = 'pyaterochka_profile_active_discount'
mkdirSync(raw, { recursive: true })

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${raw}${name}.png`, animations: 'disabled' })

async function openProfile(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await dismissLoginDay(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible()
}

/** Documentation-only setup: give the active synthetic profile exactly the items being shown. */
async function seedInventory(page: Page, itemIds: readonly string[]) {
  await page.evaluate(({ storageKey, discountKey, ids }) => {
    const browser = globalThis as unknown as {
      localStorage: {
        getItem: (key: string) => string | null
        removeItem: (key: string) => void
        setItem: (key: string, value: string) => void
      }
    }
    const rawStore = browser.localStorage.getItem(storageKey)
    if (rawStore === null) throw new Error('Demo store is not initialized')
    const store = JSON.parse(rawStore) as {
      active_profile_id: string
      profiles: Record<string, {
        profile: {
          active_coupon: unknown
          inventory: { item_id: string; quantity: number }[]
        }
      }>
    }
    const quantities = new Map<string, number>()
    ids.forEach((id) => quantities.set(id, (quantities.get(id) ?? 0) + 1))
    store.profiles[store.active_profile_id].profile.inventory = [...quantities]
      .map(([item_id, quantity]) => ({ item_id, quantity }))
    store.profiles[store.active_profile_id].profile.active_coupon = null
    browser.localStorage.setItem(storageKey, JSON.stringify(store))
    browser.localStorage.removeItem(discountKey)
  }, { storageKey: demoStateKey, discountKey: activeDiscountStorageKey, ids: itemIds })
  await page.reload()
  await openProfile(page)
}

/**
 * A challenge is a separate request to the engine. While the app is still loading synthetic
 * profiles the press is silently ignored, so the click repeats until the card appears.
 */
async function showChallenge(page: Page) {
  const card = page.getByRole('article', { name: 'Challenge card' })
  const ask = page.getByRole('button', { name: 'Show the challenge' })
  await expect.poll(async () => {
    if (await card.count() > 0) return true
    if (await ask.count() > 0) await ask.first().click()
    return await card.count() > 0
  }, { timeout: 40_000, intervals: [700, 1_200, 2_000] }).toBe(true)
  await expect(card).toBeVisible()
  return card
}

test('captures the documentation images', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Loyalty card' })).toBeVisible()
  await page.waitForTimeout(600)
  await shot(page, 'home')

  await openProfile(page)
  const card = await showChallenge(page)
  await card.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await card.screenshot({ path: `${raw}challenge.png`, animations: 'disabled' })

  await openTab(page, 'Friends')
  const ranking = page.locator('.demo-progress')
  await expect(ranking.getByRole('heading', { name: "Friends' progress" })).toBeVisible()
  await page.waitForTimeout(400)
  await ranking.screenshot({ path: `${raw}friends.png`, animations: 'disabled' })

  await openTab(page, 'Challenges')
  await page.getByRole('button', { name: 'Demo stand', exact: true }).click()
  await page.getByRole('button', { name: 'For X5', exact: true }).click()
  const panel = page.getByRole('region', { name: 'For X5', exact: true })
  await expect(panel).toBeVisible()
  await page.waitForTimeout(600)
  await panel.screenshot({ path: `${raw}x5-panel.png`, animations: 'disabled' })
})

test('captures opening the box', async ({ page }) => {
  await openProfile(page)
  await prepareLoginBox(page)
  await page.getByRole('button', { name: 'Open the Pyaterochka box' }).click()
  const shakeTarget = page.getByRole('button', { name: 'Shake the box' })
  await expect(shakeTarget).toBeVisible()
  await page.waitForTimeout(800)

  await record(page, 'box', async () => {
    const box = await shakeTarget.boundingBox()
    if (box === null) return
    const centerY = box.y + box.height / 2
    await page.mouse.move(box.x + box.width / 2, centerY)
    await page.mouse.down()
    for (let move = 0; move < 14; move += 1) {
      await page.mouse.move(move % 2 === 0 ? box.x + 20 : box.x + box.width - 20, centerY, { steps: 4 })
      await page.waitForTimeout(35)
    }
    await page.mouse.up()
    await expect(page.getByRole('heading', { name: 'You got an item!' })).toBeVisible()
    await page.waitForTimeout(1_200)
    await shot(page, 'reward')
    // Collect the item inside the recording: the mascot celebrates after the dialog closes.
    await page.getByRole('button', { name: 'Collect', exact: true }).click()
    await page.waitForTimeout(1_600)
  })

  // The celebration lasts 2.6 seconds after the dialog closes — enough to capture the header.
  await shot(page, 'mascot')
})

test('captures dressing the mascot', async ({ page }) => {
  await openProfile(page)
  await seedInventory(page, ['baker-apron', 'chef-knife'])
  await openTab(page, 'Collection')

  await record(page, 'outfit', async () => {
    for (const itemName of ["Baker's Apron", "Chef's Knife"]) {
      const item = page.getByRole('button', { name: new RegExp(`^${itemName}, `) })
      await item.scrollIntoViewIfNeeded()
      await page.waitForTimeout(500)
      await item.click()
      const dialog = page.getByRole('dialog', { name: `Item "${itemName}"` })
      await expect(dialog).toBeVisible()
      await page.waitForTimeout(700)
      await dialog.getByRole('button', { name: 'Wear', exact: true }).click()
      await page.evaluate(() => {
        const browser = globalThis as unknown as {
          scrollTo: (options: { top: number; behavior: 'smooth' }) => void
        }
        browser.scrollTo({ top: 0, behavior: 'smooth' })
      })
      await expect(page.locator('.profile-character[data-dressed="true"]')).toBeVisible()
      await page.waitForTimeout(1_100)
    }
    await shot(page, 'outfit')
  })
})

test('captures multiple user-chosen discount recipes', async ({ page }) => {
  await openProfile(page)
  const recipes = [
    {
      title: 'Good Morning',
      items: ['Clubhouse Toaster', 'Milk Pitcher', 'Travel Mug', 'Breakfast Pan'],
      itemIds: ['club-toaster', 'milk-pitcher', 'travel-mug', 'breakfast-pan'],
    },
    {
      title: 'Asian Dinner',
      items: ['Sushi Kit', 'Dragon Wok', 'Royal Cauldron', "Chef's Knife"],
      itemIds: ['sushi-kit', 'dragon-wok', 'royal-cauldron', 'chef-knife'],
    },
    {
      title: 'Sweet Break',
      items: ["Baker's Apron", 'Barista Machine', 'Crystal Ice Cream Maker', 'Fruit Basket'],
      itemIds: ['baker-apron', 'barista-machine', 'crystal-icecream-maker', 'fruit-basket'],
    },
  ] as const

  await record(page, 'craft', async () => {
    for (const [recipeIndex, recipe] of recipes.entries()) {
      await seedInventory(page, recipe.itemIds)
      await openTab(page, 'Collection')
      await expect(page.getByRole('button', { name: 'Empty discount slot 1' })).toBeVisible()
      for (const [index, itemName] of recipe.items.entries()) {
        await putItemIntoDiscountSlot(page, itemName, index + 1)
        await page.waitForTimeout(140)
      }
      await expect(page.getByText(recipe.title, { exact: true })).toBeVisible()
      await page.waitForTimeout(650)
      if (recipeIndex === 0) await shot(page, 'collection')
      await page.getByRole('button', { name: /^Create a \d+% discount$/ }).click()
      const discount = page.getByRole('dialog', { name: 'Crafted discount' })
      await expect(discount).toBeVisible()
      await expect(discount.getByText(recipe.title, { exact: true })).toBeVisible()
      await page.waitForTimeout(1_050)
      if (recipeIndex === 0) await shot(page, 'discount')
    }
  })
})

type Frame = { data: Buffer; ts: number }

/** Records the screen through CDP: Playwright video is too soft an image for a GIF. */
async function record(page: Page, name: string, run: () => Promise<void>) {
  const target = `${raw}frames-${name}/`
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  const client = await page.context().newCDPSession(page)
  const frames: Frame[] = []
  client.on('Page.screencastFrame', (params) => {
    frames.push({ data: Buffer.from(params.data, 'base64'), ts: params.metadata.timestamp ?? 0 })
    client.send('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {})
  })
  await client.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 })
  await run()
  await client.send('Page.stopScreencast')
  frames.forEach((frame, index) => {
    writeFileSync(`${target}${String(index).padStart(4, '0')}.jpg`, frame.data)
  })
  writeFileSync(`${target}meta.json`, JSON.stringify(frames.map((frame) => frame.ts)))
  console.log(`${name}: ${frames.length} frames`)
}
